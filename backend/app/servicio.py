"""Casos de uso del contrato v1. La IA no guarda sola: confirmar es obligatorio."""

from __future__ import annotations

import hmac
import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta

from . import tiempo
from .config import config
from .datos import PERSONAL, almacen, hash_pin, verificar_pin
from .dpi import es_identificador_temporal, generar_identificador_temporal, validar_cui
from .errores import MENSAJES, ErrorSigo, error
from .extraccion import normalizar_extraccion
from .modulos.cargador import modulos
from .modulos.interfaces import CODIGOS_ERROR, ErrorModulo
from .seguridad import (
    _materializar_personal,
    exigir_libre,
    fallo_pin,
    rechazar_si_emergencia,
    usuario_publico,
)

log = logging.getLogger("sigo.sms")
_ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_FICHA_PUBLICA = ("id", "paciente_id", "client_id", "estado", "imagenes", "extraccion", "error", "creada_en")
_CAMPOS_PACIENTE = ("nombre", "fecha_nacimiento", "sexo", "comunidad", "alergias", "condiciones_cronicas")
_CAMPOS_CONSULTA = ("fecha", "motivo", "diagnostico", "tratamiento", "vacunas")


def traducir_modulo(exc: Exception) -> None:
    codigo = getattr(exc, "codigo", None)
    if codigo in CODIGOS_ERROR:
        status, codigo_contrato = CODIGOS_ERROR[codigo]
        raise error(status, codigo_contrato, str(exc)) from exc
    raise exc


def _firma(archivo_id: str, exp: int) -> str:
    msg = f"{archivo_id}.{exp}".encode()
    return hmac.new(config().sigo_secret.encode(), msg, hashlib.sha256).hexdigest()[:32]


def url_firmada(archivo_id: str) -> str:
    exp = int(tiempo.ahora().timestamp()) + 2 * 3600
    base = config().sigo_public_api_url.rstrip("/")
    return f"{base}/api/v1/archivos/{archivo_id}?exp={exp}&sig={_firma(archivo_id, exp)}"


def guardar_bytes(contenido: bytes, media: str) -> str:
    archivo_id = almacen.nuevo_id("img")
    almacen.archivos[archivo_id] = (contenido, media)
    return url_firmada(archivo_id)


def leer_archivo_firmado(archivo_id: str, exp: str, sig: str) -> tuple[bytes, str]:
    try:
        exp_int = int(exp)
    except (TypeError, ValueError):
        raise error(400, "validacion", "La URL del archivo no es válida.")
    if exp_int < int(tiempo.ahora().timestamp()):
        raise error(400, "validacion", "La URL del archivo venció.")
    if not hmac.compare_digest(_firma(archivo_id, exp_int), sig or ""):
        raise error(400, "validacion", "La URL del archivo no es válida.")
    guardado = almacen.archivos.get(archivo_id)
    if not guardado:
        raise error(404, "no_existe", MENSAJES["no_existe"])
    return guardado


def ficha_publica(ficha: dict) -> dict:
    return {clave: ficha[clave] for clave in _FICHA_PUBLICA}


def _actor(usuario: dict) -> dict:
    return {"id": usuario["id"], "nombre": usuario["nombre"], "centro_id": usuario.get("centro_id")}


def _centro_usuario(usuario: dict) -> str | None:
    if usuario.get("centro_id"):
        return usuario["centro_id"]
    centro = usuario.get("centro") or {}
    return centro.get("id")


def enfermera_alcanza(usuario: dict, paciente_id: str) -> bool:
    """S-09. Lo más chico que no rompe el demo ni el contrato de Phil.

    La enfermera ve el expediente completo (Phil: para corregir) solo si el
    paciente es de su puesto, si tiene una consulta en ese puesto, o si ella
    misma lo atendió (editada_por). El código temporal del médico no abre
    este alcance: ese consentimiento es de otro rol.
    """
    if usuario.get("rol") != "enfermera":
        return False
    centro = _centro_usuario(usuario)
    nombre = (usuario.get("nombre") or "").strip()
    meta = almacen.pacientes_meta.get(paciente_id) or {}
    if centro and meta.get("centro_id") == centro:
        return True
    for consulta in almacen.consultas_de(paciente_id):
        if centro and (consulta.get("centro") or {}).get("id") == centro:
            return True
        if nombre and consulta.get("editada_por") == nombre:
            return True
    return False


def exigir_centro_enfermera(usuario: dict, paciente_id: str) -> None:
    if usuario.get("rol") != "enfermera":
        return
    if enfermera_alcanza(usuario, paciente_id):
        return
    almacen.anotar_bitacora(
        {
            "tipo": "acceso_denegado",
            "actor_id": usuario["id"],
            "paciente_id": paciente_id,
            "rol": "enfermera",
        }
    )
    raise error(403, "rol_no_permitido", "Este expediente no es de tu centro.")


def clave_pin(dpi: str) -> str:
    texto = (dpi or "").strip()
    if es_identificador_temporal(texto):
        return texto.upper()
    from .dpi import normalizar_cui

    return normalizar_cui(texto) or texto


def _fecha(valor: str | None) -> str | None:
    if valor is None or valor == "":
        return None
    try:
        datetime.strptime(valor, "%Y-%m-%d")
    except ValueError:
        raise error(400, "validacion", "La fecha debe ser YYYY-MM-DD.")
    return valor


def _paciente_o_404(pid: str) -> dict:
    paciente = almacen.paciente(pid)
    if not paciente:
        raise error(404, "no_existe", MENSAJES["no_existe"])
    return paciente


def resolver_dpi_nuevo(dpi: str | None) -> str:
    if dpi is None or str(dpi).strip() == "":
        return generar_identificador_temporal(tiempo.ahora().date(), almacen.dpis())
    texto = str(dpi).strip()
    if es_identificador_temporal(texto):
        return texto.upper()
    resultado = validar_cui(texto, verificador_estricto=config().sigo_dpi_verificador_estricto)
    if not resultado.valido or not resultado.cui:
        mensaje = resultado.errores[0] if resultado.errores else MENSAJES["dpi_invalido"]
        raise error(400, "dpi_invalido", mensaje)
    return resultado.cui


def buscar_paciente_por_dpi(dpi: str) -> dict:
    texto = (dpi or "").strip()
    if not texto:
        raise error(400, "validacion", "Falta el DPI.")
    if es_identificador_temporal(texto):
        paciente = almacen.paciente_por_dpi(texto.upper())
    else:
        resultado = validar_cui(texto, verificador_estricto=config().sigo_dpi_verificador_estricto)
        if not resultado.valido or not resultado.cui:
            mensaje = resultado.errores[0] if resultado.errores else MENSAJES["dpi_invalido"]
            raise error(400, "dpi_invalido", mensaje)
        paciente = almacen.paciente_por_dpi(resultado.cui)
    if not paciente:
        raise error(404, "no_existe", MENSAJES["no_existe"])
    return paciente


def _duracion_acceso() -> timedelta:
    if config().sigo_modo_demo:
        return timedelta(minutes=2)
    return timedelta(hours=2)


def _generar_pin() -> str:
    return f"{secrets.randbelow(900000) + 100000}"


def _nuevo_codigo() -> str:
    for _ in range(8):
        cuerpo = "".join(secrets.choice(_ALFABETO_CODIGO) for _ in range(8))
        codigo = f"{cuerpo[:4]}-{cuerpo[4:]}"
        if codigo not in almacen.codigos:
            return codigo
    raise error(503, "ia_no_disponible", "No se pudo generar un código. Intentá de nuevo.")


def autenticar_paciente(dpi: str, pin: str) -> dict:
    clave = clave_pin(dpi)
    exigir_libre("pin", clave)
    if not isinstance(pin, str) or not re.fullmatch(r"\d{4,6}", pin):
        raise fallo_pin(clave)
    try:
        paciente = buscar_paciente_por_dpi(dpi)
    except ErrorSigo as exc:
        if exc.detail["error"]["codigo"] in {"no_existe", "dpi_invalido", "validacion"}:
            raise fallo_pin(clave) from exc
        raise
    meta = almacen.pacientes_meta[paciente["id"]]
    if not verificar_pin(pin, meta["pin_hash"]):
        raise fallo_pin(clave)
    almacen.limpiar_fallos("pin", clave)
    vence = tiempo.ahora() + timedelta(hours=12)
    token = almacen.crear_sesion({"id": paciente["id"], "rol": "paciente"}, vence)
    return {"token": token, "vence_en": tiempo.iso(vence), "paciente_id": paciente["id"]}


def _paciente_de_busqueda(paciente: dict, emergencia: bool) -> dict:
    """Misma forma de Paciente. Fuera de emergencia las alertas van vacías."""
    if emergencia:
        return paciente
    visible = dict(paciente)
    visible["alergias"] = []
    visible["condiciones_cronicas"] = []
    return visible


def buscar(usuario: dict, dpi: str, emergencia: bool = False) -> dict:
    if usuario["rol"] != "enfermera":
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    texto = (dpi or "").strip()
    if not texto:
        return {"pacientes": []}
    if es_identificador_temporal(texto):
        paciente = almacen.paciente_por_dpi(texto.upper())
    else:
        from .dpi import normalizar_cui

        cui = normalizar_cui(texto)
        paciente = almacen.paciente_por_dpi(cui) if len(cui) == 13 else almacen.paciente_por_dpi(texto)
    # Phil: 200 con el paciente si el DPI existe, o lista vacía si no. No es 403 ni 409.
    if not paciente:
        return {"pacientes": []}
    return {"pacientes": [_paciente_de_busqueda(paciente, emergencia)]}


def crear_paciente(usuario: dict, datos: dict) -> dict:
    if usuario["rol"] != "enfermera":
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    nombre = (datos.get("nombre") or "").strip()
    if not nombre:
        raise error(400, "validacion", "Falta el nombre.")
    dpi = resolver_dpi_nuevo(datos.get("dpi"))
    if almacen.paciente_por_dpi(dpi):
        raise error(409, "dpi_ya_existe", MENSAJES["dpi_ya_existe"])
    pin = _generar_pin()
    paciente = almacen.crear_paciente(
        {
            "dpi": dpi,
            "nombre": nombre,
            "fecha_nacimiento": _fecha(datos.get("fecha_nacimiento")),
            "sexo": datos.get("sexo"),
            "comunidad": datos.get("comunidad"),
            "alergias": [],
            "condiciones_cronicas": [],
        },
        telefono=datos.get("telefono"),
        pin=pin,
        debe_cambiar_pin=True,
        centro_id=usuario.get("centro_id"),
    )
    almacen.anotar_bitacora({"tipo": "alta_paciente", "actor_id": usuario["id"], "paciente_id": paciente["id"]})
    return {"paciente": paciente, "pin_inicial": pin}


def _guardar_ficha(ficha: dict) -> dict:
    almacen.fichas[ficha["id"]] = ficha
    if ficha.get("client_id"):
        almacen.fichas_por_client_id[ficha["client_id"]] = ficha["id"]
    return ficha


def subir_ficha(usuario: dict, paciente_id: str, client_id: str, capturada_en: str | None, imagenes: list[bytes]) -> dict:
    if usuario["rol"] != "enfermera":
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    if not (client_id or "").strip():
        raise error(400, "validacion", "Falta client_id.")
    _paciente_o_404(paciente_id)
    exigir_centro_enfermera(usuario, paciente_id)
    previo = almacen.fichas_por_client_id.get(client_id)
    if previo:
        return ficha_publica(almacen.fichas[previo])
    try:
        extraccion = modulos().vision.extraer_ficha(imagenes)
    except ErrorModulo as exc:
        traducir_modulo(exc)
    extraccion = normalizar_extraccion(extraccion)
    if extraccion.get("error"):
        almacen.anotar_bitacora(
            {
                "tipo": "lectura_ilegible",
                "actor_id": usuario["id"],
                "paciente_id": paciente_id,
                "client_id": client_id,
                "error": extraccion["error"],
            }
        )
        raise error(422, "ilegible", str(extraccion["error"]))
    urls = [guardar_bytes(blob, "image/jpeg") for blob in imagenes]
    ahora_iso = tiempo.iso(tiempo.ahora())
    ficha = _guardar_ficha(
        {
            "id": almacen.nuevo_id("f"),
            "paciente_id": paciente_id,
            "client_id": client_id,
            "estado": "lista",
            "imagenes": urls,
            "extraccion": extraccion,
            "error": None,
            "creada_en": ahora_iso,
            "capturada_en": capturada_en,
            "archivo_url": None,
            "eventos": [{"estado": "lista", "en": ahora_iso}],
        }
    )
    return ficha_publica(ficha)


def obtener_ficha(usuario: dict, ficha_id: str) -> dict:
    if usuario["rol"] != "enfermera":
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    ficha = almacen.fichas.get(ficha_id)
    if not ficha:
        raise error(404, "no_existe", MENSAJES["no_existe"])
    exigir_centro_enfermera(usuario, ficha["paciente_id"])
    return ficha_publica(ficha)


def _original_de(ficha: dict, pagina: int) -> str:
    imagenes = ficha.get("imagenes") or []
    if imagenes:
        if 0 <= pagina < len(imagenes):
            return imagenes[pagina]
        return imagenes[0]
    return ficha.get("archivo_url") or ""


def confirmar(usuario: dict, ficha_id: str, cuerpo: dict) -> dict:
    if usuario["rol"] != "enfermera":
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    ficha = almacen.fichas.get(ficha_id)
    if not ficha:
        raise error(404, "no_existe", MENSAJES["no_existe"])
    exigir_centro_enfermera(usuario, ficha["paciente_id"])
    if ficha["estado"] == "confirmada":
        raise error(409, "ficha_ya_confirmada", MENSAJES["ficha_ya_confirmada"])
    extraccion = ficha.get("extraccion") or {}
    if ficha["estado"] == "error" or extraccion.get("error") or ficha.get("error"):
        raise error(422, "ilegible", MENSAJES["ilegible"])
    if cuerpo.get("consentimiento") is not True:
        raise error(400, "sin_consentimiento", MENSAJES["sin_consentimiento"])
    paciente = _paciente_o_404(ficha["paciente_id"])
    datos_paciente = cuerpo.get("paciente") or {}
    if "dpi" in datos_paciente:
        raise error(400, "validacion", "El DPI no se corrige al confirmar.")
    cambios = {}
    for campo in _CAMPOS_PACIENTE:
        if campo not in datos_paciente:
            continue
        valor = datos_paciente[campo]
        if valor is None and campo in {"alergias", "condiciones_cronicas", "sexo", "comunidad", "fecha_nacimiento"}:
            valor = [] if campo in {"alergias", "condiciones_cronicas"} else None
        if campo == "fecha_nacimiento":
            valor = _fecha(valor)
        if campo == "nombre" and not (valor or "").strip():
            raise error(400, "validacion", "El nombre no puede quedar vacío.")
        if valor != paciente.get(campo):
            cambios[campo] = valor.strip() if isinstance(valor, str) else valor
    if cambios:
        almacen.nueva_version_paciente(paciente["id"], cambios)
        paciente = almacen.paciente(paciente["id"])
    if not usuario.get("centro"):
        raise error(400, "validacion", "La enfermera no tiene un centro asignado.")
    creadas = []
    originales = []
    for consulta in cuerpo.get("consultas") or []:
        pagina = int(consulta.get("pagina") or 0)
        original = _original_de(ficha, pagina)
        creada = almacen.crear_consulta(
            paciente["id"],
            {
                "fecha": _fecha(consulta.get("fecha")),
                "centro": dict(usuario["centro"]),
                "motivo": consulta.get("motivo"),
                "diagnostico": consulta.get("diagnostico"),
                "tratamiento": consulta.get("tratamiento"),
                "vacunas": list(consulta.get("vacunas") or []),
                "original_url": original,
                "editada_por": usuario["nombre"],
                "editada_en": tiempo.iso(tiempo.ahora()),
            },
        )
        creadas.append(creada["id"])
        originales.append(original)
    ahora_iso = tiempo.iso(tiempo.ahora())
    ficha.setdefault("eventos", []).append({"estado": "confirmada", "en": ahora_iso})
    ficha["estado"] = "confirmada"
    almacen.anotar_bitacora(
        {
            "tipo": "confirmacion",
            "actor_id": usuario["id"],
            "paciente_id": paciente["id"],
            "ficha_id": ficha["id"],
            "version_paciente": paciente["version"],
            "consultas": creadas,
            "originales": originales,
        }
    )
    return {"consultas_creadas": len(creadas), "version": 1}


def corregir_consulta(usuario: dict, consulta_id: str, cuerpo: dict) -> dict:
    if usuario["rol"] != "enfermera":
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    actual = almacen.consulta(consulta_id)
    if not actual:
        raise error(404, "no_existe", MENSAJES["no_existe"])
    pid = almacen.paciente_de_consulta(consulta_id)
    if not pid:
        raise error(404, "no_existe", MENSAJES["no_existe"])
    exigir_centro_enfermera(usuario, pid)
    motivo = (cuerpo.get("motivo_cambio") or "").strip()
    if not motivo:
        raise error(400, "validacion", "Falta el motivo del cambio.")
    cambios = {}
    for campo in _CAMPOS_CONSULTA:
        if campo not in cuerpo:
            continue
        valor = cuerpo[campo]
        if campo == "fecha":
            valor = _fecha(valor)
        if campo == "vacunas" and valor is None:
            continue
        if valor != actual.get(campo):
            cambios[campo] = valor
    if not cambios:
        raise error(400, "validacion", "No hay cambios para guardar.")
    nueva = almacen.nueva_version_consulta(consulta_id, cambios, motivo, usuario["nombre"])
    almacen.anotar_bitacora(
        {
            "tipo": "correccion_consulta",
            "actor_id": usuario["id"],
            "paciente_id": almacen.paciente_de_consulta(consulta_id),
            "consulta_id": consulta_id,
            "version": nueva["version"],
            "motivo_cambio": motivo,
            "original_url": nueva["original_url"],
        }
    )
    return nueva


def corregir_paciente(usuario: dict, paciente_id: str, cuerpo: dict) -> dict:
    if usuario["rol"] != "enfermera":
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    actual = _paciente_o_404(paciente_id)
    exigir_centro_enfermera(usuario, paciente_id)
    if "dpi" in cuerpo:
        raise error(400, "validacion", "El DPI no se corrige desde la app.")
    motivo = (cuerpo.get("motivo_cambio") or "").strip()
    if not motivo:
        raise error(400, "validacion", "Falta el motivo del cambio.")
    cambios = {}
    for campo in _CAMPOS_PACIENTE:
        if campo not in cuerpo:
            continue
        valor = cuerpo[campo]
        if campo == "fecha_nacimiento":
            valor = _fecha(valor)
        if campo == "nombre" and valor is not None and not str(valor).strip():
            raise error(400, "validacion", "El nombre no puede quedar vacío.")
        if valor != actual.get(campo):
            cambios[campo] = valor
    if not cambios:
        raise error(400, "validacion", "No hay cambios para guardar.")
    nuevo = almacen.nueva_version_paciente(paciente_id, cambios)
    almacen.anotar_bitacora(
        {
            "tipo": "correccion_paciente",
            "actor_id": usuario["id"],
            "paciente_id": paciente_id,
            "version": nuevo["version"],
            "motivo_cambio": motivo,
        }
    )
    return nuevo


def _armar_expediente(usuario: dict, pid: str, acceso: dict | None) -> dict:
    paciente = _paciente_o_404(pid)
    tipo = None
    vence = None
    if usuario["rol"] == "medico" and acceso:
        tipo = acceso["tipo"]
        vence = tiempo.iso(acceso["hasta"])
    consultas = [] if tipo == "emergencia" else almacen.consultas_de(pid)
    return {
        "paciente": paciente,
        "alertas": {
            "alergias": list(paciente["alergias"]),
            "condiciones_cronicas": list(paciente["condiciones_cronicas"]),
            "medicamentos": [],
        },
        "consultas": consultas,
        "acceso_vence_en": vence,
        "tipo_acceso": tipo,
    }


def ver_expediente(usuario: dict, paciente_id: str) -> dict:
    _paciente_o_404(paciente_id)
    acceso = None
    if usuario["rol"] == "paciente":
        if usuario["paciente_id"] != paciente_id:
            raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    elif usuario["rol"] == "enfermera":
        exigir_centro_enfermera(usuario, paciente_id)
        momento = tiempo.ahora()
        almacen.registrar_acceso(
            paciente_id=paciente_id,
            actor=_actor(usuario),
            tipo="enfermera",
            motivo=None,
            desde=momento,
            hasta=momento,
        )
        almacen.anotar_bitacora(
            {
                "tipo": "lectura_expediente",
                "actor_id": usuario["id"],
                "paciente_id": paciente_id,
                "rol": "enfermera",
            }
        )
    elif usuario["rol"] == "medico":
        acceso = almacen.acceso_vigente(usuario["id"], paciente_id)
        if not acceso:
            raise error(403, "acceso_vencido", MENSAJES["acceso_vencido"])
    else:
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    return _armar_expediente(usuario, paciente_id, acceso)


def ver_versiones(usuario: dict, consulta_id: str) -> dict:
    pid = almacen.paciente_de_consulta(consulta_id)
    if not pid:
        raise error(404, "no_existe", MENSAJES["no_existe"])
    # Antes de armar el historial: el acceso de emergencia no llega al módulo de datos de versiones.
    rechazar_si_emergencia(usuario, pid)
    if usuario["rol"] == "paciente":
        if usuario["paciente_id"] != pid:
            raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    elif usuario["rol"] == "medico":
        acceso = almacen.acceso_vigente(usuario["id"], pid, ("codigo",))
        if not acceso:
            raise error(403, "acceso_vencido", MENSAJES["acceso_vencido"])
    elif usuario["rol"] == "enfermera":
        exigir_centro_enfermera(usuario, pid)
    else:
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    return {"versiones": almacen.versiones_consulta(consulta_id)}


def exportar_expediente(usuario: dict, paciente_id: str, formato: str) -> tuple[bytes, str, str]:
    _paciente_o_404(paciente_id)
    # Antes del módulo de exportación.
    # Phil, endpoint 12: solo la paciente descarga. La enfermera no exporta,
    # ni siquiera el expediente de su centro (S-09 no abre este permiso).
    rechazar_si_emergencia(usuario, paciente_id)
    if usuario["rol"] == "enfermera":
        almacen.anotar_bitacora(
            {
                "tipo": "acceso_denegado",
                "actor_id": usuario["id"],
                "paciente_id": paciente_id,
                "rol": "enfermera",
                "via": "exportar",
            }
        )
    if usuario["rol"] != "paciente" or usuario["paciente_id"] != paciente_id:
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    expediente = _armar_expediente(usuario, paciente_id, None)
    try:
        return modulos().exportar.exportar(expediente, formato)
    except ErrorModulo as exc:
        traducir_modulo(exc)
        raise


def crear_codigo(usuario: dict, paciente_id: str, enviar_sms: bool) -> dict:
    if usuario["rol"] == "paciente" and usuario["paciente_id"] != paciente_id:
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    if usuario["rol"] not in {"paciente", "enfermera"}:
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    _paciente_o_404(paciente_id)
    exigir_centro_enfermera(usuario, paciente_id)
    codigo = _nuevo_codigo()
    vence = tiempo.ahora() + timedelta(minutes=10)
    meta = almacen.pacientes_meta[paciente_id]
    enviado = False
    if enviar_sms and meta.get("telefono") and config().sigo_sms == "simulado":
        log.info("SMS simulado al teléfono registrado del paciente %s", paciente_id)
        enviado = True
    almacen.codigos[codigo] = {
        "codigo": codigo,
        "paciente_id": paciente_id,
        "vence": vence,
        "usado": False,
        "emitido_por": usuario["id"],
    }
    almacen.anotar_bitacora(
        {"tipo": "codigo_emitido", "actor_id": usuario["id"], "paciente_id": paciente_id, "rol": usuario["rol"]}
    )
    return {
        "codigo": codigo,
        "qr": f"{config().sigo_public_app_url.rstrip('/')}/c/{codigo}",
        "vence_en": tiempo.iso(vence),
        "enviado_por_sms": enviado,
    }


def canjear(usuario: dict, codigo: str) -> dict:
    if usuario["rol"] != "medico":
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    exigir_libre("canje", usuario["id"])
    clave = (codigo or "").strip().upper()
    registro = almacen.codigos.get(clave)
    if not registro or registro["usado"] or registro["vence"] <= tiempo.ahora():
        if almacen.anotar_fallo("canje", usuario["id"]):
            raise error(429, "demasiados_intentos", MENSAJES["demasiados_intentos"])
        if not registro:
            raise error(400, "validacion", "El código no es válido.")
        if registro["usado"]:
            raise error(409, "codigo_ya_usado", MENSAJES["codigo_ya_usado"])
        raise error(410, "codigo_vencido", MENSAJES["codigo_vencido"])
    registro["usado"] = True
    almacen.limpiar_fallos("canje", usuario["id"])
    desde = tiempo.ahora()
    hasta = desde + _duracion_acceso()
    almacen.registrar_acceso(
        paciente_id=registro["paciente_id"],
        actor=_actor(usuario),
        tipo="codigo",
        motivo=None,
        desde=desde,
        hasta=hasta,
    )
    return {"paciente_id": registro["paciente_id"], "acceso_vence_en": tiempo.iso(hasta)}


def preguntar(usuario: dict, paciente_id: str, pregunta: str) -> dict:
    if usuario["rol"] != "medico":
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    _paciente_o_404(paciente_id)
    if not (pregunta or "").strip():
        raise error(400, "validacion", "Falta la pregunta.")
    # Antes del asistente (CAG).
    rechazar_si_emergencia(usuario, paciente_id)
    acceso = almacen.acceso_vigente(usuario["id"], paciente_id, ("codigo",))
    if not acceso:
        raise error(403, "acceso_vencido", MENSAJES["acceso_vencido"])
    expediente = _armar_expediente(usuario, paciente_id, acceso)
    try:
        respuesta = modulos().cag.preguntar(expediente, pregunta.strip())
    except ErrorModulo as exc:
        traducir_modulo(exc)
        raise
    acceso["preguntas_hechas"] += 1
    return respuesta


def ver_accesos(usuario: dict, paciente_id: str) -> dict:
    if usuario["rol"] != "paciente" or usuario["paciente_id"] != paciente_id:
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    _paciente_o_404(paciente_id)
    return {"accesos": almacen.accesos_de(paciente_id)}


def cambiar_pin(usuario: dict, pin_actual: str, pin_nuevo: str) -> None:
    if usuario["rol"] != "paciente" or not usuario.get("paciente_id"):
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    if not re.fullmatch(r"\d{4,6}", pin_nuevo or ""):
        raise error(400, "validacion", "El PIN nuevo tiene de 4 a 6 dígitos.")
    paciente = _paciente_o_404(usuario["paciente_id"])
    clave = clave_pin(paciente["dpi"])
    exigir_libre("pin", clave)
    meta = almacen.pacientes_meta[paciente["id"]]
    if not isinstance(pin_actual, str) or not verificar_pin(pin_actual, meta["pin_hash"]):
        raise fallo_pin(clave)
    meta["pin_hash"] = hash_pin(pin_nuevo)
    meta["debe_cambiar_pin"] = False
    almacen.limpiar_fallos("pin", clave)


def emergencia(usuario: dict, dpi: str, motivo: str) -> dict:
    if usuario["rol"] != "medico":
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    texto = (motivo or "").strip()
    if len(texto) < 10:
        raise error(400, "validacion", "El motivo de la emergencia debe tener al menos 10 caracteres.")
    paciente = buscar_paciente_por_dpi(dpi)
    desde = tiempo.ahora()
    hasta = desde + timedelta(hours=1)
    almacen.registrar_acceso(
        paciente_id=paciente["id"],
        actor=_actor(usuario),
        tipo="emergencia",
        motivo=texto,
        desde=desde,
        hasta=hasta,
    )
    almacen.anotar_bitacora(
        {
            "tipo": "emergencia",
            "actor_id": usuario["id"],
            "paciente_id": paciente["id"],
            "motivo": texto,
        }
    )
    return {
        "paciente_id": paciente["id"],
        "acceso_vence_en": tiempo.iso(hasta),
        "tipo_acceso": "emergencia",
    }


def _dpi_de_extraccion(extr: dict) -> str | None:
    valor = (extr.get("paciente") or {}).get("dpi", {}).get("valor")
    if isinstance(valor, str) and valor.isdigit() and len(valor) == 13:
        return valor
    if isinstance(valor, str) and es_identificador_temporal(valor):
        return valor.upper()
    return None


def _vincular_fila(extr: dict, paciente_id_form: str | None, centro_id: str | None) -> tuple[str, str, str]:
    dpi = _dpi_de_extraccion(extr)
    if dpi:
        existente = almacen.paciente_por_dpi(dpi)
        if existente:
            return existente["id"], "actualizado", existente["dpi"]
        paciente_extr = extr["paciente"]
        nombre = paciente_extr["nombre"]["valor"] or "Pendiente de confirmación"
        fecha = paciente_extr["fecha_nacimiento"]["valor"]
        try:
            fecha = _fecha(fecha) if fecha else None
        except ErrorSigo:
            fecha = None
        sexo = paciente_extr["sexo"]["valor"]
        if sexo not in {"F", "M"}:
            sexo = None
        creado = almacen.crear_paciente(
            {
                "dpi": dpi,
                "nombre": nombre,
                "fecha_nacimiento": fecha,
                "sexo": sexo,
                "comunidad": paciente_extr["comunidad"]["valor"],
                "alergias": [],
                "condiciones_cronicas": [],
            },
            telefono=None,
            pin=_generar_pin(),
            debe_cambiar_pin=True,
            centro_id=centro_id,
        )
        return creado["id"], "creado", creado["dpi"]
    if paciente_id_form:
        paciente = _paciente_o_404(paciente_id_form)
        return paciente["id"], "actualizado", paciente["dpi"]
    tmp = generar_identificador_temporal(tiempo.ahora().date(), almacen.dpis())
    nombre = (extr.get("paciente") or {}).get("nombre", {}).get("valor") or "Pendiente de confirmación"
    creado = almacen.crear_paciente(
        {
            "dpi": tmp,
            "nombre": nombre,
            "fecha_nacimiento": None,
            "sexo": None,
            "comunidad": (extr.get("paciente") or {}).get("comunidad", {}).get("valor"),
            "alergias": [],
            "condiciones_cronicas": [],
        },
        telefono=None,
        pin=_generar_pin(),
        debe_cambiar_pin=True,
        centro_id=centro_id,
    )
    return creado["id"], "creado", creado["dpi"]


def importar_archivo(usuario: dict, nombre: str, contenido: bytes, paciente_id: str | None) -> dict:
    if usuario["rol"] != "enfermera":
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])
    if paciente_id:
        _paciente_o_404(paciente_id)
        exigir_centro_enfermera(usuario, paciente_id)
    try:
        filas = modulos().importar.leer_archivo(nombre or "archivo", contenido)
    except ErrorModulo as exc:
        traducir_modulo(exc)
        raise
    archivo_url = guardar_bytes(contenido, "application/octet-stream") if contenido else None
    importacion_id = almacen.nuevo_id("imp")
    salida = []
    creados = actualizados = con_errores = 0
    for fila in filas:
        extr = normalizar_extraccion(fila.get("extraccion") or {}, forzar_pagina_0=True)
        if extr.get("error"):
            con_errores += 1
            salida.append(
                {
                    "fila": fila["fila"],
                    "dpi": None,
                    "estado": "error",
                    "expediente_id": None,
                    "error": str(extr["error"]),
                }
            )
            continue
        pid, estado, dpi_resp = _vincular_fila(extr, paciente_id, usuario.get("centro_id"))
        if not enfermera_alcanza(usuario, pid):
            con_errores += 1
            salida.append(
                {
                    "fila": fila["fila"],
                    "dpi": dpi_resp,
                    "estado": "error",
                    "expediente_id": None,
                    "error": "El paciente no es de tu centro.",
                }
            )
            continue
        ahora_iso = tiempo.iso(tiempo.ahora())
        _guardar_ficha(
            {
                "id": almacen.nuevo_id("f"),
                "paciente_id": pid,
                "client_id": f"{importacion_id}-{fila['fila']}",
                "estado": "lista",
                "imagenes": [],
                "extraccion": extr,
                "error": None,
                "creada_en": ahora_iso,
                "capturada_en": None,
                "archivo_url": archivo_url,
                "eventos": [{"estado": "lista", "en": ahora_iso}],
            }
        )
        if estado == "creado":
            creados += 1
        else:
            actualizados += 1
        salida.append(
            {"fila": fila["fila"], "dpi": dpi_resp, "estado": estado, "expediente_id": pid, "error": None}
        )
    almacen.anotar_bitacora(
        {
            "tipo": "importacion",
            "actor_id": usuario["id"],
            "importacion_id": importacion_id,
            "creados": creados,
            "actualizados": actualizados,
            "con_errores": con_errores,
        }
    )
    return {
        "importacion_id": importacion_id,
        "total_filas": len(filas),
        "creados": creados,
        "actualizados": actualizados,
        "con_errores": con_errores,
        "filas": salida,
    }


def sesion_dev(rol: str) -> dict:
    if not config().dev_login_activo:
        raise error(404, "no_existe", MENSAJES["no_existe"])
    persona = next(p for p in PERSONAL.values() if p["rol"] == rol)
    vence = tiempo.ahora() + timedelta(hours=12)
    token = almacen.crear_sesion({"id": persona["id"], "rol": persona["rol"]}, vence)
    return {"token": token, "vence_en": tiempo.iso(vence), "usuario": usuario_publico(_materializar_personal(persona))}

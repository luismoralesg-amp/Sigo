"""Serialización compacta del expediente y recorte para acceso de emergencia.

El texto del prefijo (sistema + expediente) debe ser idéntico en cada pregunta
del mismo paciente y modo, para que Ollama reúse la caché KV.
"""

from __future__ import annotations

from typing import Any

CAMPOS_CONSULTA = (
    "fecha",
    "centro",
    "motivo",
    "diagnostico",
    "tratamiento",
    "vacunas",
    "original_url",
)
# El modelo puede decir "alergias" o el campo canónico. La cita sale con el canónico.
CAMPOS_PACIENTE = (
    "alergias",
    "condiciones_cronicas",
    "paciente.alergias",
    "paciente.condiciones_cronicas",
)
CAMPO_FUENTE = {
    "alergias": "paciente.alergias",
    "paciente.alergias": "paciente.alergias",
    "condiciones_cronicas": "paciente.condiciones_cronicas",
    "paciente.condiciones_cronicas": "paciente.condiciones_cronicas",
}
_IMPORTADO = {"importacion", "importado", "importada"}

MENSAJE_FUERA = "Eso no está en el expediente."


def id_paciente(expediente: dict[str, Any]) -> str:
    pac = expediente.get("paciente") or expediente
    return str(pac.get("id") or pac.get("dpi") or "")


def marca_emergencia(expediente: dict[str, Any] | None) -> bool:
    """Detecta la marca de acceso de emergencia en el expediente.

    Acepta las formas que puede mandar el backend:
    `tipo_acceso == "emergencia"`, `emergencia is True`, o
    `acceso.tipo == "emergencia"`.
    """
    if not expediente or not isinstance(expediente, dict):
        return False
    if expediente.get("tipo_acceso") == "emergencia":
        return True
    if expediente.get("emergencia") is True:
        return True
    acceso = expediente.get("acceso")
    if isinstance(acceso, dict) and acceso.get("tipo") == "emergencia":
        return True
    return False


def tipo_de_acceso(expediente: dict[str, Any] | None = None, tipo_acceso: str | None = None) -> str:
    """Resuelve el modo. Un tipo explícito gana (helpers); si no, se lee la marca."""
    if tipo_acceso:
        return "emergencia" if tipo_acceso == "emergencia" else tipo_acceso
    return "emergencia" if marca_emergencia(expediente) else "codigo"


def es_emergencia(tipo_acceso: str | None = None, expediente: dict[str, Any] | None = None) -> bool:
    if tipo_acceso:
        return tipo_acceso == "emergencia"
    return marca_emergencia(expediente)


def recorte_emergencia(expediente: dict[str, Any]) -> dict[str, Any]:
    """Defensa interna si llega una marca de emergencia.

    El 403 `solo_emergencia` lo responde el backend antes de llamar a
    `preguntar`. Esto no es un modo público: solo evita que el prefijo
    lleve consultas, vacunas o tratamientos cuando la marca igual aparece.
    """
    pac = expediente.get("paciente") or {}
    return {
        "paciente": {
            "id": pac.get("id"),
            "version": pac.get("version", 1),
            "alergias": list(pac.get("alergias") or []),
            "condiciones_cronicas": list(pac.get("condiciones_cronicas") or []),
        },
        "alertas": {
            "alergias": list((expediente.get("alertas") or {}).get("alergias") or pac.get("alergias") or []),
            "condiciones_cronicas": list(
                (expediente.get("alertas") or {}).get("condiciones_cronicas")
                or pac.get("condiciones_cronicas")
                or []
            ),
            "medicamentos": [],
        },
        "consultas": [],
        "acceso_vence_en": expediente.get("acceso_vence_en"),
        "tipo_acceso": "emergencia",
    }


def _nombre_centro(centro: Any) -> str:
    if isinstance(centro, dict):
        return str(centro.get("nombre") or centro.get("id") or "")
    return "" if centro is None else str(centro)


def _texto_item(valor: Any) -> str:
    """Texto visible de un ítem. No vuelca ids de ficha ni de fila al prefijo."""
    if isinstance(valor, dict):
        for clave in ("sustancia", "nombre", "texto", "valor"):
            if valor.get(clave):
                return str(valor[clave])
        return _nombre_centro(valor)
    if valor is None:
        return ""
    return str(valor)


def _compactar(valor: Any) -> str:
    if valor is None or valor == [] or valor == "":
        return "—"
    if isinstance(valor, list):
        partes = [p for p in (_texto_item(v) for v in valor) if p]
        return ", ".join(partes) if partes else "—"
    if isinstance(valor, dict):
        return _texto_item(valor) or "—"
    return str(valor)


def serializar(expediente: dict[str, Any], tipo_acceso: str | None = None) -> str:
    """Bloque compacto, estable, con IDs de consulta y versión."""
    tipo_acceso = tipo_de_acceso(expediente, tipo_acceso)
    if es_emergencia(tipo_acceso):
        expediente = recorte_emergencia(expediente)
    pac = expediente.get("paciente") or {}
    lineas = [
        f"PACIENTE id={pac.get('id') or '—'} version={pac.get('version', 1)}",
        f"ALERGIAS: {_compactar(pac.get('alergias'))}",
        f"CONDICIONES_CRONICAS: {_compactar(pac.get('condiciones_cronicas'))}",
    ]
    if es_emergencia(tipo_acceso):
        # Misma línea que un expediente sin consultas: el prefijo no anuncia un modo.
        lineas.append("CONSULTAS: (ninguna)")
        return "\n".join(lineas)

    consultas = list(expediente.get("consultas") or [])
    if not consultas:
        lineas.append("CONSULTAS: (ninguna)")
        return "\n".join(lineas)

    lineas.append("CONSULTAS:")
    for c in consultas:
        centro = _nombre_centro(c.get("centro"))
        lineas.append(
            "  "
            + " ".join(
                [
                    f"id={c.get('id')}",
                    f"version={c.get('version', 1)}",
                    f"fecha={_compactar(c.get('fecha'))}",
                    f"centro={centro or '—'}",
                    f"motivo={_compactar(c.get('motivo'))}",
                    f"diagnostico={_compactar(c.get('diagnostico'))}",
                    f"tratamiento={_compactar(c.get('tratamiento'))}",
                    f"vacunas={_compactar(c.get('vacunas'))}",
                    f"original_url={_compactar(c.get('original_url'))}",
                ]
            )
        )
    return "\n".join(lineas)


def armar_prefijo(expediente: dict[str, Any], tipo_acceso: str | None = None) -> str:
    """Prefijo idéntico por (paciente, modo). Va en el mensaje de sistema."""
    tipo_acceso = tipo_de_acceso(expediente, tipo_acceso)
    reglas = [
        "Eres el asistente de solo lectura de SIGO.",
        "Contestás únicamente con lo que está en el expediente que sigue.",
        "No inventás datos. No modificás ni corregís el expediente. Es solo lectura.",
        f'Si un dato no está en el expediente, la respuesta debe ser exactamente "{MENSAJE_FUERA}" y fuentes debe ser [].',
        "Cada afirmación debe citar su fuente.",
        "Respondé SOLO un JSON con esta forma exacta, sin markdown:",
        '{"respuesta":"...","fuentes":[{"consulta_id":"...","version":1,"original_url":"...","campo":"..."}]}',
        "campo de una consulta: fecha, centro, motivo, diagnostico, tratamiento, vacunas u original_url.",
        'Para alergias del paciente el campo es "paciente.alergias".',
        'Para condiciones crónicas el campo es "paciente.condiciones_cronicas".',
        "En esas dos citas el servidor pone consulta_id, version y original_url; no los inventes.",
        "DATOS INVENTADOS PARA EL DEMO. No es un paciente real.",
    ]
    return "\n".join(reglas) + "\n\nEXPEDIENTE:\n" + serializar(expediente, tipo_acceso)


def indice_consultas(expediente: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(c["id"]): c for c in (expediente.get("consultas") or []) if c.get("id")}


def _items_paciente(expediente: dict[str, Any], corto: str) -> list[Any]:
    pac = expediente.get("paciente") or {}
    alertas = expediente.get("alertas") or {}
    crudo = pac.get(corto)
    if not crudo:
        crudo = alertas.get(corto)
    if not crudo:
        return []
    if isinstance(crudo, str):
        return [crudo]
    return list(crudo)


def _marca_importado(item: dict[str, Any]) -> str:
    marca = item.get("fuente") if isinstance(item.get("fuente"), str) else ""
    origen = item.get("origen")
    if not marca and isinstance(origen, str):
        marca = origen
    return marca.strip().lower()


def _es_importado(item: dict[str, Any]) -> bool:
    if str(item.get("consulta_id") or item.get("ficha_id") or "").strip():
        return False
    if _marca_importado(item) in _IMPORTADO:
        return True
    return any(item.get(clave) is not None for clave in ("fila", "fila_id", "importacion_id"))


def _id_fila(item: dict[str, Any]) -> str | None:
    """Id de la fila importada. `FilaImportada.fila` es un entero; `fila_id` es texto."""
    for clave in ("fila_id", "importacion_id", "fila"):
        if item.get(clave) is not None and str(item.get(clave)).strip() != "":
            return str(item[clave]).strip()
    origen = item.get("origen")
    if isinstance(origen, dict):
        for clave in ("fila_id", "importacion_id", "fila", "id"):
            if origen.get(clave) is not None and str(origen.get(clave)).strip() != "":
                return str(origen[clave]).strip()
    return None


def _momento(consulta: dict[str, Any]) -> tuple[str, int, str]:
    cuando = str(consulta.get("editada_en") or consulta.get("fecha") or "")
    return (cuando, int(consulta.get("version") or 0), str(consulta.get("id") or ""))


def _mas_reciente(consultas: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not consultas:
        return None
    return max(consultas, key=_momento)


def _fuente_ficha(consulta: dict[str, Any], campo: str) -> dict[str, Any]:
    url = consulta.get("original_url")
    return {
        "consulta_id": str(consulta["id"]),
        "version": int(consulta.get("version") or 1),
        "original_url": "" if url is None else str(url),
        "campo": campo,
    }


def resolver_origen(expediente: dict[str, Any], campo: str) -> dict[str, Any] | None:
    """Arma la Fuente de una alergia o condición crónica.

    El Expediente de Phil guarda esos datos como `string[]` en el paciente
    y no dice en qué ficha se confirmaron. Lo más cercano que sí existe:

    1. Un ítem objeto con `consulta_id` o `ficha_id` (o `fuente` igual al id
       de una consulta del expediente). Esa es la ficha. Si hay varias, queda
       la de `editada_en` o `fecha` más reciente. `version` y `original_url`
       salen de esa consulta.
    2. Si no hay ficha y el ítem viene de importación (`fuente` o `origen` en
       importacion/importado, o trae `fila` / `fila_id`, como `FilaImportada`),
       `consulta_id` es el id de esa fila y `original_url` es null.
    3. Si solo hay textos, sin puntero: la consulta más reciente del
       expediente (único registro con id, versión y foto). Es una aproximación,
       no la ficha que registró el dato.
    """
    canonico = CAMPO_FUENTE.get(campo)
    if not canonico:
        return None
    corto = "alergias" if canonico.endswith("alergias") else "condiciones_cronicas"
    consultas = indice_consultas(expediente)
    items = _items_paciente(expediente, corto)
    if not items:
        return None

    fichas: list[dict[str, Any]] = []
    importados: list[tuple[str, dict[str, Any]]] = []
    hay_texto = False
    for item in items:
        if not isinstance(item, dict):
            hay_texto = True
            continue
        ficha_id = str(item.get("consulta_id") or item.get("ficha_id") or "").strip()
        origen = item.get("origen")
        if not ficha_id and isinstance(origen, dict):
            ficha_id = str(origen.get("consulta_id") or origen.get("ficha_id") or "").strip()
        fuente = item.get("fuente")
        if not ficha_id and isinstance(fuente, str) and fuente in consultas:
            ficha_id = fuente
        if ficha_id and ficha_id in consultas:
            fichas.append(consultas[ficha_id])
            continue
        if _es_importado(item):
            fila = _id_fila(item)
            if not fila:
                continue
            version = item.get("version")
            if version is None and isinstance(origen, dict):
                version = origen.get("version")
            importados.append(
                (
                    str(item.get("registrada_en") or ""),
                    {
                        "consulta_id": fila,
                        "version": int(version or 1),
                        "original_url": None,
                        "campo": canonico,
                    },
                )
            )
            continue
        hay_texto = True

    if fichas:
        return _fuente_ficha(_mas_reciente(fichas), canonico)  # type: ignore[arg-type]
    if importados and not hay_texto:
        importados.sort(key=lambda par: par[0])
        return importados[-1][1]
    if hay_texto:
        reciente = _mas_reciente(list(consultas.values()))
        if reciente is not None:
            return _fuente_ficha(reciente, canonico)
    if importados:
        importados.sort(key=lambda par: par[0])
        return importados[-1][1]
    return None


def clave_cache(expediente: dict[str, Any], tipo_acceso: str | None = None) -> str:
    tipo_acceso = tipo_de_acceso(expediente, tipo_acceso)
    return f"{id_paciente(expediente)}|{tipo_acceso}|{serializar(expediente, tipo_acceso)}"

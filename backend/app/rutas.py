"""Rutas /api/v1 del contrato de Phil. No hay DELETE."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, Query, UploadFile
from fastapi.responses import Response

from . import servicio
from .modelos import (
    ERRORES,
    AltaPaciente,
    AuthPacienteIn,
    Busqueda,
    Canje,
    CanjeIn,
    CodigoIn,
    CodigoTemporal,
    Confirmacion,
    ConfirmarIn,
    Consulta,
    CrearPacienteIn,
    DevSesionIn,
    EmergenciaIn,
    EmergenciaResp,
    Expediente,
    Ficha,
    Importacion,
    ListaAccesos,
    ListaVersiones,
    Paciente,
    PinIn,
    PreguntaIn,
    RespuestaAsistente,
    SesionPaciente,
    Usuario,
    VersionConsultaIn,
    VersionPacienteIn,
)
from .seguridad import UsuarioDep
from .errores import error

router = APIRouter(prefix="/api/v1", responses=ERRORES)


@router.get("/me", response_model=Usuario)
def me(usuario: UsuarioDep) -> dict:
    from .seguridad import usuario_publico

    return usuario_publico(usuario)


@router.post("/auth/paciente", response_model=SesionPaciente)
def auth_paciente(body: AuthPacienteIn) -> dict:
    return servicio.autenticar_paciente(body.dpi, body.pin)


@router.get("/pacientes/buscar", response_model=Busqueda)
def buscar(usuario: UsuarioDep, dpi: str = Query("")) -> dict:
    return servicio.buscar(usuario, dpi)


@router.post("/pacientes", response_model=AltaPaciente, status_code=201)
def alta_paciente(body: CrearPacienteIn, usuario: UsuarioDep) -> dict:
    return servicio.crear_paciente(usuario, body.model_dump(exclude_unset=True))


@router.post("/pacientes/{id}/fichas", response_model=Ficha)
async def subir_ficha(
    id: str,
    usuario: UsuarioDep,
    client_id: str = Form(...),
    capturada_en: str | None = Form(None),
    imagenes: list[UploadFile] = File(...),
) -> dict:
    blobs = []
    for imagen in imagenes:
        data = await imagen.read()
        if len(data) > 5 * 1024 * 1024:
            raise error(413, "imagen_muy_grande", "Una foto pasa de 5 MB. Comprimila y reintentá.")
        blobs.append(data)
    return servicio.subir_ficha(usuario, id, client_id, capturada_en, blobs)


@router.get("/fichas/{id}", response_model=Ficha)
def obtener_ficha(id: str, usuario: UsuarioDep) -> dict:
    return servicio.obtener_ficha(usuario, id)


@router.post("/fichas/{id}/confirmar", response_model=Confirmacion, status_code=201)
def confirmar(id: str, body: ConfirmarIn, usuario: UsuarioDep) -> dict:
    return servicio.confirmar(
        usuario,
        id,
        {
            "paciente": body.paciente.model_dump(exclude_unset=True),
            "consultas": [c.model_dump() for c in body.consultas],
            "consentimiento": body.consentimiento,
        },
    )


@router.post("/consultas/{id}/versiones", response_model=Consulta, status_code=201)
def version_consulta(id: str, body: VersionConsultaIn, usuario: UsuarioDep) -> dict:
    return servicio.corregir_consulta(usuario, id, body.model_dump(exclude_unset=True))


@router.post("/pacientes/{id}/versiones", response_model=Paciente, status_code=201)
def version_paciente(id: str, body: VersionPacienteIn, usuario: UsuarioDep) -> dict:
    return servicio.corregir_paciente(usuario, id, body.model_dump(exclude_unset=True))


@router.get("/pacientes/{id}/expediente", response_model=Expediente)
def expediente(id: str, usuario: UsuarioDep) -> dict:
    return servicio.ver_expediente(usuario, id)


@router.get("/consultas/{id}/versiones", response_model=ListaVersiones)
def versiones(id: str, usuario: UsuarioDep) -> dict:
    return servicio.ver_versiones(usuario, id)


@router.get("/pacientes/{id}/exportar")
def exportar(id: str, usuario: UsuarioDep, formato: str = Query(...)) -> Response:
    contenido, media, nombre = servicio.exportar_expediente(usuario, id, formato)
    limpio = nombre.replace('"', "")
    return Response(content=contenido, media_type=media, headers={"Content-Disposition": f'attachment; filename="{limpio}"'})


@router.post("/pacientes/{id}/codigos", response_model=CodigoTemporal, status_code=201)
def codigos(id: str, usuario: UsuarioDep, body: CodigoIn | None = None) -> dict:
    enviar = bool(body.enviar_sms) if body else False
    return servicio.crear_codigo(usuario, id, enviar)


@router.post("/codigos/canjear", response_model=Canje)
def canjear(body: CanjeIn, usuario: UsuarioDep) -> dict:
    return servicio.canjear(usuario, body.codigo)


@router.post("/pacientes/{id}/preguntar", response_model=RespuestaAsistente)
def preguntar(id: str, body: PreguntaIn, usuario: UsuarioDep) -> dict:
    return servicio.preguntar(usuario, id, body.pregunta)


@router.get("/pacientes/{id}/accesos", response_model=ListaAccesos)
def accesos(id: str, usuario: UsuarioDep) -> dict:
    return servicio.ver_accesos(usuario, id)


@router.put("/me/pin", status_code=204)
def cambiar_pin(body: PinIn, usuario: UsuarioDep) -> Response:
    servicio.cambiar_pin(usuario, body.pin_actual, body.pin_nuevo)
    return Response(status_code=204)


@router.post("/emergencia", response_model=EmergenciaResp)
def emergencia(body: EmergenciaIn, usuario: UsuarioDep) -> dict:
    return servicio.emergencia(usuario, body.dpi, body.motivo)


@router.post("/importaciones", response_model=Importacion)
async def importaciones(
    usuario: UsuarioDep,
    archivo: UploadFile = File(...),
    paciente_id: str | None = Form(None),
) -> dict:
    contenido = await archivo.read()
    return servicio.importar_archivo(usuario, archivo.filename or "", contenido, paciente_id)


@router.get("/archivos/{archivo_id}")
def archivo(archivo_id: str, exp: str = Query(...), sig: str = Query(...)) -> Response:
    contenido, media = servicio.leer_archivo_firmado(archivo_id, exp, sig)
    return Response(content=contenido, media_type=media)


@router.post("/dev/sesion")
def dev_sesion(body: DevSesionIn) -> dict:
    return servicio.sesion_dev(body.rol)

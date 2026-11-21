"""Modelos de entrada y salida del contrato v1 de Phil."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

CodigoError = Literal[
    "validacion",
    "dpi_invalido",
    "sin_consentimiento",
    "formato_no_soportado",
    "sin_sesion",
    "pin_incorrecto",
    "rol_no_permitido",
    "acceso_vencido",
    "solo_emergencia",
    "no_existe",
    "dpi_ya_existe",
    "ficha_ya_confirmada",
    "codigo_ya_usado",
    "codigo_vencido",
    "imagen_muy_grande",
    "ilegible",
    "demasiados_intentos",
    "ia_no_disponible",
]


class ErrorCuerpo(BaseModel):
    codigo: CodigoError
    mensaje: str


class ErrorResp(BaseModel):
    error: ErrorCuerpo


class Centro(BaseModel):
    id: str
    nombre: str
    tipo: Literal["puesto", "centro", "hospital"]
    municipio: str
    departamento: str


class Usuario(BaseModel):
    id: str
    nombre: str
    rol: Literal["enfermera", "medico", "paciente"]
    centro: Centro | None
    paciente_id: str | None
    debe_cambiar_pin: bool


class Paciente(BaseModel):
    id: str
    dpi: str
    nombre: str
    fecha_nacimiento: str | None
    sexo: Literal["F", "M"] | None
    comunidad: str | None
    alergias: list[str]
    condiciones_cronicas: list[str]
    version: int


class Consulta(BaseModel):
    id: str
    version: int
    fecha: str | None
    centro: Centro
    motivo: str | None
    diagnostico: str | None
    tratamiento: str | None
    vacunas: list[str]
    original_url: str
    editada_por: str
    editada_en: str


class Alertas(BaseModel):
    alergias: list[str]
    condiciones_cronicas: list[str]
    medicamentos: list[str]


class Expediente(BaseModel):
    paciente: Paciente
    alertas: Alertas
    consultas: list[Consulta]
    acceso_vence_en: str | None
    tipo_acceso: Literal["codigo", "emergencia"] | None


class Ficha(BaseModel):
    id: str
    paciente_id: str
    client_id: str
    estado: Literal["procesando", "lista", "confirmada", "error"]
    imagenes: list[str]
    extraccion: dict | None
    error: str | None
    creada_en: str


class CodigoTemporal(BaseModel):
    codigo: str
    qr: str
    vence_en: str
    enviado_por_sms: bool


class SesionPaciente(BaseModel):
    token: str
    vence_en: str
    paciente_id: str


class Canje(BaseModel):
    paciente_id: str
    acceso_vence_en: str


class EmergenciaResp(BaseModel):
    paciente_id: str
    acceso_vence_en: str
    tipo_acceso: Literal["emergencia"]


class Confirmacion(BaseModel):
    consultas_creadas: int
    version: int


class AltaPaciente(BaseModel):
    paciente: Paciente
    pin_inicial: str


class Busqueda(BaseModel):
    pacientes: list[Paciente]


class Fuente(BaseModel):
    consulta_id: str
    version: int
    original_url: str
    campo: str


class RespuestaAsistente(BaseModel):
    respuesta: str
    fuentes: list[Fuente]


class Acceso(BaseModel):
    quien: str
    tipo: Literal["codigo", "emergencia", "enfermera"]
    motivo: str | None
    centro: str
    desde: str
    hasta: str
    preguntas_hechas: int


class ListaAccesos(BaseModel):
    accesos: list[Acceso]


class VersionConsulta(BaseModel):
    version: int
    datos: dict
    motivo_cambio: str | None
    editada_por: str
    editada_en: str


class ListaVersiones(BaseModel):
    versiones: list[VersionConsulta]


class FilaImportacion(BaseModel):
    fila: int
    dpi: str | None
    estado: Literal["creado", "actualizado", "error"]
    expediente_id: str | None
    error: str | None


class Importacion(BaseModel):
    importacion_id: str
    total_filas: int
    creados: int
    actualizados: int
    con_errores: int
    filas: list[FilaImportacion]


class _Estricto(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AuthPacienteIn(_Estricto):
    dpi: str
    pin: str


class CrearPacienteIn(_Estricto):
    dpi: str | None = None
    nombre: str
    fecha_nacimiento: str | None = None
    sexo: Literal["F", "M"] | None = None
    comunidad: str | None = None
    telefono: str | None = None


class PacienteConfirmado(_Estricto):
    nombre: str | None = None
    fecha_nacimiento: str | None = None
    sexo: Literal["F", "M"] | None = None
    comunidad: str | None = None
    alergias: list[str] | None = None
    condiciones_cronicas: list[str] | None = None


class ConsultaConfirmada(_Estricto):
    fecha: str | None = None
    motivo: str | None = None
    diagnostico: str | None = None
    tratamiento: str | None = None
    vacunas: list[str] = []
    pagina: int = 0


class ConfirmarIn(_Estricto):
    paciente: PacienteConfirmado
    consultas: list[ConsultaConfirmada]
    consentimiento: bool


class VersionConsultaIn(_Estricto):
    fecha: str | None = None
    motivo: str | None = None
    diagnostico: str | None = None
    tratamiento: str | None = None
    vacunas: list[str] | None = None
    motivo_cambio: str


class VersionPacienteIn(_Estricto):
    nombre: str | None = None
    fecha_nacimiento: str | None = None
    sexo: Literal["F", "M"] | None = None
    comunidad: str | None = None
    alergias: list[str] | None = None
    condiciones_cronicas: list[str] | None = None
    motivo_cambio: str


class CodigoIn(_Estricto):
    enviar_sms: bool = False


class CanjeIn(_Estricto):
    codigo: str


class PreguntaIn(_Estricto):
    pregunta: str


class PinIn(_Estricto):
    pin_actual: str
    pin_nuevo: str


class EmergenciaIn(_Estricto):
    dpi: str
    motivo: str


class DevSesionIn(_Estricto):
    rol: Literal["enfermera", "medico"]


ERRORES = {
    codigo: {"model": ErrorResp}
    for codigo in (400, 401, 403, 404, 409, 410, 413, 422, 429, 503)
}

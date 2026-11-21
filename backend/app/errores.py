"""Forma única de error del contrato: {"error": {"codigo", "mensaje"}}."""

from __future__ import annotations

class ErrorSigo(Exception):
    """Error del contrato. No hereda de HTTPException para que el cuerpo no quede envuelto en `detail`."""

    def __init__(self, status: int, codigo: str, mensaje: str) -> None:
        self.status_code = status
        self.detail = {"error": {"codigo": codigo, "mensaje": mensaje}}
        super().__init__(mensaje)


def error(status: int, codigo: str, mensaje: str) -> ErrorSigo:
    return ErrorSigo(status, codigo, mensaje)


MENSAJES = {
    "sin_sesion": "Tu sesión venció. Entrá de nuevo.",
    "pin_incorrecto": "DPI o PIN incorrectos.",
    "rol_no_permitido": "No tenés acceso a esta acción.",
    "acceso_vencido": "El acceso ya venció. Pedí un código nuevo a la paciente.",
    "solo_emergencia": "Con acceso de emergencia solo se ven las alertas. Para ver más, pedí el código a la paciente.",
    "no_existe": "No encontrado.",
    "sin_consentimiento": "Falta el consentimiento de la paciente. No se guardó nada.",
    "dpi_invalido": "El DPI no es válido.",
    "dpi_ya_existe": "Ya hay una paciente con ese DPI.",
    "ficha_ya_confirmada": "Esta ficha ya estaba confirmada.",
    "codigo_ya_usado": "Este código ya se usó.",
    "codigo_vencido": "Este código ya venció. Pedí uno nuevo a la paciente.",
    "imagen_muy_grande": "Una foto pasa de 5 MB. Comprimila y reintentá.",
    "ilegible": "No se pudo leer la ficha. Tomá la foto otra vez, con más luz.",
    "demasiados_intentos": "Demasiados intentos. Esperá 15 minutos.",
    "ia_no_disponible": "El asistente no está disponible. Intentá de nuevo.",
    "formato_no_soportado": "Formato no soportado. Usá .xlsx, .csv o .accdb.",
    "validacion": "Los datos no son válidos.",
}

# Tabla de errores del API v1. formato_no_soportado es 400 propio:
# no se traduce a "validacion". El contrato de Phil no lo enumeraba;
# la decisión de importación/exportación lo agrega.
TABLA: dict[int, tuple[str, ...]] = {
    400: ("validacion", "dpi_invalido", "sin_consentimiento", "formato_no_soportado"),
    401: ("sin_sesion", "pin_incorrecto"),
    403: ("rol_no_permitido", "acceso_vencido", "solo_emergencia"),
    404: ("no_existe",),
    409: ("dpi_ya_existe", "ficha_ya_confirmada", "codigo_ya_usado"),
    410: ("codigo_vencido",),
    413: ("imagen_muy_grande",),
    422: ("ilegible",),
    429: ("demasiados_intentos",),
    503: ("ia_no_disponible",),
}

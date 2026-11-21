"""Forma única de error del contrato: {"error": {"codigo", "mensaje"}}."""

from __future__ import annotations

from fastapi import HTTPException


class ErrorSigo(HTTPException):
    def __init__(self, status: int, codigo: str, mensaje: str) -> None:
        super().__init__(status_code=status, detail={"error": {"codigo": codigo, "mensaje": mensaje}})


def error(status: int, codigo: str, mensaje: str) -> ErrorSigo:
    return ErrorSigo(status, codigo, mensaje)


MENSAJES = {
    "sin_sesion": "Tu sesión venció. Entrá de nuevo.",
    "rol_no_permitido": "No tenés acceso a esta acción.",
    "acceso_vencido": "El acceso ya venció. Pedí un código nuevo a la paciente.",
    "solo_emergencia": "Con acceso de emergencia solo se ven las alertas. Para ver más, pedí el código a la paciente.",
    "no_existe": "No encontrado.",
}

"""Implementación real del CAG (el backend la elige con SIGO_CAG_IMPL=real).

Firma acordada (backend/app/modulos/interfaces.py):

    preguntar(expediente: dict, pregunta: str) -> {"respuesta": str, "fuentes": list[Fuente]}

Fuente = {consulta_id, version, original_url, campo}.
Si no hay fuente, la respuesta lo dice y fuentes = [].
Si Ollama no responde, se lanza una excepción con atributo codigo
"ia_no_disponible" (el backend la mapea a HTTP 503).

Este módulo no importa el backend, y el backend no debe importar
nuestra implementación interna: solo esta función.
"""

from __future__ import annotations

from typing import Any

from cag.ollama_cliente import OllamaNoDisponible
from cag.asistente import (
    MENSAJE_FUERA,
    precalentar as _precalentar,
    preguntar as _preguntar,
)

__all__ = [
    "MENSAJE_FUERA",
    "OllamaNoDisponible",
    "precalentar",
    "preguntar",
]


def preguntar(expediente: dict, pregunta: str) -> dict[str, Any]:
    """Responde una pregunta sobre el expediente, con fuentes verificadas.

    No implementa el acceso de emergencia: ese 403 lo responde el backend
    antes de llamar aquí. Nunca escribe el expediente.
    """
    return _preguntar(expediente, pregunta)


def precalentar(expediente: dict) -> None:
    """Carga el prefijo sistema+expediente en la caché KV de Ollama."""
    _precalentar(expediente)

"""CAG de SIGO: pregunta sobre un expediente con caché KV local (Ollama).

La interfaz pública acordada con el backend es:

    from sigo_modulos.cag import preguntar
    preguntar(expediente: dict, pregunta: str) -> {"respuesta": str, "fuentes": list}

Este paquete (`cag`) es la implementación interna que usa esa función.
"""

from .ollama_cliente import OllamaCliente, OllamaNoDisponible
from .asistente import (
    MENSAJE_EMERGENCIA,
    MENSAJE_FUERA,
    precalentar,
    preguntar,
)

__all__ = [
    "MENSAJE_EMERGENCIA",
    "MENSAJE_FUERA",
    "OllamaCliente",
    "OllamaNoDisponible",
    "precalentar",
    "preguntar",
]

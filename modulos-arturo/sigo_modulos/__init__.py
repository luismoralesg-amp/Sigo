"""Módulos de Arturo para SIGO.

El backend los carga con SIGO_<MODULO>_IMPL=real y no al revés:
este paquete no importa nada de backend/.
"""

from .errores import ErrorModulo

__all__ = ["ErrorModulo"]

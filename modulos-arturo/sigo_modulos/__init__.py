"""Módulos de Arturo para SIGO.

El backend los carga con SIGO_<MODULO>_IMPL=real y no al revés:
este paquete no importa nada de backend/. La firma de visión es
sigo_modulos.vision.extraer_ficha(imagenes: list[bytes]) -> dict.
"""

from .errores import ErrorModulo

__all__ = ["ErrorModulo"]

"""Errores de los módulos de Arturo.

El backend no importa este paquete para traducir el fallo: lee el atributo
`codigo` de cualquier excepción (ver backend/app/modulos/interfaces.py).
Ahí ya existe un ErrorModulo con la misma forma, dentro del backend.
Arturo no importa el backend, así que esta clase es la copia que usan
los módulos. Los códigos tienen que coincidir con CODIGOS_ERROR.
"""

from __future__ import annotations


class ErrorModulo(Exception):
    """Excepción con `codigo` que el backend mapea a HTTP.

    "ilegible" -> 422. "ia_no_disponible" -> 503.
    """

    codigo = "ia_no_disponible"

    def __init__(self, mensaje: str, codigo: str | None = None) -> None:
        super().__init__(mensaje)
        if codigo:
            self.codigo = codigo

"""Interfaces que el backend espera. Las implementaciones de Arturo
(modulos-arturo/sigo_modulos/*) cumplen estas firmas EXACTAS, como
funciones a nivel de módulo. Los tipos (Extraccion, Expediente, Fuente)
son los del contrato de Phil (contrato/openapi.yaml).

Errores: cualquier excepción con atributo `codigo` igual a uno de
CODIGOS_ERROR se traduce al error HTTP del contrato. Así Arturo no
importa nada del backend y el backend no importa nada de Arturo.
"""

from __future__ import annotations

from typing import Any, Literal, Protocol, TypedDict, runtime_checkable

Confianza = Literal["alta", "baja"]
Formato = Literal["pdf", "docx", "xlsx", "txt", "md", "html"]
FORMATOS: tuple[str, ...] = ("pdf", "docx", "xlsx", "txt", "md", "html")


class Campo(TypedDict):
    valor: Any
    confianza: Confianza


class Fuente(TypedDict):
    consulta_id: str
    version: int
    original_url: str
    campo: str


class RespuestaCAG(TypedDict):
    respuesta: str
    fuentes: list[Fuente]


class FilaImportada(TypedDict):
    dpi: str | None          # DPI leído de la fila (13 dígitos) o None
    fila: int                # número de fila o registro en el archivo original (1 = primera de datos)
    extraccion: dict          # Extraccion del contrato, con confianza por campo


# Códigos de error que el backend entiende -> (HTTP, codigo del contrato)
CODIGOS_ERROR: dict[str, tuple[int, str]] = {
    "ilegible": (422, "ilegible"),
    "ia_no_disponible": (503, "ia_no_disponible"),
    "formato_no_soportado": (400, "validacion"),
    "formato_no_disponible": (503, "ia_no_disponible"),
}


class ErrorModulo(Exception):
    """Base de errores de los módulos mock. Arturo puede definir la suya con el mismo atributo."""

    codigo = "ia_no_disponible"

    def __init__(self, mensaje: str, codigo: str | None = None) -> None:
        super().__init__(mensaje)
        if codigo:
            self.codigo = codigo


@runtime_checkable
class Vision(Protocol):
    def extraer_ficha(self, imagenes: list[bytes]) -> dict:
        """JPEGs en orden de página -> Extraccion {"paciente": {...Campo}, "consultas": [...]}.
        Lo que no se lee va con valor None y confianza "baja"; nunca inventa.
        Errores: codigo "ilegible" (422) o "ia_no_disponible" (503)."""
        ...


@runtime_checkable
class Importador(Protocol):
    def leer_archivo(self, nombre_archivo: str, contenido: bytes) -> list[FilaImportada]:
        """.xlsx, .csv o .accdb/.mdb -> una FilaImportada por paciente/fila.
        Errores: codigo "formato_no_soportado" (400)."""
        ...


@runtime_checkable
class AsistenteCAG(Protocol):
    def preguntar(self, expediente: dict, pregunta: str) -> RespuestaCAG:
        """Expediente completo del contrato + pregunta -> respuesta con fuentes reales.
        Si no hay fuente: respuesta dice que no lo encontró y fuentes = []. Nunca inventa.
        Errores: codigo "ia_no_disponible" (503)."""
        ...


@runtime_checkable
class Exportador(Protocol):
    def exportar(self, expediente: dict, formato: str) -> tuple[bytes, str, str]:
        """Expediente -> (contenido, content_type, nombre_archivo). formato en FORMATOS.
        Debe escapar HTML y no cargar recursos externos (S-10).
        Errores: codigo "formato_no_soportado" (400) o "formato_no_disponible" (503)."""
        ...

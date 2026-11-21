"""Puntos de enchufe de los módulos de IA y archivos.

El backend de Luis NO depende del código de Arturo: cada módulo tiene una
interfaz (interfaces.py) y una implementación mock que funciona sola. Con
SIGO_<MODULO>_IMPL=real se carga la implementación de modulos-arturo/.
"""

from .cargador import modulos  # noqa: F401

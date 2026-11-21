"""Visión mock: devuelve la extracción fija del ejemplo de Phil (sin IA).

El DPI del ejemplo impreso (2547896310801) no pasa el verificador. Aquí se usa
el CUI inventado con el dígito correcto. No llama a un modelo.
"""

from __future__ import annotations

import copy

from ..datos import DPI_ROSA
from ..extraccion import extraccion_ilegible
from .interfaces import ErrorModulo

EXTRACCION_EJEMPLO = {
    "paciente": {
        "nombre": {"valor": "Rosa Batz Tzoc", "confianza": "alta"},
        "dpi": {"valor": DPI_ROSA, "confianza": "alta"},
        "fecha_nacimiento": {"valor": "1984-03-12", "confianza": "alta"},
        "sexo": {"valor": "F", "confianza": "alta"},
        "comunidad": {"valor": "Chuicacá", "confianza": "alta"},
        "alergias": {"valor": ["penicilina"], "confianza": "alta"},
        "condiciones_cronicas": {"valor": [], "confianza": "alta"},
    },
    "consultas": [
        {
            "fecha": {"valor": "2025-08-14", "confianza": "alta"},
            "motivo": {"valor": "Control prenatal", "confianza": "alta"},
            "diagnostico": {"valor": "Embarazo 24 semanas", "confianza": "baja"},
            "tratamiento": {"valor": "Sulfato ferroso", "confianza": "alta"},
            "vacunas": {"valor": ["Td"], "confianza": "alta"},
            "pagina": 0,
        }
    ],
}


def extraer_ficha(imagenes: list[bytes]) -> dict:
    if not imagenes or not any(imagenes):
        raise ErrorModulo("No se pudo leer la ficha.", "ilegible")
    if any(img.startswith(b"ILEGIBLE") for img in imagenes):
        return extraccion_ilegible("No se pudo leer la ficha.")
    return copy.deepcopy(EXTRACCION_EJEMPLO)

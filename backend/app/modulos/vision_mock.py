"""Visión mock: devuelve la extracción fija del ejemplo de Phil (sin IA)."""

from __future__ import annotations

import copy

from .interfaces import ErrorModulo

EXTRACCION_EJEMPLO = {
    "paciente": {
        "nombre": {"valor": "Rosa Batz Tzoc", "confianza": "alta"},
        "dpi": {"valor": "2547896310801", "confianza": "alta"},
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
        raise ErrorModulo("No llegó ninguna imagen.", "ilegible")
    return copy.deepcopy(EXTRACCION_EJEMPLO)

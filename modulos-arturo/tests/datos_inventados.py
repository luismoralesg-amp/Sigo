"""Expediente de demostración (datos inventados). No es un paciente real.

Forma del contrato de Phil (reporte-congruencia.txt): Expediente con
paciente, alertas y consultas. Id p_12. Centro: Puesto de Salud Aldea
Chuicacá. Tres consultas, alergia a penicilina.

El DPI 2483175631406 es el identificador inventado del mock.
No usar datos reales.
"""

from __future__ import annotations

from typing import Any

CENTRO_CHUICACA: dict[str, Any] = {
    "id": "centro_chuicaca",
    "nombre": "Puesto de Salud Aldea Chuicacá",
    "tipo": "puesto",
    "municipio": "Aldea Chuicacá",
    "departamento": "Totonicapán",
}

EXPEDIENTE_ROSA: dict[str, Any] = {
    "paciente": {
        "id": "p_12",
        "dpi": "2483175631406",
        "nombre": "Rosa Ajpop",
        "fecha_nacimiento": "1978-03-12",
        "sexo": "F",
        "comunidad": "Aldea Chuicacá",
        "alergias": ["Penicilina"],
        "condiciones_cronicas": ["Hipertensión"],
        "version": 1,
    },
    "alertas": {
        "alergias": ["Penicilina"],
        "condiciones_cronicas": ["Hipertensión"],
        "medicamentos": ["Amoxicilina 500 mg", "Losartán 50 mg"],
    },
    "consultas": [
        {
            "id": "c_03",
            "version": 1,
            "fecha": "2024-11-02",
            "centro": CENTRO_CHUICACA,
            "motivo": "Dolor de garganta y fiebre",
            "diagnostico": "Faringitis bacteriana",
            "tratamiento": "Amoxicilina 500 mg",
            "vacunas": [],
            "original_url": "",
            "editada_por": "Ana Tzul",
            "editada_en": "2024-11-02T11:30:00-06:00",
        },
        {
            "id": "c_02",
            "version": 1,
            "fecha": "2023-04-21",
            "centro": CENTRO_CHUICACA,
            "motivo": "Control de presión",
            "diagnostico": "Hipertensión controlada",
            "tratamiento": "Losartán 50 mg",
            "vacunas": [],
            "original_url": "",
            "editada_por": "Ana Tzul",
            "editada_en": "2023-04-21T09:10:00-06:00",
        },
        {
            "id": "c_01",
            "version": 1,
            "fecha": "2022-05-10",
            "centro": CENTRO_CHUICACA,
            "motivo": "Vacunación",
            "diagnostico": None,
            "tratamiento": None,
            "vacunas": ["Tétanos (Td) — refuerzo", "COVID-19 (refuerzo) — 3a dosis"],
            "original_url": "",
            "editada_por": "Ana Tzul",
            "editada_en": "2022-05-10T10:00:00-06:00",
        },
    ],
    "acceso_vence_en": None,
    "tipo_acceso": None,
}

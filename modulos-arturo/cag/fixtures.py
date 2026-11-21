"""Expedientes inventados con la forma del contrato de Phil (tipo Expediente).

Solo datos de demostración. No son pacientes reales.
"""

from __future__ import annotations

from typing import Any

CENTRO_CHICHICASTENANGO: dict[str, Any] = {
    "id": "c_01",
    "nombre": "Puesto de Salud Chichicastenango",
    "tipo": "puesto",
    "municipio": "Chichicastenango",
    "departamento": "Quiché",
}

CENTRO_ZONA10: dict[str, Any] = {
    "id": "c_02",
    "nombre": "Puesto de Salud Zona 10",
    "tipo": "puesto",
    "municipio": "Guatemala",
    "departamento": "Guatemala",
}

# Rosa Ajpop — la paciente del demo. Alergia a penicilina e hipertensión.
ROSA: dict[str, Any] = {
    "paciente": {
        "id": "p_12",
        "dpi": "2483175631406",
        "nombre": "Rosa Ajpop",
        "fecha_nacimiento": "1978-03-12",
        "sexo": "F",
        "comunidad": "Chichicastenango",
        "alergias": ["penicilina"],
        "condiciones_cronicas": ["hipertensión"],
        "version": 1,
    },
    "alertas": {
        "alergias": ["penicilina"],
        "condiciones_cronicas": ["hipertensión"],
        "medicamentos": ["Amoxicilina 500 mg", "Losartán 50 mg"],
    },
    "consultas": [
        {
            "id": "con_003",
            "version": 1,
            "fecha": "2024-11-02",
            "centro": CENTRO_CHICHICASTENANGO,
            "motivo": "Dolor de garganta y fiebre",
            "diagnostico": "Faringitis bacteriana",
            "tratamiento": "Amoxicilina 500 mg",
            "vacunas": [],
            "original_url": "https://archivos.sigo.gt/inventados/rosa/con_003.jpg",
            "editada_por": "Ana López",
            "editada_en": "2024-11-02T10:15:00-06:00",
        },
        {
            "id": "con_002",
            "version": 1,
            "fecha": "2023-09-01",
            "centro": CENTRO_CHICHICASTENANGO,
            "motivo": "Vacunación",
            "diagnostico": "Persona sana",
            "tratamiento": None,
            "vacunas": ["COVID-19 (refuerzo)"],
            "original_url": "https://archivos.sigo.gt/inventados/rosa/con_002.jpg",
            "editada_por": "Ana López",
            "editada_en": "2023-09-01T09:00:00-06:00",
        },
        {
            "id": "con_001",
            "version": 1,
            "fecha": "2023-04-21",
            "centro": CENTRO_CHICHICASTENANGO,
            "motivo": "Control de presión",
            "diagnostico": "Hipertensión controlada",
            "tratamiento": "Losartán 50 mg",
            "vacunas": ["Tétanos (Td)"],
            "original_url": "https://archivos.sigo.gt/inventados/rosa/con_001.jpg",
            "editada_por": "Ana López",
            "editada_en": "2023-04-21T11:30:00-06:00",
        },
    ],
    "acceso_vence_en": None,
    "tipo_acceso": None,
}

# Juan Tecún — sin alergias conocidas.
JUAN: dict[str, Any] = {
    "paciente": {
        "id": "p_13",
        "dpi": "1234567890101",
        "nombre": "Juan Tecún",
        "fecha_nacimiento": "1990-08-04",
        "sexo": "M",
        "comunidad": "Guatemala",
        "alergias": [],
        "condiciones_cronicas": [],
        "version": 1,
    },
    "alertas": {"alergias": [], "condiciones_cronicas": [], "medicamentos": []},
    "consultas": [
        {
            "id": "con_101",
            "version": 1,
            "fecha": "2025-04-12",
            "centro": CENTRO_ZONA10,
            "motivo": "Vacunación anual",
            "diagnostico": "Persona sana",
            "tratamiento": None,
            "vacunas": ["Influenza"],
            "original_url": "https://archivos.sigo.gt/inventados/juan/con_101.jpg",
            "editada_por": "Ana López",
            "editada_en": "2025-04-12T08:45:00-06:00",
        }
    ],
    "acceso_vence_en": None,
    "tipo_acceso": None,
}

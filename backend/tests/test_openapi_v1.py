"""El OpenAPI v1 commiteado tiene que ser el que FastAPI genera ahora."""

import json

from app.exportar_openapi import RUTA, documento


def test_openapi_v1_guardado_coincide_con_el_generado():
    assert RUTA.is_file(), "Falta contrato/openapi-v1.json. Corré: python -m app.exportar_openapi"
    guardado = json.loads(RUTA.read_text(encoding="utf-8"))
    generado = documento()
    assert guardado == generado
    assert guardado["info"]["version"] == "1.0.0"
    assert "/api/v1/me" in guardado["paths"]
    assert "/api/v1/pacientes/{id}/expediente" in guardado["paths"]
    assert "/api/v1/pacientes/{id}/exportar" in guardado["paths"]
    assert "/api/v1/importar" not in guardado["paths"]
    assert "delete" not in {m for ops in guardado["paths"].values() for m in ops}

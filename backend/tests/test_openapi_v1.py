"""El OpenAPI v1 commiteado tiene que ser el que FastAPI genera ahora.

Las frases de status no se comparan: Starlette 0.46 y Python 3.13 llaman al 413
"Content Too Large"; versiones anteriores dicen "Request Entity Too Large".
"""

import copy
import json
from http import HTTPStatus

from app.exportar_openapi import RUTA, documento

# Frases que el mismo código HTTP ha tenido. No son parte del contrato de Phil.
_FRASES_STATUS = {status.phrase for status in HTTPStatus} | {
    "Content Too Large",
    "Request Entity Too Large",
    "Payload Too Large",
    "Unprocessable Entity",
    "Unprocessable Content",
    "Successful Response",
}


def _sin_frases_de_status(nodo: object) -> None:
    if isinstance(nodo, dict):
        respuestas = nodo.get("responses")
        if isinstance(respuestas, dict):
            for clave, resp in list(respuestas.items()):
                if isinstance(resp, dict) and str(clave).isdigit() and resp.get("description") in _FRASES_STATUS:
                    resp.pop("description", None)
        for valor in nodo.values():
            _sin_frases_de_status(valor)
    elif isinstance(nodo, list):
        for item in nodo:
            _sin_frases_de_status(item)


def _normalizar(doc: dict) -> dict:
    copia = copy.deepcopy(doc)
    _sin_frases_de_status(copia)
    return copia


def test_openapi_v1_guardado_coincide_con_el_generado():
    assert RUTA.is_file(), "Falta contrato/openapi-v1.json. Corré: python -m app.exportar_openapi"
    guardado = json.loads(RUTA.read_text(encoding="utf-8"))
    generado = documento()
    assert _normalizar(guardado) == _normalizar(generado)
    assert guardado["info"]["version"] == "1.0.0"
    assert "/api/v1/me" in guardado["paths"]
    assert "/api/v1/pacientes/{id}/expediente" in guardado["paths"]
    assert "/api/v1/pacientes/{id}/exportar" in guardado["paths"]
    assert "/api/v1/importar" not in guardado["paths"]
    assert "delete" not in {m for ops in guardado["paths"].values() for m in ops}

"""Escribe contrato/openapi-v1.json desde el esquema de FastAPI.

Desde backend/:

    python -m app.exportar_openapi
"""

from __future__ import annotations

import json
from pathlib import Path

RUTA = Path(__file__).resolve().parents[2] / "contrato" / "openapi-v1.json"


def documento() -> dict:
    from .main import crear_app

    return crear_app().openapi()


def serializar(doc: dict) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def escribir(ruta: Path | None = None) -> Path:
    destino = ruta or RUTA
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(serializar(documento()), encoding="utf-8")
    return destino


if __name__ == "__main__":
    print(escribir())

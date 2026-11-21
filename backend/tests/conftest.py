import sys
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from app.config import config  # noqa: E402
from app.datos import PERSONAL, almacen  # noqa: E402
from app.main import app  # noqa: E402
from app import tiempo  # noqa: E402


@pytest.fixture(autouse=True)
def _limpio():
    almacen.reiniciar()
    config.cache_clear()
    yield
    almacen.reiniciar()
    config.cache_clear()


@pytest.fixture
def cliente():
    return TestClient(app)


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def token_rol(rol: str) -> str:
    persona = next(p for p in PERSONAL.values() if p["rol"] == rol)
    return almacen.crear_sesion({"id": persona["id"], "rol": persona["rol"]}, tiempo.ahora() + timedelta(hours=8))


def assert_error(respuesta, status: int, codigo: str) -> dict:
    assert respuesta.status_code == status, respuesta.text
    cuerpo = respuesta.json()
    assert set(cuerpo) == {"error"}
    assert set(cuerpo["error"]) == {"codigo", "mensaje"}
    assert cuerpo["error"]["codigo"] == codigo
    assert cuerpo["error"]["mensaje"]
    return cuerpo

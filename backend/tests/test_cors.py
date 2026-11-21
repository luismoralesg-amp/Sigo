"""C-01: CORS desde el entorno, con credenciales y preflight.

Orígenes por defecto: localhost:3000, 127.0.0.1:3000 y https://sigo.vercel.app.
El túnel entra por regex (https://*.trycloudflare.com), no por lista.
"""

import re

from fastapi.testclient import TestClient

from app.config import ORIGENES_CORS, REGEX_TUNEL, Config, config
from app.main import crear_app

from tests.conftest import assert_error


def _opciones(cliente: TestClient, origen: str, metodo: str = "GET") -> object:
    return cliente.options(
        "/api/v1/me",
        headers={
            "Origin": origen,
            "Access-Control-Request-Method": metodo,
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )


def _preflight_ok(respuesta, origen: str) -> None:
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.headers["access-control-allow-origin"] == origen
    assert respuesta.headers["access-control-allow-credentials"] == "true"
    assert respuesta.headers["vary"] == "Origin"
    permitir = respuesta.headers["access-control-allow-headers"].lower()
    assert "authorization" in permitir
    assert "content-type" in permitir
    metodos = respuesta.headers["access-control-allow-methods"]
    assert "GET" in metodos
    assert "POST" in metodos
    assert "PUT" in metodos


def test_defaults_cubren_localhost_vercel_y_tunel(monkeypatch):
    monkeypatch.delenv("SIGO_CORS_ORIGINS", raising=False)
    monkeypatch.delenv("SIGO_CORS_ORIGIN_REGEX", raising=False)
    cfg = Config(_env_file=None)
    assert cfg.cors_origins == [o.strip() for o in ORIGENES_CORS.split(",")]
    assert "http://localhost:3000" in cfg.cors_origins
    assert "http://127.0.0.1:3000" in cfg.cors_origins
    assert "https://sigo.vercel.app" in cfg.cors_origins
    assert cfg.sigo_cors_origin_regex == REGEX_TUNEL
    assert re.fullmatch(cfg.sigo_cors_origin_regex, "https://sigo-demo-abc.trycloudflare.com")
    assert not re.fullmatch(cfg.sigo_cors_origin_regex, "https://sigo-demo-abc.trycloudflare.com.evil.test")
    assert not re.fullmatch(cfg.sigo_cors_origin_regex, "http://sigo-demo-abc.trycloudflare.com")


def test_preflight_de_los_origenes_del_front(cliente):
    for origen in (
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://sigo.vercel.app",
        "https://sigo-demo-abc.trycloudflare.com",
    ):
        _preflight_ok(_opciones(cliente, origen, "POST"), origen)
        lectura = cliente.get("/api/v1/me", headers={"Origin": origen})
        assert_error(lectura, 401, "sin_sesion")
        assert lectura.headers["access-control-allow-origin"] == origen
        assert lectura.headers["access-control-allow-credentials"] == "true"
        assert "content-disposition" in lectura.headers["access-control-expose-headers"].lower()


def test_origen_ajeno_no_pasa_el_preflight(cliente):
    for origen in (
        "https://evil.example",
        "http://localhost:3001",
        "https://otro.vercel.app",
        "https://sigo-demo-abc.trycloudflare.com.evil.test",
        "http://sigo-demo-abc.trycloudflare.com",
    ):
        respuesta = _opciones(cliente, origen)
        assert respuesta.status_code == 400, origen
        assert "access-control-allow-origin" not in respuesta.headers


def test_cors_sale_del_entorno(monkeypatch):
    monkeypatch.setenv("SIGO_CORS_ORIGINS", "http://localhost:9999")
    monkeypatch.setenv("SIGO_CORS_ORIGIN_REGEX", r"^https://tunel-[a-z]+\.example$")
    config.cache_clear()
    cliente = TestClient(crear_app())
    _preflight_ok(_opciones(cliente, "http://localhost:9999"), "http://localhost:9999")
    _preflight_ok(_opciones(cliente, "https://tunel-abc.example", "PUT"), "https://tunel-abc.example")
    for origen in ("http://localhost:3000", "https://sigo.vercel.app", "https://abc.trycloudflare.com"):
        respuesta = _opciones(cliente, origen)
        assert respuesta.status_code == 400, origen
        assert "access-control-allow-origin" not in respuesta.headers

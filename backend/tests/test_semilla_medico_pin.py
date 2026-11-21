"""Fotos de la semilla, médico canónico y advertencias siempre presentes."""

from app.config import config
from app.datos import DPI_MATEO, PIN_MATEO, personal_por_correo

from tests.conftest import auth, token_rol

SEMILLAS = (
    "rosa_2019.svg",
    "rosa_2022.svg",
    "rosa_2025.svg",
    "mateo_2024.svg",
)


def test_fotos_semilla_responden_svg(cliente):
    for nombre in SEMILLAS:
        r = cliente.get(f"/api/v1/archivos/semilla/{nombre}")
        assert r.status_code == 200, r.text
        tipo = r.headers["content-type"].split(";")[0].strip()
        assert tipo == "image/svg+xml"
        assert b"<svg" in r.content
        assert b"inventad" in r.content.lower()
    faltante = cliente.get("/api/v1/archivos/semilla/no-existe.svg")
    assert faltante.status_code == 404


def test_medico_canonico_es_mateo_us(cliente, monkeypatch):
    monkeypatch.setenv("SIGO_ENV", "desarrollo")
    monkeypatch.setenv("SIGO_DEV_LOGIN", "true")
    config.cache_clear()
    medico = cliente.post("/api/v1/dev/sesion", json={"rol": "medico"})
    assert medico.status_code == 200, medico.text
    assert medico.json()["usuario"]["nombre"] == "Dr. Mateo Us"
    assert medico.json()["usuario"]["rol"] == "medico"
    enfermera = cliente.post("/api/v1/dev/sesion", json={"rol": "enfermera"})
    assert enfermera.status_code == 200
    assert enfermera.json()["usuario"]["nombre"] == "Ana Tzul"
    alias = personal_por_correo("mario.xicara@sigo.demo")
    assert alias is not None
    assert alias["correo"] == "mateo.us@sigo.demo"
    assert alias["nombre"] == "Dr. Mateo Us"
    assert personal_por_correo("mateo.us@sigo.demo")["id"] == alias["id"]


def test_pin_de_mateo_batz_tiene_seis_digitos(cliente):
    assert PIN_MATEO == "258025"
    assert len(PIN_MATEO) == 6
    viejo = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_MATEO, "pin": "2580"})
    assert viejo.status_code == 401
    ok = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_MATEO, "pin": PIN_MATEO})
    assert ok.status_code == 200, ok.text
    assert ok.json()["paciente_id"] == "p_13"


def test_post_pacientes_siempre_trae_advertencias(cliente):
    enfermera = token_rol("enfermera")
    r = cliente.post(
        "/api/v1/pacientes",
        headers=auth(enfermera),
        json={"nombre": "Lucía Sin Aviso", "fecha_nacimiento": "2020-01-02", "sexo": "F"},
    )
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert "advertencias" in cuerpo
    assert cuerpo["advertencias"] == []

from datetime import datetime, timedelta

from app.datos import DPI_ROSA, PIN_ROSA
from app.tiempo import HORA_GT

from tests.conftest import assert_error, auth, token_rol


def _reloj(monkeypatch, inicio):
    estado = {"ahora": inicio}

    def fake():
        return estado["ahora"]

    monkeypatch.setattr("app.tiempo.ahora", fake)
    return estado


def test_cinco_pines_fallidos_bloquean_quince_minutos(cliente, monkeypatch):
    reloj = _reloj(monkeypatch, datetime(2026, 11, 21, 10, 0, tzinfo=HORA_GT))
    for _ in range(4):
        r = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_ROSA, "pin": "0000"})
        assert_error(r, 401, "pin_incorrecto")
    assert_error(cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_ROSA, "pin": "0000"}), 429, "demasiados_intentos")
    bloqueado = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_ROSA, "pin": PIN_ROSA})
    assert_error(bloqueado, 429, "demasiados_intentos")
    assert "15" in bloqueado.json()["error"]["mensaje"]

    reloj["ahora"] += timedelta(minutes=14)
    assert_error(cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_ROSA, "pin": PIN_ROSA}), 429, "demasiados_intentos")
    reloj["ahora"] += timedelta(minutes=2)
    ok = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_ROSA, "pin": PIN_ROSA})
    assert ok.status_code == 200, ok.text


def test_cinco_canjes_fallidos_bloquean_quince_minutos(cliente, monkeypatch):
    reloj = _reloj(monkeypatch, datetime(2026, 11, 21, 11, 0, tzinfo=HORA_GT))
    medico = token_rol("medico")
    paciente = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_ROSA, "pin": PIN_ROSA}).json()["token"]
    for n in range(4):
        r = cliente.post("/api/v1/codigos/canjear", headers=auth(medico), json={"codigo": f"NOPE-{n}00"})
        assert_error(r, 400, "validacion")
    assert_error(
        cliente.post("/api/v1/codigos/canjear", headers=auth(medico), json={"codigo": "NOPE-9999"}),
        429,
        "demasiados_intentos",
    )
    codigo_bloqueado = cliente.post("/api/v1/pacientes/p_12/codigos", headers=auth(paciente), json={}).json()["codigo"]
    assert_error(
        cliente.post("/api/v1/codigos/canjear", headers=auth(medico), json={"codigo": codigo_bloqueado}),
        429,
        "demasiados_intentos",
    )
    reloj["ahora"] += timedelta(minutes=16)
    codigo = cliente.post("/api/v1/pacientes/p_12/codigos", headers=auth(paciente), json={}).json()["codigo"]
    ok = cliente.post("/api/v1/codigos/canjear", headers=auth(medico), json={"codigo": codigo})
    assert ok.status_code == 200, ok.text
    assert ok.json()["paciente_id"] == "p_12"
    assert_error(
        cliente.post("/api/v1/codigos/canjear", headers=auth(medico), json={"codigo": codigo}),
        409,
        "codigo_ya_usado",
    )

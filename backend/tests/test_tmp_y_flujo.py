import re
from datetime import timedelta

from app import tiempo
from app.datos import DPI_MATEO, DPI_ROSA, PIN_MATEO

from tests.conftest import assert_error, auth, token_rol

TMP = re.compile(r"^TMP-[0-9]{8}-[A-Z0-9]{4}$")


def test_sin_dpi_asigna_tmp(cliente):
    enfermera = token_rol("enfermera")
    r = cliente.post(
        "/api/v1/pacientes",
        headers=auth(enfermera),
        json={"nombre": "Lucía Inventada", "fecha_nacimiento": "2024-05-01", "sexo": "F", "comunidad": "Chuicacá"},
    )
    assert r.status_code == 201, r.text
    dpi = r.json()["paciente"]["dpi"]
    assert TMP.fullmatch(dpi)
    assert dpi.startswith(f"TMP-{tiempo.ahora():%Y%m%d}-")
    assert re.fullmatch(r"\d{6}", r.json()["pin_inicial"])
    assert r.json()["advertencias"] == []
    assert r.json()["paciente"]["version"] == 1
    otro = cliente.post("/api/v1/pacientes", headers=auth(enfermera), json={"nombre": "Tomás Inventado"}).json()
    assert otro["paciente"]["dpi"] != dpi
    busca = cliente.get("/api/v1/pacientes/buscar", headers=auth(enfermera), params={"dpi": dpi})
    assert busca.status_code == 200
    assert busca.json()["pacientes"][0]["nombre"] == "Lucía Inventada"
    mateo = cliente.get("/api/v1/pacientes/buscar", headers=auth(enfermera), params={"dpi": DPI_MATEO})
    assert mateo.json()["pacientes"][0]["id"] == "p_13"
    assert_error(
        cliente.post("/api/v1/pacientes", headers=auth(enfermera), json={"dpi": DPI_ROSA, "nombre": "Otra"}),
        409,
        "dpi_ya_existe",
    )
    vacio = cliente.get("/api/v1/pacientes/buscar", headers=auth(enfermera), params={"dpi": "0000000000000"})
    assert vacio.status_code == 200
    assert vacio.json() == {"pacientes": []}


def test_codigo_de_un_solo_uso_y_pin(cliente, monkeypatch):
    inicio = tiempo.ahora()
    estado = {"ahora": inicio}
    monkeypatch.setattr("app.tiempo.ahora", lambda: estado["ahora"])
    paciente = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_MATEO, "pin": PIN_MATEO})
    assert paciente.status_code == 200
    token = paciente.json()["token"]
    me = cliente.get("/api/v1/me", headers=auth(token)).json()
    assert me["debe_cambiar_pin"] is True
    corto = cliente.put("/api/v1/me/pin", headers=auth(token), json={"pin_actual": PIN_MATEO, "pin_nuevo": "90341"})
    assert_error(corto, 400, "validacion")
    pin = cliente.put("/api/v1/me/pin", headers=auth(token), json={"pin_actual": PIN_MATEO, "pin_nuevo": "903417"})
    assert pin.status_code == 204
    assert cliente.get("/api/v1/me", headers=auth(token)).json()["debe_cambiar_pin"] is False

    codigo = cliente.post("/api/v1/pacientes/p_13/codigos", headers=auth(token), json={"enviar_sms": False}).json()
    assert re.fullmatch(r"[A-Z0-9]{4}-[A-Z0-9]{4}", codigo["codigo"])
    medico = token_rol("medico")
    canje = cliente.post("/api/v1/codigos/canjear", headers=auth(medico), json={"codigo": codigo["codigo"]})
    assert canje.status_code == 200
    estado["ahora"] = inicio + timedelta(minutes=11)
    vencido = cliente.post(
        "/api/v1/pacientes/p_12/codigos",
        headers=auth(token_rol("enfermera")),
        json={},
    ).json()["codigo"]
    # el código nuevo se emitió ya con el reloj adelantado; lo vencemos otros 11 minutos
    estado["ahora"] = estado["ahora"] + timedelta(minutes=11)
    assert_error(
        cliente.post("/api/v1/codigos/canjear", headers=auth(medico), json={"codigo": vencido}),
        410,
        "codigo_vencido",
    )


def test_emergencia_solo_muestra_alertas(cliente):
    medico = token_rol("medico")
    corto = cliente.post(
        "/api/v1/emergencia",
        headers=auth(medico),
        json={"dpi": DPI_ROSA, "motivo": "corto"},
    )
    assert_error(corto, 400, "motivo_requerido")
    r = cliente.post(
        "/api/v1/emergencia",
        headers=auth(medico),
        json={"dpi": DPI_ROSA, "motivo": "Llega inconsciente a emergencias"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["tipo_acceso"] == "emergencia"
    assert r.json()["paciente_id"] == "p_12"
    expediente = cliente.get("/api/v1/pacientes/p_12/expediente", headers=auth(medico)).json()
    assert expediente["consultas"] == []
    assert expediente["tipo_acceso"] == "emergencia"
    assert "penicilina" in expediente["alertas"]["alergias"]
    paciente = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_ROSA, "pin": "482193"}).json()["token"]
    accesos = cliente.get("/api/v1/pacientes/p_12/accesos", headers=auth(paciente)).json()["accesos"]
    assert accesos[0]["tipo"] == "emergencia"
    assert "inconsciente" in accesos[0]["motivo"]

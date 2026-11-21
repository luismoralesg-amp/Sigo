"""El acceso de emergencia corta asistente, versiones y descarga antes de los módulos."""

from app.datos import DPI_ROSA, PIN_ROSA, almacen
from app.modulos import cag_mock

from tests.conftest import assert_error, auth, token_rol


def _emergencia(cliente):
    medico = token_rol("medico")
    r = cliente.post(
        "/api/v1/emergencia",
        headers=auth(medico),
        json={"dpi": DPI_ROSA, "motivo": "Llega inconsciente a emergencias"},
    )
    assert r.status_code == 200, r.text
    return medico


def test_403_antes_de_llamar_modulos(cliente, monkeypatch):
    medico = _emergencia(cliente)
    llamadas = {"cag": 0, "exportar": 0, "versiones": 0}

    def boom_cag(*_a, **_k):
        llamadas["cag"] += 1
        raise AssertionError("el asistente no debe llamarse")

    def boom_export(*_a, **_k):
        llamadas["exportar"] += 1
        raise AssertionError("la exportación no debe llamarse")

    def boom_versiones(*_a, **_k):
        llamadas["versiones"] += 1
        raise AssertionError("el historial de versiones no debe armarse")

    monkeypatch.setattr("app.modulos.cag_mock.preguntar", boom_cag)
    monkeypatch.setattr("app.modulos.exportar_mock.exportar", boom_export)
    monkeypatch.setattr(almacen, "versiones_consulta", boom_versiones)

    assert_error(
        cliente.post(
            "/api/v1/pacientes/p_12/preguntar",
            headers=auth(medico),
            json={"pregunta": "¿Cuándo fue su última vacuna?"},
        ),
        403,
        "solo_emergencia",
    )
    assert_error(cliente.get("/api/v1/consultas/con_001/versiones", headers=auth(medico)), 403, "solo_emergencia")
    assert_error(
        cliente.get("/api/v1/pacientes/p_12/exportar", headers=auth(medico), params={"formato": "txt"}),
        403,
        "solo_emergencia",
    )
    assert llamadas == {"cag": 0, "exportar": 0, "versiones": 0}
    assert almacen.accesos[-1]["preguntas_hechas"] == 0


def test_con_codigo_el_asistente_si_se_llama(cliente, monkeypatch):
    paciente = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_ROSA, "pin": PIN_ROSA}).json()["token"]
    medico = token_rol("medico")
    codigo = cliente.post("/api/v1/pacientes/p_12/codigos", headers=auth(paciente), json={}).json()["codigo"]
    assert cliente.post("/api/v1/codigos/canjear", headers=auth(medico), json={"codigo": codigo}).status_code == 200
    visto = {"si": False}
    original = cag_mock.preguntar

    def espia(*args, **kwargs):
        visto["si"] = True
        return original(*args, **kwargs)

    monkeypatch.setattr("app.modulos.cag_mock.preguntar", espia)
    r = cliente.post(
        "/api/v1/pacientes/p_12/preguntar",
        headers=auth(medico),
        json={"pregunta": "¿Cuándo fue su última vacuna?"},
    )
    assert r.status_code == 200, r.text
    assert visto["si"] is True
    assert r.json()["fuentes"]

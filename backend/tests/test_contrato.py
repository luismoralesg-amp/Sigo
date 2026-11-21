from app.config import config
from app.datos import DPI_ROSA, PIN_ROSA
from app.errores import TABLA
from app.modulos.interfaces import CODIGOS_ERROR

from tests.conftest import assert_error, auth, token_rol

ESPERADOS = [
    ("get", "/api/v1/me"),
    ("post", "/api/v1/auth/paciente"),
    ("get", "/api/v1/pacientes/buscar"),
    ("post", "/api/v1/pacientes"),
    ("post", "/api/v1/pacientes/{id}/fichas"),
    ("get", "/api/v1/fichas/{id}"),
    ("post", "/api/v1/fichas/{id}/confirmar"),
    ("post", "/api/v1/consultas/{id}/versiones"),
    ("post", "/api/v1/pacientes/{id}/versiones"),
    ("get", "/api/v1/pacientes/{id}/expediente"),
    ("get", "/api/v1/consultas/{id}/versiones"),
    ("get", "/api/v1/pacientes/{id}/exportar"),
    ("post", "/api/v1/pacientes/{id}/codigos"),
    ("post", "/api/v1/codigos/canjear"),
    ("post", "/api/v1/pacientes/{id}/preguntar"),
    ("get", "/api/v1/pacientes/{id}/accesos"),
    ("put", "/api/v1/me/pin"),
    ("post", "/api/v1/emergencia"),
]


def test_dieciocho_endpoints_y_sin_delete(cliente):
    paths = cliente.app.openapi()["paths"]
    assert len(ESPERADOS) == 18
    for metodo, ruta in ESPERADOS:
        assert ruta in paths, ruta
        assert metodo in paths[ruta], (metodo, ruta)
    assert "/api/v1/importaciones" in paths
    assert "/api/v1/importar" not in paths
    for ruta, ops in paths.items():
        assert "delete" not in ops, ruta
    esquemas = cliente.app.openapi()["components"]["schemas"]
    for nombre in ("Usuario", "Paciente", "Consulta", "Expediente", "Ficha", "ErrorCuerpo"):
        assert nombre in esquemas
    codigos = esquemas["ErrorCuerpo"]["properties"]["codigo"]["enum"]
    assert "formato_no_soportado" in codigos
    assert "solo_emergencia" in codigos
    assert "ilegible" in codigos
    assert "demasiados_intentos" in codigos


def test_forma_de_error_y_tokens_fijos(cliente):
    assert_error(cliente.get("/api/v1/me"), 401, "sin_sesion")
    for fijo in ("dev-paciente", "dev-enfermera", "dev-medico"):
        assert_error(cliente.get("/api/v1/me", headers={"Authorization": f"Bearer {fijo}"}), 401, "sin_sesion")
    assert_error(cliente.post("/api/v1/importar"), 404, "no_existe")


def test_codigo_formato_no_se_reescribe():
    assert CODIGOS_ERROR["formato_no_soportado"] == (400, "formato_no_soportado")
    assert "formato_no_soportado" in TABLA[400]
    assert "validacion" not in CODIGOS_ERROR["formato_no_soportado"]


def test_me_y_login_de_rosa(cliente, monkeypatch):
    monkeypatch.setenv("SIGO_ENV", "desarrollo")
    monkeypatch.setenv("SIGO_DEV_LOGIN", "true")
    config.cache_clear()
    r = cliente.post("/api/v1/dev/sesion", json={"rol": "enfermera"})
    assert r.status_code == 200
    assert r.json()["usuario"]["debe_cambiar_pin"] is False
    r = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_ROSA, "pin": PIN_ROSA})
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["paciente_id"] == "p_12"
    me = cliente.get("/api/v1/me", headers=auth(cuerpo["token"]))
    assert me.status_code == 200
    assert me.json()["rol"] == "paciente"
    assert me.json()["centro"] is None
    assert "debe_cambiar_pin" in me.json()


def test_dev_sesion_apagada_sin_flag_y_en_produccion(cliente, monkeypatch):
    """Apagado si no se configura SIGO_DEV_LOGIN, y en producción aunque el ejemplo diga true."""
    monkeypatch.delenv("SIGO_DEV_LOGIN", raising=False)
    monkeypatch.delenv("SIGO_ENV", raising=False)
    config.cache_clear()
    assert config().sigo_dev_login is False
    assert config().dev_login_activo is False
    assert_error(cliente.post("/api/v1/dev/sesion", json={"rol": "enfermera"}), 404, "no_existe")

    monkeypatch.setenv("SIGO_ENV", "produccion")
    monkeypatch.setenv("SIGO_DEV_LOGIN", "true")
    config.cache_clear()
    assert config().sigo_dev_login is True
    assert config().dev_login_activo is False
    assert_error(cliente.post("/api/v1/dev/sesion", json={"rol": "medico"}), 404, "no_existe")

    monkeypatch.setenv("SIGO_ENV", "demo")
    config.cache_clear()
    assert_error(cliente.post("/api/v1/dev/sesion", json={"rol": "enfermera"}), 404, "no_existe")


def test_medico_sin_acceso(cliente):
    assert_error(
        cliente.get("/api/v1/pacientes/p_12/expediente", headers=auth(token_rol("medico"))),
        403,
        "acceso_vencido",
    )

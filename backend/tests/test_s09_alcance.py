"""S-09: la enfermera no lee el expediente de otro puesto.

Ve el expediente completo si el paciente es de su centro, si hay una consulta
en ese centro, o si ella lo atendió. Cada lectura queda en la bitácora de la
paciente y en el registro interno. La exportación sigue siendo solo de la
paciente (Phil, endpoint 12).
"""

from datetime import timedelta

from app import tiempo
from app.datos import CENTROS, DPI_ROSA, PERSONAL, PIN_ROSA, almacen

from tests.conftest import assert_error, auth, token_rol


def _enfermera_de(centro_id: str, nombre: str, uid: str) -> str:
    PERSONAL[uid] = {
        "id": uid,
        "nombre": nombre,
        "rol": "enfermera",
        "centro_id": centro_id,
        "correo": f"{uid}@sigo.demo",
    }
    return almacen.crear_sesion({"id": uid, "rol": "enfermera"}, tiempo.ahora() + timedelta(hours=2))


def _paciente(pid: str, dpi: str, nombre: str, centro_id: str) -> None:
    almacen.crear_paciente(
        {
            "id": pid,
            "dpi": dpi,
            "nombre": nombre,
            "fecha_nacimiento": "1990-01-01",
            "sexo": "F",
            "comunidad": "Otra",
            "alergias": ["yodo"],
            "condiciones_cronicas": [],
        },
        telefono=None,
        pin="1111",
        debe_cambiar_pin=True,
        centro_id=centro_id,
    )


def _consulta(pid: str, centro_id: str, editada_por: str) -> None:
    almacen.crear_consulta(
        pid,
        {
            "fecha": "2005-03-12",
            "centro": dict(CENTROS[centro_id]),
            "motivo": "Control",
            "diagnostico": "Sana",
            "tratamiento": "Ninguno",
            "vacunas": [],
            "original_url": "/api/v1/archivos/semilla/vieja.svg",
            "editada_por": editada_por,
            "editada_en": "2026-11-21T08:00:00-06:00",
        },
    )


def test_ana_ve_a_rosa_y_queda_en_la_bitacora(cliente):
    ana = token_rol("enfermera")
    antes = len([a for a in almacen.accesos if a["paciente_id"] == "p_12"])
    expediente = cliente.get("/api/v1/pacientes/p_12/expediente", headers=auth(ana))
    assert expediente.status_code == 200, expediente.text
    cuerpo = expediente.json()
    assert cuerpo["paciente"]["nombre"] == "Rosa Batz Tzoc"
    assert len(cuerpo["consultas"]) == 3
    assert "penicilina" in cuerpo["alertas"]["alergias"]
    assert cuerpo["tipo_acceso"] is None
    mateo = cliente.get("/api/v1/pacientes/p_13/expediente", headers=auth(ana))
    assert mateo.status_code == 200, mateo.text

    rosa = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_ROSA, "pin": PIN_ROSA}).json()["token"]
    accesos = cliente.get("/api/v1/pacientes/p_12/accesos", headers=auth(rosa)).json()["accesos"]
    assert len([a for a in almacen.accesos if a["paciente_id"] == "p_12"]) == antes + 1
    assert accesos[0]["tipo"] == "enfermera"
    assert accesos[0]["quien"] == "Ana Tzul"
    assert accesos[0]["centro"] == "Puesto de Salud Aldea Chuicacá"
    assert any(e["tipo"] == "lectura_expediente" and e["paciente_id"] == "p_12" for e in almacen.bitacora)

    versiones = cliente.get("/api/v1/consultas/con_001/versiones", headers=auth(rosa))
    assert versiones.status_code == 200, versiones.text
    assert versiones.json()["versiones"][0]["version"] == 1

    assert_error(
        cliente.get("/api/v1/pacientes/p_12/exportar", headers=auth(ana), params={"formato": "txt"}),
        403,
        "rol_no_permitido",
    )
    assert any(e["tipo"] == "acceso_denegado" and e.get("via") == "exportar" for e in almacen.bitacora)


def test_otro_centro_no_lee_ni_exporta_y_el_alta_propia_si(cliente):
    ana = token_rol("enfermera")
    elena = _enfermera_de("c_02", "Elena Choc", "u_03")
    try:
        antes = len(almacen.accesos)
        assert_error(
            cliente.get("/api/v1/pacientes/p_12/expediente", headers=auth(elena)),
            403,
            "rol_no_permitido",
        )
        assert len(almacen.accesos) == antes
        assert any(e["tipo"] == "acceso_denegado" and e["actor_id"] == "u_03" for e in almacen.bitacora)
        # Phil: buscar devuelve a Rosa si el DPI existe (200, no 403 ni 409).
        # Fuera de emergencia las alertas van vacías.
        busca = cliente.get("/api/v1/pacientes/buscar", headers=auth(elena), params={"dpi": DPI_ROSA})
        assert busca.status_code == 200
        assert busca.json()["pacientes"][0]["id"] == "p_12"
        assert busca.json()["pacientes"][0]["alergias"] == []
        assert busca.json()["pacientes"][0]["condiciones_cronicas"] == []
        assert_error(
            cliente.get("/api/v1/consultas/con_001/versiones", headers=auth(elena)),
            403,
            "rol_no_permitido",
        )
        assert_error(
            cliente.get("/api/v1/pacientes/p_12/exportar", headers=auth(elena), params={"formato": "txt"}),
            403,
            "rol_no_permitido",
        )
        assert_error(
            cliente.post("/api/v1/pacientes/p_12/codigos", headers=auth(elena), json={}),
            403,
            "rol_no_permitido",
        )

        _paciente("p_ajena", "TMP-20050312-AJ01", "Inés Aj", "c_02")
        assert_error(
            cliente.get("/api/v1/pacientes/p_ajena/expediente", headers=auth(ana)),
            403,
            "rol_no_permitido",
        )
        _consulta("p_ajena", "c_01", "Alguien del puesto")
        atendida = cliente.get("/api/v1/pacientes/p_ajena/expediente", headers=auth(ana))
        assert atendida.status_code == 200, atendida.text
        assert atendida.json()["paciente"]["nombre"] == "Inés Aj"

        _paciente("p_por_ana", "TMP-20050312-AN01", "Juana Vieja", "c_02")
        _consulta("p_por_ana", "c_02", "Ana Tzul")
        propia = cliente.get("/api/v1/pacientes/p_por_ana/expediente", headers=auth(ana))
        assert propia.status_code == 200, propia.text

        alta = cliente.post(
            "/api/v1/pacientes",
            headers=auth(ana),
            json={"nombre": "Lucía Inventada", "fecha_nacimiento": "2024-05-01", "sexo": "F"},
        )
        assert alta.status_code == 201, alta.text
        pid = alta.json()["paciente"]["id"]
        assert almacen.pacientes_meta[pid]["centro_id"] == "c_01"
        abierto = cliente.get(f"/api/v1/pacientes/{pid}/expediente", headers=auth(ana))
        assert abierto.status_code == 200, abierto.text
        assert_error(
            cliente.get(f"/api/v1/pacientes/{pid}/expediente", headers=auth(elena)),
            403,
            "rol_no_permitido",
        )
    finally:
        PERSONAL.pop("u_03", None)


CAMPOS_PACIENTE = {
    "id",
    "dpi",
    "nombre",
    "fecha_nacimiento",
    "sexo",
    "comunidad",
    "alergias",
    "condiciones_cronicas",
    "version",
}


def test_buscar_mismo_centro_sin_emergencia_oculta_alertas(cliente):
    ana = token_rol("enfermera")
    almacen.pacientes["p_12"][-1]["condiciones_cronicas"] = ["hipertension"]
    r = cliente.get("/api/v1/pacientes/buscar", headers=auth(ana), params={"dpi": DPI_ROSA})
    assert r.status_code == 200, r.text
    assert set(r.json()) == {"pacientes"}
    paciente = r.json()["pacientes"][0]
    assert set(paciente) == CAMPOS_PACIENTE
    assert paciente["id"] == "p_12"
    assert paciente["nombre"] == "Rosa Batz Tzoc"
    assert paciente["alergias"] == []
    assert paciente["condiciones_cronicas"] == []
    expediente = cliente.get("/api/v1/pacientes/p_12/expediente", headers=auth(ana))
    assert expediente.status_code == 200, expediente.text
    assert expediente.json()["paciente"]["alergias"] == ["penicilina"]
    assert expediente.json()["paciente"]["condiciones_cronicas"] == ["hipertension"]
    assert expediente.json()["alertas"]["alergias"] == ["penicilina"]


def test_buscar_mismo_centro_en_emergencia_muestra_alertas(cliente):
    ana = token_rol("enfermera")
    almacen.pacientes["p_12"][-1]["condiciones_cronicas"] = ["hipertension"]
    r = cliente.get(
        "/api/v1/pacientes/buscar",
        headers=auth(ana),
        params={"dpi": DPI_ROSA, "emergencia": "true"},
    )
    assert r.status_code == 200, r.text
    assert set(r.json()) == {"pacientes"}
    paciente = r.json()["pacientes"][0]
    assert set(paciente) == CAMPOS_PACIENTE
    assert paciente["id"] == "p_12"
    assert paciente["alergias"] == ["penicilina"]
    assert paciente["condiciones_cronicas"] == ["hipertension"]

from urllib.parse import urlparse

from app.datos import DPI_ROSA, almacen

from tests.conftest import assert_error, auth, token_rol


def _subir(cliente, token, client_id="11111111-1111-4111-8111-111111111111", contenido=b"\xff\xd8foto"):
    return cliente.post(
        "/api/v1/pacientes/p_12/fichas",
        headers=auth(token),
        data={"client_id": client_id, "capturada_en": "2026-11-21T10:00:00-06:00"},
        files=[("imagenes", ("pagina.jpg", contenido, "image/jpeg"))],
    )


def _confirmar(cliente, token, ficha_id, consentimiento=True, extra=None):
    cuerpo = {
        "paciente": {
            "nombre": "Rosa Batz Tzoc",
            "fecha_nacimiento": "1984-03-12",
            "sexo": "F",
            "comunidad": "Chuicacá",
            "alergias": ["penicilina", "sulfa"],
            "condiciones_cronicas": ["hipertension"],
        },
        "consultas": [
            {
                "fecha": "2025-08-14",
                "motivo": "Control prenatal",
                "diagnostico": "Embarazo 24 semanas",
                "tratamiento": "Sulfato ferroso",
                "vacunas": ["Td", "Influenza"],
                "pagina": 0,
            }
        ],
        "consentimiento": consentimiento,
    }
    if extra:
        cuerpo.update(extra)
    return cliente.post(f"/api/v1/fichas/{ficha_id}/confirmar", headers=auth(token), json=cuerpo)


def test_confirmar_persiste_paciente_consulta_alergias_y_vacunas(cliente):
    enfermera = token_rol("enfermera")
    antes = len(almacen.consultas_de("p_12"))
    subida = _subir(cliente, enfermera)
    assert subida.status_code == 200, subida.text
    ficha = subida.json()
    assert ficha["estado"] == "lista"
    assert ficha["extraccion"]["paciente"]["dpi"]["valor"] == DPI_ROSA
    assert ficha["extraccion"]["consultas"][0]["diagnostico"]["confianza"] == "baja"

    url = urlparse(ficha["imagenes"][0])
    foto = cliente.get(url.path + "?" + url.query)
    assert foto.status_code == 200
    assert foto.content.startswith(b"\xff\xd8")

    r = _confirmar(cliente, enfermera, ficha["id"])
    assert r.status_code == 201, r.text
    assert r.json() == {"consultas_creadas": 1, "version": 1}

    expediente = cliente.get("/api/v1/pacientes/p_12/expediente", headers=auth(enfermera)).json()
    assert expediente["paciente"]["version"] == 2
    assert expediente["paciente"]["alergias"] == ["penicilina", "sulfa"]
    assert expediente["paciente"]["condiciones_cronicas"] == ["hipertension"]
    assert len(expediente["consultas"]) == antes + 1
    nueva = next(c for c in expediente["consultas"] if c["vacunas"] == ["Td", "Influenza"])
    assert nueva["version"] == 1
    assert nueva["original_url"] == ficha["imagenes"][0]
    assert nueva["tratamiento"] == "Sulfato ferroso"
    assert any(c["id"] == "con_001" for c in expediente["consultas"])
    assert almacen.pacientes["p_12"][0]["alergias"] == ["penicilina"]
    assert almacen.pacientes["p_12"][0]["version"] == 1
    assert any(e["tipo"] == "confirmacion" and e["originales"] == [ficha["imagenes"][0]] for e in almacen.bitacora)

    otra = cliente.post(
        f"/api/v1/consultas/{nueva['id']}/versiones",
        headers=auth(enfermera),
        json={"fecha": "2025-08-15", "motivo_cambio": "Fecha mal leída"},
    )
    assert otra.status_code == 201, otra.text
    assert otra.json()["version"] == 2
    assert otra.json()["original_url"] == ficha["imagenes"][0]
    versiones = cliente.get(f"/api/v1/consultas/{nueva['id']}/versiones", headers=auth(enfermera)).json()["versiones"]
    assert [v["version"] for v in versiones] == [2, 1]
    assert versiones[1]["datos"]["fecha"] == "2025-08-14"
    assert versiones[1]["motivo_cambio"] is None

    assert_error(_confirmar(cliente, enfermera, ficha["id"]), 409, "ficha_ya_confirmada")


def test_sin_consentimiento_no_guarda(cliente):
    enfermera = token_rol("enfermera")
    ficha = _subir(cliente, enfermera, client_id="22222222-2222-4222-8222-222222222222").json()
    antes = len(almacen.consultas_de("p_12"))
    assert_error(_confirmar(cliente, enfermera, ficha["id"], consentimiento=False), 400, "sin_consentimiento")
    assert len(almacen.consultas_de("p_12")) == antes
    assert almacen.paciente("p_12")["version"] == 1


def test_el_dpi_no_se_manda_en_confirmar(cliente):
    enfermera = token_rol("enfermera")
    ficha = _subir(cliente, enfermera, client_id="33333333-3333-4333-8333-333333333333").json()
    r = cliente.post(
        f"/api/v1/fichas/{ficha['id']}/confirmar",
        headers=auth(enfermera),
        json={
            "paciente": {"dpi": "1000000100801", "alergias": ["penicilina"]},
            "consultas": [],
            "consentimiento": True,
        },
    )
    assert_error(r, 400, "validacion")

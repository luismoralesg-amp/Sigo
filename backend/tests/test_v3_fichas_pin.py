"""Contrato v3 sumado: listado de fichas, advertencias y PIN de 6 dígitos."""

from app.datos import DPI_ROSA, PIN_ROSA, almacen
from app.dpi import calcular_digito_verificador

from tests.conftest import assert_error, auth, token_rol

CSV = """dpi,nombre,sexo,fecha,motivo,notas
1000000100801,Ana Inventada,F,2024-01-02,Control,ok
""".encode()


def _dpi_valido(correlativo: str = "30000001") -> str:
    dv = calcular_digito_verificador(correlativo)
    assert dv is not None
    return f"{correlativo}{dv}0801"


def _subir(cliente, token, client_id: str):
    return cliente.post(
        "/api/v1/pacientes/p_12/fichas",
        headers=auth(token),
        data={"client_id": client_id, "capturada_en": "2026-11-21T10:00:00-06:00"},
        files=[("imagenes", ("pagina.jpg", b"\xff\xd8foto", "image/jpeg"))],
    )


def test_get_fichas_filtra_estado_e_importacion_y_respeta_s09(cliente):
    enfermera = token_rol("enfermera")
    medico = token_rol("medico")
    assert_error(cliente.get("/api/v1/fichas", headers=auth(medico)), 403, "rol_no_permitido")
    rosa = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_ROSA, "pin": PIN_ROSA}).json()["token"]
    assert_error(cliente.get("/api/v1/fichas", headers=auth(rosa), params={"estado": "lista"}), 403, "rol_no_permitido")

    subida = _subir(cliente, enfermera, "11111111-1111-4111-8111-111111111111")
    assert subida.status_code == 200, subida.text
    foto = subida.json()
    assert foto["origen"] == "foto"
    assert foto["importacion_id"] is None
    assert foto["originales"] == foto["imagenes"]
    assert foto["originales"]

    lista = cliente.get("/api/v1/fichas", headers=auth(enfermera), params={"estado": "lista"})
    assert lista.status_code == 200, lista.text
    assert [f["id"] for f in lista.json()["fichas"]] == [foto["id"]]
    sin_estado = cliente.get("/api/v1/fichas", headers=auth(enfermera))
    assert [f["id"] for f in sin_estado.json()["fichas"]] == [foto["id"]]
    assert cliente.get(
        "/api/v1/fichas", headers=auth(enfermera), params={"estado": "lista", "importacion_id": "imp_no"}
    ).json() == {"fichas": []}

    otra_centro = almacen.crear_paciente(
        {
            "dpi": _dpi_valido("30000002"),
            "nombre": "Elena Aj",
            "fecha_nacimiento": "1991-01-01",
            "sexo": "F",
            "comunidad": "Otro",
            "alergias": [],
            "condiciones_cronicas": [],
        },
        telefono=None,
        pin="111111",
        centro_id="c_02",
    )
    almacen.fichas["f_ajena"] = {
        "id": "f_ajena",
        "paciente_id": otra_centro["id"],
        "origen": "foto",
        "importacion_id": None,
        "client_id": "ajena",
        "estado": "lista",
        "imagenes": ["https://ejemplo.invalid/ajena.jpg"],
        "extraccion": None,
        "error": None,
        "creada_en": "2099-01-01T00:00:00-06:00",
    }
    ids = [f["id"] for f in cliente.get("/api/v1/fichas", headers=auth(enfermera)).json()["fichas"]]
    assert "f_ajena" not in ids
    assert_error(cliente.get("/api/v1/fichas/f_ajena", headers=auth(enfermera)), 403, "rol_no_permitido")

    cuerpo = {
        "paciente": {
            "nombre": "Rosa Batz Tzoc",
            "fecha_nacimiento": "1984-03-12",
            "sexo": "F",
            "comunidad": "Chuicacá",
            "alergias": ["penicilina"],
            "condiciones_cronicas": [],
        },
        "consultas": [
            {
                "fecha": "2025-08-14",
                "motivo": "Control",
                "diagnostico": "Control",
                "tratamiento": "Ninguno",
                "vacunas": [],
                "pagina": 0,
            }
        ],
        "consentimiento": True,
    }
    assert cliente.post(f"/api/v1/fichas/{foto['id']}/confirmar", headers=auth(enfermera), json=cuerpo).status_code == 201
    assert cliente.get("/api/v1/fichas", headers=auth(enfermera), params={"estado": "lista"}).json() == {"fichas": []}
    confirmadas = cliente.get("/api/v1/fichas", headers=auth(enfermera), params={"estado": "confirmada"}).json()["fichas"]
    assert [f["id"] for f in confirmadas] == [foto["id"]]

    imp = cliente.post(
        "/api/v1/importaciones",
        headers=auth(enfermera),
        files={"archivo": ("pacientes.csv", CSV, "text/csv")},
    )
    assert imp.status_code == 201, imp.text
    cuerpo_imp = imp.json()
    assert set(cuerpo_imp) == {"importacion_id", "total_filas", "creados", "actualizados", "con_errores", "filas"}
    assert cuerpo_imp["filas"][0]["estado"] == "creado"
    fichas_imp = cliente.get(
        "/api/v1/fichas",
        headers=auth(enfermera),
        params={"estado": "lista", "importacion_id": cuerpo_imp["importacion_id"]},
    ).json()["fichas"]
    assert len(fichas_imp) == 1
    assert fichas_imp[0]["origen"] == "importacion"
    assert fichas_imp[0]["importacion_id"] == cuerpo_imp["importacion_id"]
    assert fichas_imp[0]["client_id"] is None
    assert fichas_imp[0]["imagenes"] == []
    assert fichas_imp[0]["originales"]
    assert fichas_imp[0]["estado"] == "lista"


def test_advertencias_de_alta(cliente):
    enfermera = token_rol("enfermera")
    dudoso = cliente.post(
        "/api/v1/pacientes",
        headers=auth(enfermera),
        json={"dpi": "2547896310801", "nombre": "Copia Inventada", "fecha_nacimiento": "1990-04-04", "sexo": "F"},
    )
    assert dudoso.status_code == 201, dudoso.text
    assert dudoso.json()["advertencias"] == ["dpi_dudoso"]
    assert dudoso.json()["paciente"]["dpi"] == "2547896310801"
    assert re_pin(dudoso.json()["pin_inicial"])

    duplicada = cliente.post(
        "/api/v1/pacientes",
        headers=auth(enfermera),
        json={"dpi": _dpi_valido(), "nombre": "rosa   batz tzoc", "fecha_nacimiento": "1984-03-12", "sexo": "F"},
    )
    assert duplicada.status_code == 201, duplicada.text
    assert duplicada.json()["advertencias"] == ["posible_duplicado"]
    assert duplicada.json()["paciente"]["id"] != "p_12"

    otra_fecha = cliente.post(
        "/api/v1/pacientes",
        headers=auth(enfermera),
        json={"dpi": _dpi_valido("30000003"), "nombre": "Rosa Batz Tzoc", "fecha_nacimiento": "1999-09-09", "sexo": "F"},
    )
    assert otra_fecha.status_code == 201, otra_fecha.text
    assert otra_fecha.json()["advertencias"] == []

    assert_error(
        cliente.post("/api/v1/pacientes", headers=auth(enfermera), json={"dpi": DPI_ROSA, "nombre": "Otra"}),
        409,
        "dpi_ya_existe",
    )


def test_pin_de_rosa_es_de_seis_y_el_viejo_no_entra(cliente):
    assert PIN_ROSA == "482193"
    viejo = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_ROSA, "pin": "4821"})
    assert_error(viejo, 401, "pin_incorrecto")
    ok = cliente.post("/api/v1/auth/paciente", json={"dpi": DPI_ROSA, "pin": "482193"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["paciente_id"] == "p_12"


def test_importacion_grande_es_413(cliente):
    enfermera = token_rol("enfermera")
    enorme = b"a" * (20 * 1024 * 1024 + 1)
    r = cliente.post(
        "/api/v1/importaciones",
        headers=auth(enfermera),
        files={"archivo": ("grande.csv", enorme, "text/csv")},
    )
    assert_error(r, 413, "archivo_muy_grande")


def re_pin(pin: str) -> bool:
    return len(pin) == 6 and pin.isdigit()

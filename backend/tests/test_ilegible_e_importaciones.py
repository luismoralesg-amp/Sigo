from app.datos import almacen
from app.extraccion import normalizar_extraccion

from tests.conftest import assert_error, auth, token_rol

CSV = """dpi,nombre,sexo,fecha,motivo,notas
1000000100801,Ana Inventada,F,2024-01-02,Control,ok
1234567800101,Pedro Inventado,X,2024-03-03,Dolor,revisar
,,,,,no se lee
""".encode()


def test_ficha_ilegible_responde_422(cliente):
    enfermera = token_rol("enfermera")
    r = cliente.post(
        "/api/v1/pacientes/p_12/fichas",
        headers=auth(enfermera),
        data={"client_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
        files=[("imagenes", ("mala.jpg", b"ILEGIBLE-foto", "image/jpeg"))],
    )
    assert_error(r, 422, "ilegible")
    vacia = cliente.post(
        "/api/v1/pacientes/p_12/fichas",
        headers=auth(enfermera),
        data={"client_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},
        files=[("imagenes", ("vacia.jpg", b"", "image/jpeg"))],
    )
    assert_error(vacia, 422, "ilegible")
    assert not any(f["client_id"].startswith("aaaa") or f["client_id"].startswith("bbbb") for f in almacen.fichas.values())


def test_importaciones_forma_y_reglas(cliente):
    enfermera = token_rol("enfermera")
    r = cliente.post(
        "/api/v1/importaciones",
        headers=auth(enfermera),
        files={"archivo": ("pacientes.csv", CSV, "text/csv")},
    )
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert set(cuerpo) == {"importacion_id", "total_filas", "creados", "actualizados", "con_errores", "filas"}
    assert cuerpo["total_filas"] == 3
    assert cuerpo["creados"] == 2
    assert cuerpo["actualizados"] == 0
    assert cuerpo["con_errores"] == 1
    assert cuerpo["creados"] + cuerpo["actualizados"] + cuerpo["con_errores"] == cuerpo["total_filas"]
    buena, revisable, ilegible = cuerpo["filas"]
    assert buena["estado"] == "creado" and buena["error"] is None and buena["dpi"] == "1000000100801"
    assert revisable["estado"] == "creado" and revisable["error"] is None
    assert revisable["dpi"] == "1234567800101"
    assert ilegible == {
        "fila": 3,
        "dpi": None,
        "estado": "error",
        "expediente_id": None,
        "error": ilegible["error"],
    }
    assert ilegible["error"]
    ficha_revisable = next(f for f in almacen.fichas.values() if f["paciente_id"] == revisable["expediente_id"])
    assert ficha_revisable["estado"] == "lista"
    assert ficha_revisable["extraccion"]["paciente"]["dpi"]["confianza"] == "baja"
    assert ficha_revisable["extraccion"]["paciente"]["dpi"]["valor"] == "1234567800101"
    assert ficha_revisable["extraccion"]["paciente"]["sexo"] == {"valor": None, "confianza": "baja"}
    assert ficha_revisable["extraccion"]["consultas"][0]["pagina"] == 0
    assert almacen.consultas_de(buena["expediente_id"]) == []

    otra = cliente.post(
        "/api/v1/importaciones",
        headers=auth(enfermera),
        files={"archivo": ("otra.csv", b"dpi,nombre\n1000000100801,Ana Inventada\n", "text/csv")},
    )
    assert otra.json()["actualizados"] == 1
    assert otra.json()["filas"][0]["estado"] == "actualizado"
    assert otra.json()["con_errores"] == 0


def test_formato_no_soportado_y_access_pide_mdbtools(cliente):
    enfermera = token_rol("enfermera")
    malo = cliente.post(
        "/api/v1/importaciones",
        headers=auth(enfermera),
        files={"archivo": ("viejos.txt", b"hola", "text/plain")},
    )
    assert_error(malo, 400, "formato_no_soportado")
    access = cliente.post(
        "/api/v1/importaciones",
        headers=auth(enfermera),
        files={"archivo": ("viejos.accdb", b"no-es-access", "application/octet-stream")},
    )
    assert_error(access, 503, "ia_no_disponible")
    assert "mdbtools" in access.json()["error"]["mensaje"]
    paciente = cliente.post("/api/v1/auth/paciente", json={"dpi": "2547896330801", "pin": "4821"}).json()["token"]
    exportar = cliente.get("/api/v1/pacientes/p_12/exportar", headers=auth(paciente), params={"formato": "zzz"})
    assert_error(exportar, 400, "formato_no_soportado")
    txt = cliente.get("/api/v1/pacientes/p_12/exportar", headers=auth(paciente), params={"formato": "txt"})
    assert txt.status_code == 200
    assert "attachment" in txt.headers["content-disposition"]
    assert "penicilina" in txt.text


def test_confianza_numerica_v0_no_sale(cliente):
    extr = normalizar_extraccion(
        {
            "paciente": {
                "nombre": {"valor": "Ana", "confianza": 0.95},
                "dpi": {"valor": "1000000100801", "confianza": 0.2},
                "fecha_nacimiento": {"valor": "1990-01-01", "confianza": "alta"},
                "sexo": {"valor": "X", "confianza": 1},
                "comunidad": {"valor": "Chuicacá", "confianza": "alta"},
                "alergias": {"valor": [], "confianza": "alta"},
                "condiciones_cronicas": {"valor": [], "confianza": "alta"},
            },
            "consultas": [{"fecha": {"valor": "2024-01-01", "confianza": "alta"}, "motivo": {"valor": "Control", "confianza": "alta"},
                           "diagnostico": {"valor": None, "confianza": "baja"}, "tratamiento": {"valor": None, "confianza": "baja"},
                           "vacunas": {"valor": [], "confianza": "baja"}, "pagina": 3}],
        },
        forzar_pagina_0=True,
    )
    assert extr["paciente"]["nombre"]["confianza"] == "alta"
    assert extr["paciente"]["dpi"]["confianza"] == "baja"
    assert extr["paciente"]["sexo"]["valor"] is None
    assert extr["consultas"][0]["pagina"] == 0
    assert "error" not in extr

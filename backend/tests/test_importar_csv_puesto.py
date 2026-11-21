"""El CSV de la demo del puesto: encabezados del libro, DPI y fechas mixtas.

Los nombres y los DPI son inventados (el archivo de ejemplo del front).
"""

from __future__ import annotations

import csv
import io
import re
from pathlib import Path

from app.datos import almacen
from app.dpi import validar_cui
from app.modulos.importar_mock import leer_archivo, normalizar_dpi, normalizar_fecha

from tests.conftest import auth, token_rol

CSV_PUESTO = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "public"
    / "ejemplos"
    / "registro_puesto_2015_2022.csv"
)
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def test_normalizar_dpi_guiones_espacios_y_regla_existente():
    assert normalizar_dpi("2547-89633-0801") == "2547896330801"
    assert normalizar_dpi("1652 94644 0901") == "1652946440901"
    assert normalizar_dpi("8421-69907-0802") == "8421699070802"
    assert normalizar_dpi("  2652 48232 0802 ") == "2652482320802"
    assert normalizar_dpi("") is None
    assert normalizar_dpi(None) is None
    assert normalizar_dpi("abc") is None
    # Menos de 13 dígitos: se devuelve lo que hay; el import no lo usa como DPI.
    assert normalizar_dpi("12-34") == "1234"

    bueno = validar_cui(normalizar_dpi("2547-89633-0801"))
    assert bueno.valido
    assert bueno.cui == "2547896330801"
    assert bueno.advertencias == []

    # Verificador que no cuadra: la regla existente avisa y no tira el número.
    dudoso = validar_cui(normalizar_dpi("2547-89631-0801"))
    assert dudoso.cui == "2547896310801"
    assert dudoso.advertencias

    corto = leer_archivo("x.csv", "NOMBRE_PAC,No. DPI\nAna Inventada,12-34\n".encode())
    assert corto[0]["dpi"] is None
    assert corto[0]["extraccion"]["paciente"]["nombre"]["valor"] == "Ana Inventada"
    assert corto[0]["extraccion"]["paciente"]["dpi"]["confianza"] == "baja"

    mal_verificador = leer_archivo(
        "x.csv", "nombre,dpi\nAna Inventada,2547-89631-0801\n".encode()
    )
    assert mal_verificador[0]["dpi"] == "2547896310801"
    assert mal_verificador[0]["extraccion"]["paciente"]["dpi"]["confianza"] == "baja"


def test_normalizar_fechas_mixtas_y_la_ilegible_no_revienta():
    assert normalizar_fecha("22/5/2019") == "2019-05-22"
    assert normalizar_fecha("11-04-2016") == "2016-04-11"
    assert normalizar_fecha("2015-11-24") == "2015-11-24"
    assert normalizar_fecha("12/07/22") == "2022-07-12"
    assert normalizar_fecha("02/09/66") == "1966-09-02"
    assert normalizar_fecha("28/12/69") == "1969-12-28"
    # El mes no cabe en día/mes: se lee como mes/día.
    assert normalizar_fecha("06/19/1962") == "1962-06-19"
    assert normalizar_fecha("12/30/2021") == "2021-12-30"
    assert normalizar_fecha("") is None
    assert normalizar_fecha(None) is None
    assert normalizar_fecha("??/??/17") is None
    assert normalizar_fecha("no es una fecha") is None
    assert normalizar_fecha("31/02/2020") is None

    fila = leer_archivo(
        "x.csv",
        "NOMBRE_PAC,FEC_NAC,FECHA CONSULTA,MOTIVO\n"
        "XICARA XICARA FRANCISCA,??/??/17,??/??/17,Control\n".encode(),
    )
    assert fila[0]["extraccion"]["paciente"]["nombre"]["valor"] == "XICARA XICARA FRANCISCA"
    nacimiento = fila[0]["extraccion"]["paciente"]["fecha_nacimiento"]
    consulta = fila[0]["extraccion"]["consultas"][0]["fecha"]
    assert nacimiento == {"valor": None, "confianza": "baja"}
    assert consulta == {"valor": None, "confianza": "baja"}
    assert fila[0]["extraccion"]["consultas"][0]["motivo"]["valor"] == "Control"


def test_csv_ejemplo_puesto_reconoce_columnas(cliente):
    contenido = CSV_PUESTO.read_bytes()
    crudas = list(csv.DictReader(io.StringIO(contenido.decode("utf-8-sig"))))
    assert crudas, "el CSV de ejemplo no trae filas"
    assert all((fila.get("NOMBRE_PAC") or "").strip() for fila in crudas)

    enfermera = token_rol("enfermera")
    respuesta = cliente.post(
        "/api/v1/importaciones",
        headers=auth(enfermera),
        files={"archivo": ("registro_puesto_2015_2022.csv", contenido, "text/csv")},
    )
    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["total_filas"] == len(crudas)
    assert cuerpo["con_errores"] == 0
    assert cuerpo["creados"] + cuerpo["actualizados"] == cuerpo["total_filas"]
    por_fila = {item["fila"]: item for item in cuerpo["filas"]}
    assert por_fila[2]["dpi"] == "8421699070802"
    assert por_fila[2]["estado"] in {"creado", "actualizado"}
    assert por_fila[2]["error"] is None
    assert por_fila[3]["dpi"].startswith("TMP-")
    assert por_fila[4]["dpi"] == "1876543210901"
    assert por_fila[9]["dpi"] == "1652946440901"
    assert por_fila[33]["estado"] != "error"

    fichas = cliente.get(
        "/api/v1/fichas",
        headers=auth(enfermera),
        params={"importacion_id": cuerpo["importacion_id"]},
    )
    assert fichas.status_code == 200, fichas.text
    lista = fichas.json()["fichas"]
    assert len(lista) == cuerpo["total_filas"]

    for ficha in lista:
        assert ficha["estado"] == "lista"
        assert ficha["origen"] == "importacion"
        nombre = ficha["extraccion"]["paciente"]["nombre"]["valor"]
        assert nombre and nombre.strip()
        assert nombre != "Sin nombre"
        paciente = ficha["extraccion"]["paciente"]
        if paciente["fecha_nacimiento"]["valor"]:
            assert ISO.fullmatch(paciente["fecha_nacimiento"]["valor"])
        if paciente["sexo"]["valor"] is not None:
            assert paciente["sexo"]["valor"] in {"F", "M"}
        dpi = paciente["dpi"]["valor"]
        if dpi:
            assert dpi.isdigit() and len(dpi) == 13
        for consulta in ficha["extraccion"]["consultas"]:
            assert consulta["pagina"] == 0
            if consulta["fecha"]["valor"]:
                assert ISO.fullmatch(consulta["fecha"]["valor"])
            else:
                assert consulta["fecha"]["confianza"] == "baja"

    def una(nombre: str, fecha_consulta: str | None):
        halladas = []
        for ficha in lista:
            paciente = ficha["extraccion"]["paciente"]
            if paciente["nombre"]["valor"] != nombre:
                continue
            fechas = [c["fecha"]["valor"] for c in ficha["extraccion"]["consultas"]]
            if fecha_consulta in fechas or (fecha_consulta is None and None in fechas):
                halladas.append(ficha)
        assert len(halladas) == 1, (nombre, fecha_consulta, len(halladas))
        return halladas[0]

    pedro = una("BATZ BATZ PEDRO", "2019-05-22")
    assert pedro["extraccion"]["paciente"]["dpi"]["valor"] == "2652482320802"
    assert pedro["extraccion"]["paciente"]["sexo"]["valor"] == "M"
    assert pedro["extraccion"]["paciente"]["comunidad"]["valor"] == "Chuicacá"
    assert pedro["extraccion"]["paciente"]["fecha_nacimiento"]["valor"] is None
    assert pedro["extraccion"]["paciente"]["alergias"]["valor"] == []
    consulta = pedro["extraccion"]["consultas"][0]
    assert consulta["motivo"]["valor"] == "FIEBRE Y TOS"
    assert consulta["diagnostico"]["valor"] == "IRA"
    assert consulta["tratamiento"]["valor"] == "ACETAMINOFEN 500MG C/8H"
    assert consulta["vacunas"]["valor"] == ["TD"]

    santos = una("VASQUEZ XICARA SANTOS MANUEL", "2016-04-11")
    assert santos["extraccion"]["paciente"]["dpi"]["valor"] == "8421699070802"
    assert santos["extraccion"]["paciente"]["fecha_nacimiento"]["valor"] == "2015-11-24"
    assert santos["extraccion"]["paciente"]["sexo"]["valor"] == "M"
    assert santos["extraccion"]["paciente"]["comunidad"]["valor"] == "aldea chuicaca"

    juana = una("COYOY PU JUANA", "2022-07-12")
    assert juana["extraccion"]["paciente"]["dpi"]["valor"] is None
    assert juana["extraccion"]["paciente"]["fecha_nacimiento"]["valor"] == "1962-06-19"
    assert juana["extraccion"]["paciente"]["sexo"]["valor"] == "F"
    assert juana["extraccion"]["paciente"]["comunidad"]["valor"] == "Chuicacá"

    francisco = una("AJPACAJA CHOX FRANCISCO", "2016-10-03")
    assert francisco["extraccion"]["paciente"]["dpi"]["valor"] == "1876543210901"
    assert francisco["extraccion"]["paciente"]["fecha_nacimiento"]["valor"] == "1966-09-02"
    assert francisco["extraccion"]["paciente"]["sexo"]["valor"] == "M"
    assert francisco["extraccion"]["paciente"]["comunidad"]["valor"] == "PARAJE XECANCHAVOX"
    assert francisco["extraccion"]["paciente"]["alergias"]["valor"] == ["SULFAS"]
    assert francisco["extraccion"]["paciente"]["condiciones_cronicas"]["valor"] == ["DM2"]

    tomas = una("COYOY IXCOY TOMAS ANDRES", "2022-04-03")
    assert tomas["extraccion"]["paciente"]["dpi"]["valor"] == "1652946440901"
    assert tomas["extraccion"]["paciente"]["fecha_nacimiento"]["valor"] == "1976-12-19"
    assert tomas["extraccion"]["paciente"]["sexo"]["valor"] is None
    assert tomas["extraccion"]["paciente"]["comunidad"]["valor"] == "Chuicacá"
    assert tomas["extraccion"]["paciente"]["alergias"]["valor"] == ["PNC"]

    manuela = una("chan yax manuela", "2022-12-11")
    assert manuela["extraccion"]["paciente"]["dpi"]["valor"] == "9152111750803"
    assert manuela["extraccion"]["paciente"]["sexo"]["valor"] == "F"
    assert manuela["extraccion"]["paciente"]["comunidad"]["valor"] == "CHUICACA, TOTO"
    assert manuela["extraccion"]["paciente"]["alergias"]["valor"] == ["SULFAS"]

    francisca = una("XICARA XICARA FRANCISCA FRANCISCA", None)
    assert francisca["extraccion"]["paciente"]["nombre"]["valor"] == "XICARA XICARA FRANCISCA FRANCISCA"
    assert francisca["extraccion"]["paciente"]["sexo"]["valor"] == "F"
    assert francisca["extraccion"]["paciente"]["alergias"]["valor"] == []
    assert francisca["extraccion"]["consultas"][0]["fecha"] == {"valor": None, "confianza": "baja"}

    assert almacen.consultas_de(por_fila[1]["expediente_id"]) == []
    assert any(
        evento.get("tipo") == "importacion" and evento.get("importacion_id") == cuerpo["importacion_id"]
        for evento in almacen.bitacora
    )

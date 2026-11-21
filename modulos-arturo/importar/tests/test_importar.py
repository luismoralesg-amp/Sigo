"""Pruebas del prototipo de importar. Datos de las fixtures: INVENTADOS."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pytest

from sigo_modulos.errores import ErrorModulo
from sigo_modulos.importar import leer_archivo

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"

DPI_MARTA = "2468100090901"
DPI_JOSE = "2468100170901"
DPI_PEDRO = "2468100330901"

CAMPOS_PACIENTE = (
    "nombre",
    "dpi",
    "fecha_nacimiento",
    "sexo",
    "comunidad",
    "alergias",
    "condiciones_cronicas",
)
CAMPOS_CONSULTA = ("fecha", "motivo", "diagnostico", "tratamiento", "vacunas")


@pytest.fixture
def real(monkeypatch):
    monkeypatch.setenv("SIGO_IMPORTAR_IMPL", "real")


@pytest.fixture
def mock(monkeypatch):
    monkeypatch.setenv("SIGO_IMPORTAR_IMPL", "mock")


def _cargar(nombre: str) -> bytes:
    return (FIXTURES / nombre).read_bytes()


def _forma(fila: dict) -> None:
    assert set(fila) >= {"dpi", "fila", "extraccion"}
    if fila["dpi"] is not None:
        assert isinstance(fila["dpi"], str) and fila["dpi"].isdigit() and len(fila["dpi"]) == 13
        assert not fila["dpi"].startswith("TMP-")
    assert isinstance(fila["fila"], int) and fila["fila"] >= 1
    ext = fila["extraccion"]
    assert "paciente" in ext and "consultas" in ext
    for campo in CAMPOS_PACIENTE:
        c = ext["paciente"][campo]
        assert set(c) == {"valor", "confianza"}
        assert c["confianza"] in ("alta", "baja")
    for cons in ext["consultas"]:
        for campo in CAMPOS_CONSULTA:
            c = cons[campo]
            assert set(c) == {"valor", "confianza"}
            assert c["confianza"] in ("alta", "baja")
        assert cons["pagina"] == 0
    if "error" in ext:
        assert isinstance(ext["error"], str) and ext["error"]


def test_mock_es_el_default_y_es_determinista(monkeypatch):
    monkeypatch.delenv("SIGO_IMPORTAR_IMPL", raising=False)
    a = leer_archivo("cualquier.csv", b"esto se ignora")
    b = leer_archivo("otro.xlsx", b"tambien")
    assert a == b
    assert len(a) == 3
    for fila in a:
        _forma(fila)
    assert a[0]["dpi"] == DPI_MARTA
    assert a[1]["dpi"] == DPI_JOSE
    assert a[2]["dpi"] is None
    assert all("TMP-" not in json.dumps(fila, ensure_ascii=False) for fila in a)


def test_mock_rechaza_formato_raro(mock):
    with pytest.raises(ErrorModulo) as ei:
        leer_archivo("foto.png", b"xxxx")
    assert ei.value.codigo == "formato_no_soportado"


def test_real_formato_no_soportado(real):
    with pytest.raises(ErrorModulo) as ei:
        leer_archivo("notas.txt", b"hola")
    assert ei.value.codigo == "formato_no_soportado"
    assert "txt" in str(ei.value).lower() or "no soportado" in str(ei.value).lower()


def test_csv_exacto_confianza_alta(real):
    filas = leer_archivo("pacientes_exactos.csv", _cargar("pacientes_exactos.csv"))
    assert len(filas) == 2
    for f in filas:
        _forma(f)
    marta = filas[0]
    assert marta["dpi"] == DPI_MARTA
    assert marta["fila"] == 1
    pac = marta["extraccion"]["paciente"]
    assert pac["nombre"] == {"valor": "Marta Elena Choc Ixcoy", "confianza": "alta"}
    assert pac["dpi"] == {"valor": DPI_MARTA, "confianza": "alta"}
    assert pac["fecha_nacimiento"] == {"valor": "1978-05-22", "confianza": "alta"}
    assert pac["sexo"] == {"valor": "F", "confianza": "alta"}
    assert pac["comunidad"]["valor"] == "Paraje Los Pinos"
    assert pac["comunidad"]["confianza"] == "alta"
    assert pac["alergias"] == {"valor": ["ibuprofeno"], "confianza": "alta"}
    cons = marta["extraccion"]["consultas"][0]
    assert cons["fecha"] == {"valor": "2024-03-15", "confianza": "alta"}
    assert cons["motivo"]["confianza"] == "alta"
    # José: "Ninguna" -> [] alta; celda vacía de crónicas -> null baja
    jose = filas[1]
    assert jose["dpi"] == DPI_JOSE
    assert jose["extraccion"]["paciente"]["alergias"] == {"valor": [], "confianza": "alta"}
    assert jose["extraccion"]["paciente"]["condiciones_cronicas"] == {
        "valor": None,
        "confianza": "baja",
    }
    assert jose["extraccion"]["consultas"][0]["vacunas"] == {"valor": None, "confianza": "baja"}


def test_csv_latin1_punto_y_coma(real):
    filas = leer_archivo("pacientes_feo_latin1.csv", _cargar("pacientes_feo_latin1.csv"))
    # 6 filas de datos: marta, jose, lucia, vacía, pedro, ana
    assert [f["fila"] for f in filas] == [1, 2, 3, 4, 5, 6]
    for f in filas:
        _forma(f)

    marta = filas[0]
    assert marta["dpi"] == DPI_MARTA
    pac = marta["extraccion"]["paciente"]
    # nombre + apellidos en dos celdas llenas -> alta (decisión congelada)
    assert pac["nombre"]["valor"] == "Marta Elena Choc Ixcoy"
    assert pac["nombre"]["confianza"] == "alta"
    assert pac["dpi"]["valor"] == DPI_MARTA
    assert pac["fecha_nacimiento"]["valor"] == "1978-05-22"
    assert pac["fecha_nacimiento"]["confianza"] == "baja"  # 22/05/1978 + sinónimo
    assert pac["sexo"]["valor"] == "F"
    assert pac["sexo"]["confianza"] == "baja"  # "Femenino"
    assert pac["comunidad"]["valor"] == "Paraje Los Pinos"
    assert "hipertensión" in (pac["condiciones_cronicas"]["valor"] or [])
    # no se inventa ni se copia Observaciones
    blob = json.dumps(marta, ensure_ascii=False)
    assert "NO COPIAR ESTA NOTA" not in blob
    assert "Observaciones" not in blob

    jose = filas[1]
    assert jose["dpi"] == DPI_JOSE
    assert jose["extraccion"]["paciente"]["alergias"] == {"valor": [], "confianza": "alta"}
    assert jose["extraccion"]["paciente"]["fecha_nacimiento"]["valor"] == "1991-11-03"

    lucia = filas[2]
    assert lucia["dpi"] is None
    assert lucia["extraccion"]["paciente"]["dpi"]["valor"] is None
    assert lucia["extraccion"]["paciente"]["nombre"]["valor"] == "Lucía Beatriz Morales Pac"
    assert "TMP-" not in json.dumps(lucia)

    vacia = filas[3]
    assert vacia["dpi"] is None
    assert vacia["extraccion"]["error"] == "La fila está vacía."
    assert vacia["extraccion"]["consultas"] == []
    assert all(c["valor"] is None and c["confianza"] == "baja" for c in vacia["extraccion"]["paciente"].values())

    pedro = filas[4]
    assert pedro["dpi"] == DPI_PEDRO
    assert pedro["extraccion"]["paciente"]["fecha_nacimiento"]["valor"] == "1985-04-13"
    # 04/13/2023 no es DMY válido; se interpreta MDY con baja
    assert pedro["extraccion"]["consultas"][0]["fecha"]["valor"] == "2023-04-13"
    assert pedro["extraccion"]["consultas"][0]["fecha"]["confianza"] == "baja"

    ana = filas[5]
    # DPI "123" no tiene 13 dígitos -> dpi de fila None, no se inventa ni TMP
    assert ana["dpi"] is None
    assert "TMP-" not in json.dumps(ana)
    assert ana["extraccion"]["paciente"]["dpi"]["valor"] == "123"
    assert ana["extraccion"]["paciente"]["dpi"]["confianza"] == "baja"
    # sexo "Otro" no se traduce a F/M
    assert ana["extraccion"]["paciente"]["sexo"]["valor"] is None
    assert ana["extraccion"]["paciente"]["fecha_nacimiento"]["valor"] is None


def test_csv_tab(real):
    filas = leer_archivo("pacientes_tab.csv", _cargar("pacientes_tab.csv"))
    assert len(filas) == 2
    assert filas[0]["dpi"] == DPI_MARTA
    assert filas[1]["dpi"] == DPI_JOSE
    assert filas[0]["extraccion"]["paciente"]["nombre"]["valor"] == "Marta Elena Choc Ixcoy"
    assert filas[0]["extraccion"]["paciente"]["nombre"]["confianza"] == "alta"


def test_xlsx_columnas_raras(real):
    filas = leer_archivo("pacientes_columnas_raras.xlsx", _cargar("pacientes_columnas_raras.xlsx"))
    assert [f["fila"] for f in filas] == [1, 2, 3, 4]
    for f in filas:
        _forma(f)
    marta = filas[0]
    assert marta["dpi"] == DPI_MARTA
    # fecha nativa de Excel (date) + columna sinónima "F. Nacimiento" -> baja por sinónimo
    assert marta["extraccion"]["paciente"]["fecha_nacimiento"]["valor"] == "1978-05-22"
    assert marta["extraccion"]["paciente"]["fecha_nacimiento"]["confianza"] == "baja"
    assert marta["extraccion"]["consultas"][0]["fecha"]["valor"] == "2024-03-15"
    assert marta["extraccion"]["paciente"]["sexo"]["valor"] == "F"
    blob = json.dumps(marta, ensure_ascii=False)
    assert "NO COPIAR ESTA NOTA" not in blob
    vacia = filas[1]
    assert "error" in vacia["extraccion"]
    lucia = filas[2]
    assert lucia["dpi"] is None
    assert lucia["extraccion"]["paciente"]["alergias"] == {"valor": [], "confianza": "alta"}
    pedro = filas[3]
    assert pedro["dpi"] == DPI_PEDRO
    assert pedro["extraccion"]["paciente"]["sexo"]["valor"] == "M"


def test_xls_columnas_raras(real):
    filas = leer_archivo("pacientes_columnas_raras.xls", _cargar("pacientes_columnas_raras.xls"))
    assert filas[0]["dpi"] == DPI_MARTA
    assert filas[0]["extraccion"]["paciente"]["fecha_nacimiento"]["valor"] == "1978-05-22"
    assert filas[1]["extraccion"].get("error")
    assert filas[2]["dpi"] is None
    assert "Lucia Beatriz Morales Pac" in filas[2]["extraccion"]["paciente"]["nombre"]["valor"]
    for f in filas:
        _forma(f)


def test_mdb_access(real):
    ruta = FIXTURES / "pacientes_inventados.mdb"
    if not ruta.exists():
        pytest.skip("no hay fixture .mdb")
    filas = leer_archivo("pacientes_inventados.mdb", ruta.read_bytes())
    # debe preferir la tabla pacientes, no departamentos
    assert len(filas) >= 4
    dpis = [f["dpi"] for f in filas]
    assert DPI_MARTA in dpis
    assert DPI_JOSE in dpis
    assert None in dpis
    assert DPI_PEDRO in dpis
    # no debe haber importado la tabla departamentos como si fueran pacientes
    nombres = [f["extraccion"]["paciente"]["nombre"]["valor"] for f in filas]
    assert "Quetzaltenango" not in nombres
    assert "Totonicapan" not in nombres
    marta = next(f for f in filas if f["dpi"] == DPI_MARTA)
    assert "Marta Elena" in marta["extraccion"]["paciente"]["nombre"]["valor"]
    assert marta["extraccion"]["paciente"]["sexo"]["valor"] == "F"
    lucia = next(f for f in filas if f["extraccion"]["paciente"]["nombre"]["valor"] and "Lucia" in f["extraccion"]["paciente"]["nombre"]["valor"])
    assert lucia["dpi"] is None
    vacias = [f for f in filas if f["extraccion"].get("error")]
    assert vacias
    for f in filas:
        _forma(f)


def test_nunca_genera_tmp(real):
    csv = "nombre,fecha_nacimiento,sexo\nNino Sin Dpi,2018-08-12,F\n".encode()
    filas = leer_archivo("sin_dpi.csv", csv)
    assert filas[0]["dpi"] is None
    assert filas[0]["extraccion"]["paciente"]["dpi"]["valor"] is None
    assert "TMP-" not in json.dumps(filas)


def test_error_por_fila_deja_campos_nulos(real):
    csv = "dpi,nombre\n2468100090901,Marta\n,\n2468100170901,Jose\n".encode()
    filas = leer_archivo("con_vacia.csv", csv)
    assert len(filas) == 3
    assert filas[1]["fila"] == 2
    assert filas[2]["dpi"] == "2468100170901"
    assert filas[1]["extraccion"]["error"] == "La fila está vacía."
    assert filas[1]["extraccion"]["consultas"] == []
    assert all(v["valor"] is None and v["confianza"] == "baja" for v in filas[1]["extraccion"]["paciente"].values())


def test_archivo_vacio_devuelve_lista_vacia(real):
    assert leer_archivo("vacio.csv", b"") == []
    assert leer_archivo("solo_cabecera.csv", b"dpi,nombre\n") == []


def test_latencia_por_archivo(real):
    archivos = [
        "pacientes_feo_latin1.csv",
        "pacientes_exactos.csv",
        "pacientes_tab.csv",
        "pacientes_columnas_raras.xlsx",
        "pacientes_columnas_raras.xls",
        "pacientes_inventados.mdb",
    ]
    # calentamiento
    for nombre in archivos:
        ruta = FIXTURES / nombre
        if ruta.exists():
            leer_archivo(nombre, ruta.read_bytes())
    print("\nLatencia SIGO_IMPORTAR_IMPL=real (mediana de 7):")
    for nombre in archivos:
        ruta = FIXTURES / nombre
        if not ruta.exists():
            print(f"  {nombre}: (sin fixture)")
            continue
        datos = ruta.read_bytes()
        tiempos = []
        for _ in range(7):
            t0 = time.perf_counter()
            filas = leer_archivo(nombre, datos)
            tiempos.append((time.perf_counter() - t0) * 1000)
        tiempos.sort()
        med = tiempos[len(tiempos) // 2]
        print(f"  {nombre}: {med:.2f} ms  (pmin={tiempos[0]:.2f} pmax={tiempos[-1]:.2f}, {len(filas)} filas, {len(datos)} B)")
        # techo holgado: un archivo chico de prueba no debería tardar segundos
        assert med < 2000


def test_nombre_y_apellidos_llenos_es_alta(real):
    csv = "Nombre,Apellidos,Sexo\nMarta Elena,Choc Ixcoy,F\n".encode()
    filas = leer_archivo("nombres.csv", csv)
    assert filas[0]["dpi"] is None
    assert filas[0]["extraccion"]["paciente"]["nombre"] == {
        "valor": "Marta Elena Choc Ixcoy",
        "confianza": "alta",
    }
    _forma(filas[0])


def test_columna_fecha_va_a_la_consulta(real):
    csv = "dpi,nombre,fecha\n2468100090901,Marta Elena,2024-03-15\n".encode()
    filas = leer_archivo("solo_fecha.csv", csv)
    pac = filas[0]["extraccion"]["paciente"]
    assert pac["fecha_nacimiento"] == {"valor": None, "confianza": "baja"}
    cons = filas[0]["extraccion"]["consultas"][0]
    assert cons["fecha"] == {"valor": "2024-03-15", "confianza": "alta"}
    assert cons["pagina"] == 0
    assert filas[0]["dpi"] == DPI_MARTA


def test_cui_13_sin_verificador_se_entrega_en_baja_sin_corregir(real):
    # 2468100090901 es válido (verificador 9). Con 8 no cuadra; no se cambia.
    malo = "2468100080901"
    csv = f"dpi,nombre\n{malo},Marta\n".encode()
    filas = leer_archivo("cui_malo.csv", csv)
    assert filas[0]["dpi"] == malo
    assert filas[0]["extraccion"]["paciente"]["dpi"] == {"valor": malo, "confianza": "baja"}
    assert "error" not in filas[0]["extraccion"]
    assert "2468100090901" not in json.dumps(filas)


def test_sexo_distinto_de_f_o_m_es_nulo(real):
    csv = "nombre,sexo\nAna,X\nLuz,Otro\n".encode()
    filas = leer_archivo("sexo.csv", csv)
    for fila in filas:
        assert fila["extraccion"]["paciente"]["sexo"] == {"valor": None, "confianza": "baja"}


def test_no_agrupa_por_dpi(real):
    csv = (
        "dpi,nombre,motivo\n"
        "2468100090901,Marta,Control\n"
        "2468100090901,Marta,Seguimiento\n"
    ).encode()
    filas = leer_archivo("repite.csv", csv)
    assert [f["fila"] for f in filas] == [1, 2]
    assert filas[0]["dpi"] == filas[1]["dpi"] == DPI_MARTA
    assert filas[0]["extraccion"]["consultas"][0]["motivo"]["valor"] == "Control"
    assert filas[1]["extraccion"]["consultas"][0]["motivo"]["valor"] == "Seguimiento"


def test_xlsx_solo_la_hoja_activa(real):
    import io

    from openpyxl import Workbook

    wb = Workbook()
    activa = wb.active
    activa.title = "pacientes"
    activa.append(["dpi", "nombre"])
    activa.append([DPI_MARTA, "Marta Elena"])
    otra = wb.create_sheet("otra")
    otra.append(["dpi", "nombre"])
    otra.append([DPI_JOSE, "Jose Tomas"])
    buf = io.BytesIO()
    wb.save(buf)
    filas = leer_archivo("dos_hojas.xlsx", buf.getvalue())
    assert len(filas) == 1
    assert filas[0]["dpi"] == DPI_MARTA


def test_access_sin_mdbtools_es_formato_no_soportado(real, monkeypatch):
    monkeypatch.setattr("sigo_modulos.importar._mdb_export_bin", lambda: None)
    with pytest.raises(ErrorModulo) as ei:
        leer_archivo("viejo.mdb", b"no-es-un-mdb")
    assert ei.value.codigo == "formato_no_soportado"
    mensaje = str(ei.value).lower()
    assert "mdbtools" in mensaje
    assert "mdb-export" in mensaje

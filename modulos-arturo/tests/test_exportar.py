import re
from io import BytesIO
from pathlib import Path

import pytest
from openpyxl import load_workbook

from datos_inventados import EXPEDIENTE_ROSA
from sigo_modulos.exportar import (
    FORMATOS,
    ExportError,
    expediente_a_markdown,
    exportar,
    nombre_archivo,
    normalizar_expediente,
)


def test_markdown_incluye_alergia_aviso_e_id_de_phil():
    md = expediente_a_markdown(EXPEDIENTE_ROSA)
    assert "Rosa Ajpop" in md
    assert "Penicilina" in md
    assert "DATOS INVENTADOS" in md
    assert "SIGO" in md
    assert "p_12" in md.replace("\\_", "_")
    assert "Aldea Chuicacá" in md
    assert "Hipertensión" in md
    assert "MASS360" not in md


def test_nombre_archivo_usa_id_y_no_solo_dpi():
    assert nombre_archivo(EXPEDIENTE_ROSA, "pdf") == "sigo-p_12.pdf"


def test_exporta_los_seis_formatos():
    for formato in FORMATOS:
        contenido, tipo, nombre = exportar(EXPEDIENTE_ROSA, formato)
        assert isinstance(contenido, (bytes, bytearray))
        assert len(contenido) > 20
        assert nombre == f"sigo-p_12.{formato}"
        assert tipo


def test_xlsx_tiene_hoja_de_alergias_y_cronicas():
    contenido, _, _ = exportar(EXPEDIENTE_ROSA, "xlsx")
    libro = load_workbook(BytesIO(contenido))
    assert "Alergias" in libro.sheetnames
    assert "Condiciones cronicas" in libro.sheetnames
    valores = [fila[0].value for fila in libro["Alergias"].iter_rows()]
    assert "Penicilina" in valores
    cronicas = [fila[0].value for fila in libro["Condiciones cronicas"].iter_rows()]
    assert "Hipertensión" in cronicas


def test_formato_invalido():
    with pytest.raises(ExportError) as exc:
        exportar(EXPEDIENTE_ROSA, "exe")
    assert exc.value.codigo == "formato_no_soportado"


def test_formato_no_disponible_sin_pandoc(monkeypatch):
    monkeypatch.setattr("sigo_modulos.exportar._pandoc_disponible", lambda: False)
    with pytest.raises(ExportError) as exc:
        exportar(EXPEDIENTE_ROSA, "docx")
    assert exc.value.codigo == "formato_no_disponible"
    with pytest.raises(ExportError) as exc_html:
        exportar(EXPEDIENTE_ROSA, "html")
    assert exc_html.value.codigo == "formato_no_disponible"
    # md y xlsx no dependen de Pandoc
    contenido, _, nombre = exportar(EXPEDIENTE_ROSA, "md")
    assert nombre.endswith(".md") and len(contenido) > 20


def test_formato_no_disponible_sin_weasyprint(monkeypatch):
    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "weasyprint" or name.startswith("weasyprint."):
            raise ImportError("weasyprint ausente (prueba)")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    with pytest.raises(ExportError) as exc:
        exportar(EXPEDIENTE_ROSA, "pdf")
    assert exc.value.codigo == "formato_no_disponible"


def test_html_escapa_script_y_onerror(tmp_path: Path):
    sucio = {
        "paciente": {
            "id": "p_99",
            "dpi": "0000000000000",
            "nombre": "Persona Inventada",
            "fecha_nacimiento": "2000-01-01",
            "sexo": "F",
            "comunidad": "Demo",
            "alergias": ["<script>alert(1)</script>"],
            "condiciones_cronicas": [],
            "version": 1,
        },
        "alertas": {
            "alergias": ["<script>alert(1)</script>"],
            "condiciones_cronicas": [],
            "medicamentos": [],
        },
        "consultas": [
            {
                "id": "c_x",
                "version": 1,
                "fecha": "2024-01-01",
                "centro": {"id": "c1", "nombre": "Puesto Demo", "tipo": "puesto",
                           "municipio": "Demo", "departamento": "Demo"},
                "motivo": "Control",
                "diagnostico": "Ninguno",
                "tratamiento": '<img src="https://ejemplo.invalid/x" onerror="alert(1)">',
                "vacunas": [],
                "original_url": "https://ejemplo.invalid/secreto",
                "editada_por": "Demo",
                "editada_en": "2024-01-01T10:00:00-06:00",
                "notas": "<script>alert(1)</script>",
            }
        ],
        "acceso_vence_en": None,
        "tipo_acceso": None,
    }
    html = exportar(sucio, "html")[0].decode("utf-8")
    assert re.search(r"<\s*script\b", html, re.I) is None
    assert re.search(r"<\s*img\b", html, re.I) is None
    assert re.search(r"<\s*[a-zA-Z][^>]*\bonerror\s*=", html, re.I) is None
    md = expediente_a_markdown(sucio)
    assert "<script>" not in md
    assert "https://ejemplo.invalid/secreto" not in md


def test_pdf_no_carga_url_externa():
    # Defensa en profundidad: el fetcher debe rechazar http(s).
    from sigo_modulos.exportar import _url_fetcher_seguro

    with pytest.raises(ExportError):
        _url_fetcher_seguro("https://ejemplo.invalid/pixel.png")


def test_html_conserva_escape_de_comillas_y_csp():
    """El escape de html.escape (comillas) y el CSP del exportador base siguen activos."""
    sucio = {
        "paciente": {
            "id": "p_98",
            "dpi": "0000000000001",
            "nombre": 'Ana "demo" <b>inventada</b>',
            "fecha_nacimiento": "1991-02-02",
            "sexo": "F",
            "comunidad": "Demo",
            "alergias": [],
            "condiciones_cronicas": [],
            "version": 1,
        },
        "alertas": {"alergias": [], "condiciones_cronicas": [], "medicamentos": []},
        "consultas": [],
        "acceso_vence_en": None,
        "tipo_acceso": None,
    }
    md = expediente_a_markdown(sucio)
    assert "<b>" not in md
    assert "&quot;" in md
    html = exportar(sucio, "html")[0].decode("utf-8")
    assert "Content-Security-Policy" in html
    assert "default-src 'none'" in html
    assert re.search(r"<\s*b\b", html, re.I) is None


def test_xlsx_no_interpreta_formulas():
    sucio = {
        "paciente": {
            "id": "p_97",
            "dpi": "0000000000002",
            "nombre": "=cmd|'/c calc'!A0",
            "fecha_nacimiento": "1992-03-03",
            "sexo": "M",
            "comunidad": "Demo",
            "alergias": ["+penicilina"],
            "condiciones_cronicas": ["-asma"],
            "version": 1,
        },
        "alertas": {
            "alergias": ["+penicilina"],
            "condiciones_cronicas": ["-asma"],
            "medicamentos": [],
        },
        "consultas": [
            {
                "id": "c_f",
                "version": 1,
                "fecha": "2024-01-01",
                "centro": {"id": "c1", "nombre": "@puesto", "tipo": "puesto",
                           "municipio": "Demo", "departamento": "Demo"},
                "motivo": "=1+1",
                "diagnostico": "Ninguno",
                "tratamiento": None,
                "vacunas": [],
                "original_url": "",
            }
        ],
        "acceso_vence_en": None,
        "tipo_acceso": None,
    }
    contenido, _, _ = exportar(sucio, "xlsx")
    libro = load_workbook(BytesIO(contenido))
    for hoja in libro.worksheets:
        for fila in hoja.iter_rows():
            for celda in fila:
                if isinstance(celda.value, str):
                    assert celda.data_type != "f"
                    assert celda.value[:1] not in "=+-@"


def test_normaliza_paciente_plano_de_integracion():
    plano = {
        "dpi": "2483175631406",
        "nombre": "Rosa Ajpop",
        "sexo": "F",
        "fecha_nacimiento": "1978-03-12",
        "municipio_nacimiento": "Chichicastenango",
        "departamento_nacimiento": "Quiché",
        "alergias": [
            {"sustancia": "Penicilina", "severidad": "grave", "reaccion": "Urticaria"}
        ],
        "consultas": [
            {
                "fecha": "2024-11-02",
                "centro": "Puesto de Salud Chichicastenango",
                "motivo": "Dolor",
                "diagnostico": "Faringitis",
                "medicamentos": ["Amoxicilina 500 mg"],
            }
        ],
    }
    datos = normalizar_expediente(plano)
    assert datos["paciente"]["dpi"] == "2483175631406"
    assert "Penicilina" in datos["paciente"]["alergias"]
    assert "Amoxicilina 500 mg" in (datos["consultas"][0].get("medicamentos") or [])
    md = expediente_a_markdown(plano)
    assert "Penicilina" in md
    assert "Amoxicilina 500 mg" in md

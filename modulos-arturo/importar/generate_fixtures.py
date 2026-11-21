#!/usr/bin/env python3
"""Genera fixtures INVENTADAS para probar la importación. Nadie real."""

from __future__ import annotations

import csv
import io
import shutil
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "fixtures"

# CUI inventados (estructura SAT válida, no corresponden a personas reales).
DPI_MARTA = "2468100090901"
DPI_JOSE = "2468100170901"
DPI_PEDRO = "2468100330901"


def escribir_csv_latin1() -> None:
    # ; y latin-1, con acentos, CUI con guiones, fechas DMY, sexo en palabras.
    encabezado = [
        "Nombre",
        "Apellidos",
        "CUI",
        "Fecha nac.",
        "Sexo",
        "Aldea",
        "Alergias",
        "Enfermedades crónicas",
        "Fecha atención",
        "Motivo de consulta",
        "Diagnóstico",
        "Medicamentos",
        "Vacunas",
        "Observaciones",
    ]
    filas = [
        [
            "Marta Elena",
            "Choc Ixcoy",
            "2468-1000-90901",
            "22/05/1978",
            "Femenino",
            "Paraje Los Pinos",
            "ibuprofeno",
            "hipertensión",
            "15/03/2024",
            "Control de presión",
            "Hipertensión arterial",
            "Losartán 50 mg",
            "Td",
            "NO COPIAR ESTA NOTA",
        ],
        [
            "José Tomás",
            "Guarcax Sicajau",
            DPI_JOSE,
            "03-11-1991",
            "M",
            "Cantón La Esperanza",
            "Ninguna",
            "",
            "2019-07-08",
            "Dolor de oído",
            "Otitis media",
            "Amoxicilina",
            "",
            "",
        ],
        [
            "Lucía Beatriz",
            "Morales Pac",
            "",
            "12/08/2018",
            "F",
            "Cantón La Esperanza",
            "Ninguna",
            "",
            "",
            "Control niño sano",
            "",
            "",
            "",
            "",
        ],
        ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],
        [
            "Pedro Antonio",
            "Sacal Xiloj",
            "246 810 033 0901",
            "13/04/1985",
            "Masculino",
            "Paraje Los Pinos",
            "",
            "diabetes",
            "04/13/2023",
            "Control",
            "Diabetes mellitus tipo 2",
            "Metformina",
            "Influenza",
            "",
        ],
        [
            "Ana",
            "López",
            "123",
            "no-es-fecha",
            "Otro",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "columna basura",
        ],
    ]
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", lineterminator="\n")
    w.writerow(encabezado)
    w.writerows(filas)
    (FIXTURES / "pacientes_feo_latin1.csv").write_bytes(
        buf.getvalue().encode("latin-1")
    )


def escribir_csv_exacto() -> None:
    encabezado = [
        "dpi",
        "nombre",
        "fecha_nacimiento",
        "sexo",
        "comunidad",
        "alergias",
        "condiciones_cronicas",
        "fecha",
        "motivo",
        "diagnostico",
        "tratamiento",
        "vacunas",
    ]
    filas = [
        [
            DPI_MARTA,
            "Marta Elena Choc Ixcoy",
            "1978-05-22",
            "F",
            "Paraje Los Pinos",
            "ibuprofeno",
            "hipertension",
            "2024-03-15",
            "Control de presion",
            "Hipertension arterial",
            "Losartan 50 mg",
            "Td",
        ],
        [
            DPI_JOSE,
            "Jose Tomas Guarcax Sicajau",
            "1991-11-03",
            "M",
            "Canton La Esperanza",
            "Ninguna",
            "",
            "2019-07-08",
            "Dolor de oido",
            "Otitis media",
            "Amoxicilina",
            "",
        ],
    ]
    with (FIXTURES / "pacientes_exactos.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(encabezado)
        w.writerows(filas)


def escribir_csv_tab() -> None:
    encabezado = ["dpi", "nombre", "sexo", "comunidad"]
    filas = [
        [DPI_MARTA, "Marta Elena Choc Ixcoy", "F", "Paraje Los Pinos"],
        [DPI_JOSE, "Jose Tomas Guarcax Sicajau", "M", "Canton La Esperanza"],
    ]
    with (FIXTURES / "pacientes_tab.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, delimiter="\t")
        w.writerow(encabezado)
        w.writerows(filas)


def escribir_xlsx() -> None:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "pacientes"
    ws.append(
        [
            "NOMBRE DEL PACIENTE",
            "No. Documento",
            "F. Nacimiento",
            "Género",
            "Comunidad / aldea",
            "Alergia(s)",
            "Enfermedades crónicas",
            "Fecha atención",
            "Motivo de consulta",
            "Dx",
            "Medicamentos",
            "Inmunizaciones",
            "Observaciones",
        ]
    )
    ws.append(
        [
            "Marta Elena Choc Ixcoy",
            int(DPI_MARTA),
            date(1978, 5, 22),
            "F",
            "Paraje Los Pinos",
            "ibuprofeno",
            "hipertensión",
            datetime(2024, 3, 15),
            "Control de presión",
            "Hipertensión arterial",
            "Losartán 50 mg",
            "Td",
            "NO COPIAR ESTA NOTA",
        ]
    )
    ws.append([None] * 13)
    ws.append(
        [
            "Lucía Beatriz Morales Pac",
            None,
            date(2018, 8, 12),
            "F",
            "Cantón La Esperanza",
            "Ninguna",
            None,
            None,
            "Control niño sano",
            None,
            None,
            None,
            None,
        ]
    )
    ws.append(
        [
            "Pedro Antonio Sacal Xiloj",
            "246 810 033 0901",
            "13/04/1985",
            "Masculino",
            "Paraje Los Pinos",
            None,
            "diabetes",
            "04/13/2023",
            "Control",
            "Diabetes mellitus tipo 2",
            "Metformina",
            "Influenza",
            None,
        ]
    )
    wb.save(FIXTURES / "pacientes_columnas_raras.xlsx")


def escribir_xls() -> None:
    import xlwt

    wb = xlwt.Workbook()
    ws = wb.add_sheet("pacientes")
    encabezado = [
        "NOMBRE DEL PACIENTE",
        "No. Documento",
        "F. Nacimiento",
        "Género",
        "Comunidad / aldea",
        "Alergia(s)",
        "Enfermedades crónicas",
        "Fecha atención",
        "Motivo de consulta",
        "Dx",
        "Medicamentos",
        "Inmunizaciones",
        "Observaciones",
    ]
    for c, h in enumerate(encabezado):
        ws.write(0, c, h)
    # xlwt no trae date() nativo tan cómodo; usamos texto ISO y una fecha de Excel.
    estilo_fecha = xlwt.XFStyle()
    estilo_fecha.num_format_str = "YYYY-MM-DD"
    ws.write(1, 0, "Marta Elena Choc Ixcoy")
    ws.write(1, 1, DPI_MARTA)
    ws.write(1, 2, date(1978, 5, 22), estilo_fecha)
    ws.write(1, 3, "F")
    ws.write(1, 4, "Paraje Los Pinos")
    ws.write(1, 5, "ibuprofeno")
    ws.write(1, 6, "hipertension")
    ws.write(1, 7, date(2024, 3, 15), estilo_fecha)
    ws.write(1, 8, "Control de presion")
    ws.write(1, 9, "Hipertension arterial")
    ws.write(1, 10, "Losartan 50 mg")
    ws.write(1, 11, "Td")
    ws.write(1, 12, "NO COPIAR ESTA NOTA")
    # fila 2 (índice 2) vacía
    ws.write(3, 0, "Lucia Beatriz Morales Pac")
    ws.write(3, 2, date(2018, 8, 12), estilo_fecha)
    ws.write(3, 3, "F")
    ws.write(3, 4, "Canton La Esperanza")
    ws.write(3, 5, "Ninguna")
    ws.write(3, 8, "Control nino sano")
    wb.save(str(FIXTURES / "pacientes_columnas_raras.xls"))


def escribir_mdb() -> None:
    java = shutil.which("java")
    javac = shutil.which("javac")
    jars_dir = Path("/tmp/jackcess")
    jars = [
        jars_dir / "jackcess-4.0.8.jar",
        jars_dir / "commons-logging-1.3.4.jar",
        jars_dir / "commons-lang3-3.17.0.jar",
    ]
    src = ROOT / "CrearMdb.java"
    if not src.exists():
        src = Path("/tmp/CrearMdb.java")
    if not java or not javac or not src.exists() or not all(j.exists() for j in jars):
        print("AVISO: no se pudo generar el .mdb (faltan Java o Jackcess).", file=sys.stderr)
        return
    cp = ":".join(str(j) for j in jars)
    subprocess.run([javac, "-cp", cp, "-d", "/tmp", str(src)], check=True)
    destino = FIXTURES / "pacientes_inventados.mdb"
    subprocess.run(
        [java, "-cp", f"/tmp:{cp}", "CrearMdb", str(destino)],
        check=True,
    )
    print("mdb", destino, destino.stat().st_size, "bytes")


def main() -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    escribir_csv_latin1()
    escribir_csv_exacto()
    escribir_csv_tab()
    escribir_xlsx()
    escribir_xls()
    escribir_mdb()
    print("fixtures en", FIXTURES)
    for p in sorted(FIXTURES.iterdir()):
        print(f"  {p.name:40s} {p.stat().st_size:6d} B")


if __name__ == "__main__":
    main()

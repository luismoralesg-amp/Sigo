"""Importador mock: lee CSV y XLSX simples con columnas conocidas.
Access (.accdb/.mdb) lo hace la implementación real de Arturo (C-05)."""

from __future__ import annotations

import csv
import io
import unicodedata

from .interfaces import ErrorModulo, FilaImportada

ALIAS = {
    "dpi": "dpi", "cui": "dpi",
    "nombre": "nombre", "paciente": "nombre",
    "fecha_nacimiento": "fecha_nacimiento", "nacimiento": "fecha_nacimiento",
    "sexo": "sexo", "comunidad": "comunidad",
    "alergias": "alergias", "condiciones_cronicas": "condiciones_cronicas",
    "fecha": "fecha", "fecha_consulta": "fecha",
    "motivo": "motivo", "diagnostico": "diagnostico",
    "tratamiento": "tratamiento", "medicamentos": "tratamiento",
    "vacunas": "vacunas",
}
LISTAS = {"alergias", "condiciones_cronicas", "vacunas"}


def _norm(texto: str) -> str:
    t = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return t.strip().lower().replace(" ", "_")


def _campo(valor, lista: bool = False) -> dict:
    if valor is None or str(valor).strip() == "":
        return {"valor": [] if lista else None, "confianza": "baja"}
    if lista:
        return {"valor": [v.strip() for v in str(valor).replace(";", ",").split(",") if v.strip()], "confianza": "alta"}
    return {"valor": str(valor).strip(), "confianza": "alta"}


def _filas(nombre: str, contenido: bytes) -> list[dict]:
    ext = nombre.lower().rsplit(".", 1)[-1]
    if ext == "csv":
        texto = contenido.decode("utf-8-sig", errors="replace")
        return list(csv.DictReader(io.StringIO(texto)))
    if ext == "xlsx":
        from openpyxl import load_workbook

        hoja = load_workbook(io.BytesIO(contenido), read_only=True, data_only=True).active
        filas = list(hoja.iter_rows(values_only=True))
        if not filas:
            return []
        encabezado = [str(c or "") for c in filas[0]]
        return [dict(zip(encabezado, f)) for f in filas[1:]]
    raise ErrorModulo(f"El mock no lee .{ext}. Access lo trae la implementación real (SIGO_IMPORTAR_IMPL=real).",
                      "formato_no_soportado")


def leer_archivo(nombre_archivo: str, contenido: bytes) -> list[FilaImportada]:
    salida: list[FilaImportada] = []
    for i, fila in enumerate(_filas(nombre_archivo, contenido), start=1):
        datos = {ALIAS[_norm(k)]: v for k, v in fila.items() if _norm(k) in ALIAS}
        if not any(str(v or "").strip() for v in datos.values()):
            continue
        dpi = "".join(ch for ch in str(datos.get("dpi") or "") if ch.isdigit()) or None
        paciente = {k: _campo(datos.get(k), k in LISTAS) for k in
                    ("nombre", "dpi", "fecha_nacimiento", "sexo", "comunidad", "alergias", "condiciones_cronicas")}
        paciente["dpi"] = {"valor": dpi, "confianza": "alta" if dpi and len(dpi) == 13 else "baja"}
        consulta = {k: _campo(datos.get(k), k in LISTAS) for k in ("fecha", "motivo", "diagnostico", "tratamiento", "vacunas")}
        consulta["pagina"] = 0
        consultas = [consulta] if any(c["valor"] for k, c in consulta.items() if k != "pagina") else []
        salida.append({"dpi": dpi, "fila": i, "extraccion": {"paciente": paciente, "consultas": consultas}})
    return salida

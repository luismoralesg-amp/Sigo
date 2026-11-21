"""Importador mock: lee CSV y XLSX simples con columnas conocidas.

Access (.accdb / .mdb) lo lee el módulo real de Arturo y el servidor necesita
mdbtools (apt-get install -y mdbtools). Este mock no lo parsea: si llega un
Access responde ia_no_disponible, no formato_no_soportado, porque el formato
sí está en el contrato.

La confianza 0-1 del v0 no se emite: solo "alta" o "baja".

El libro del puesto (`registro_puesto_2015_2022.csv`) usa encabezados que el
importador real de Arturo todavía no mapea (NOMBRE_PAC, TX / MEDICAMENTO,
ANT. PATOLOGICOS). Con SIGO_IMPORTAR_IMPL=mock los alias viven aquí, sin
tocar el módulo de Arturo. El DPI se limpia (guiones y espacios) y después
lo valida `dpi.py` vía normalizar_extraccion: si no quedan 13 dígitos, el
backend sigue asignando TMP-; si el verificador no cuadra, queda la
advertencia de siempre (confianza baja) y no se inventa otro número.
"""

from __future__ import annotations

import csv
import io
import re
import unicodedata
from datetime import date, datetime

from ..dpi import normalizar_cui
from ..extraccion import extraccion_ilegible, normalizar_extraccion
from .interfaces import ErrorModulo, FilaImportada

# Encabezado ya normalizado -> campo del contrato.
# "no" y "observaciones" no entran: el primero es el correlativo del libro
# y el segundo no tiene campo en la extracción.
ALIAS = {
    "dpi": "dpi",
    "cui": "dpi",
    "no_dpi": "dpi",
    "num_dpi": "dpi",
    "numero_dpi": "dpi",
    "numero_de_dpi": "dpi",
    "n_dpi": "dpi",
    "nombre": "nombre",
    "paciente": "nombre",
    "nombre_pac": "nombre",
    "nom_pac": "nombre",
    "nombre_paciente": "nombre",
    "nombre_completo": "nombre",
    "nombres": "nombre",
    "fecha_nacimiento": "fecha_nacimiento",
    "nacimiento": "fecha_nacimiento",
    "fec_nac": "fecha_nacimiento",
    "fecha_nac": "fecha_nacimiento",
    "fnac": "fecha_nacimiento",
    "f_nac": "fecha_nacimiento",
    "fecha_de_nacimiento": "fecha_nacimiento",
    "sexo": "sexo",
    "genero": "sexo",
    "comunidad": "comunidad",
    "aldea": "comunidad",
    "alergias": "alergias",
    "alergia": "alergias",
    "condiciones_cronicas": "condiciones_cronicas",
    "ant_patologicos": "condiciones_cronicas",
    "antecedentes_patologicos": "condiciones_cronicas",
    "antecedentes": "condiciones_cronicas",
    "fecha": "fecha",
    "fecha_consulta": "fecha",
    "fecha_de_consulta": "fecha",
    "fec_consulta": "fecha",
    "motivo": "motivo",
    "diagnostico": "diagnostico",
    "dx": "diagnostico",
    "diag": "diagnostico",
    "tratamiento": "tratamiento",
    "medicamentos": "tratamiento",
    "medicamento": "tratamiento",
    "tx": "tratamiento",
    "tx_medicamento": "tratamiento",
    "tx_medicamentos": "tratamiento",
    "vacunas": "vacunas",
    "vacuna": "vacunas",
}
LISTAS = {"alergias", "condiciones_cronicas", "vacunas"}
# 00–26 → 2000–2026; 27–99 → 1927–1999. El libro del puesto llega a 2022.
_CORTE_ANIO_2 = 26
_SEXO = {
    "f": "F",
    "m": "M",
    "fem": "F",
    "femenino": "F",
    "femenina": "F",
    "mujer": "F",
    "masc": "M",
    "masculino": "M",
    "hombre": "M",
    "varon": "M",
    "h": "M",
}
# La celda dice que no hay nada. No es una alergia ni una condición.
_VACIO_LISTA = {
    "ninguna",
    "ninguno",
    "ningunas",
    "ningunos",
    "n_a",
    "na",
    "s_d",
    "sd",
    "no_refiere",
    "niega",
    "sin_dato",
    "sin_datos",
    "nr",
    "no_aplica",
    "null",
    "none",
}


def _norm(texto: str) -> str:
    """Minúsculas, sin acentos, y puntos, barras o espacios colapsados a _."""
    t = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    t = t.strip().lower()
    t = re.sub(r"[^a-z0-9]+", "_", t)
    return t.strip("_")


def _es_vacio_lista(texto: str) -> bool:
    clave = _norm(texto)
    return clave == "" or clave in _VACIO_LISTA


def _campo(valor, lista: bool = False) -> dict:
    if valor is None or str(valor).strip() == "":
        return {"valor": [] if lista else None, "confianza": "baja"}
    if lista:
        texto = str(valor).strip()
        if _es_vacio_lista(texto):
            return {"valor": [], "confianza": "alta"}
        partes = [
            v.strip()
            for v in texto.replace(";", ",").split(",")
            if v.strip() and not _es_vacio_lista(v)
        ]
        if not partes:
            return {"valor": [], "confianza": "alta"}
        return {"valor": partes, "confianza": "alta"}
    return {"valor": str(valor).strip(), "confianza": "alta"}


def normalizar_dpi(valor) -> str | None:
    """Quita guiones, espacios y cualquier carácter que no sea dígito.

    Doce dígitos se rellenan con un cero (dpi.normalizar_cui, regla SAT).
    No descarta un CUI de 13 dígitos: el verificador lo mira después
    normalizar_extraccion. None solo si no queda ningún dígito.
    """
    if valor is None or str(valor).strip() == "":
        return None
    cui = normalizar_cui(str(valor))
    return cui or None


def _iso(anio: int, mes: int, dia: int) -> str | None:
    try:
        if not 1900 <= anio <= 2100:
            return None
        return date(anio, mes, dia).isoformat()
    except ValueError:
        return None


def normalizar_fecha(valor) -> str | None:
    """Fecha mixta a ISO (YYYY-MM-DD). None si no se puede leer. No lanza.

    Orden guatemalteco día/mes. Si el mes no cabe (06/19/1962, 12/30/2021),
    se prueba mes/día. Un año de dos dígitos usa el corte 26.
    """
    if valor is None:
        return None
    if isinstance(valor, datetime):
        valor = valor.date()
    if isinstance(valor, date):
        return _iso(valor.year, valor.month, valor.day)
    texto = str(valor).strip()
    if not texto:
        return None
    iso = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", texto)
    if iso:
        return _iso(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))
    mixto = re.fullmatch(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})", texto)
    if not mixto:
        return None
    primero, segundo, anio = int(mixto.group(1)), int(mixto.group(2)), int(mixto.group(3))
    if anio < 100:
        anio = 2000 + anio if anio <= _CORTE_ANIO_2 else 1900 + anio
    if primero > 12 and segundo <= 12:
        return _iso(anio, segundo, primero)
    if segundo > 12 and primero <= 12:
        return _iso(anio, primero, segundo)
    if primero <= 12 and segundo <= 12:
        return _iso(anio, segundo, primero) or _iso(anio, primero, segundo)
    return None


def normalizar_sexo_valor(valor) -> str | None:
    """F, M, FEM, MASC y las palabras habituales. Lo demás queda en null."""
    if valor is None or str(valor).strip() == "":
        return None
    clave = _norm(str(valor))
    if clave in _SEXO:
        return _SEXO[clave]
    if clave.startswith("fem"):
        return "F"
    if clave.startswith("masc"):
        return "M"
    return None


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
    raise ErrorModulo(
        f"Formato no soportado: .{ext}. Usá .xlsx, .csv o .accdb.",
        "formato_no_soportado",
    )


def leer_archivo(nombre_archivo: str, contenido: bytes) -> list[FilaImportada]:
    ext = (nombre_archivo or "").lower().rsplit(".", 1)[-1]
    if ext in {"accdb", "mdb"}:
        raise ErrorModulo(
            "Para importar Access el servidor necesita mdbtools (apt-get install -y mdbtools). "
            "La lectura la conecta el módulo real.",
            "ia_no_disponible",
        )
    salida: list[FilaImportada] = []
    for i, fila in enumerate(_filas(nombre_archivo, contenido), start=1):
        if not any(str(v or "").strip() for v in fila.values()):
            continue
        datos = {ALIAS[_norm(k)]: v for k, v in fila.items() if _norm(k) in ALIAS}
        if not any(str(v or "").strip() for v in datos.values()):
            salida.append({"dpi": None, "fila": i, "extraccion": extraccion_ilegible("No se pudo leer la fila.")})
            continue
        datos["dpi"] = normalizar_dpi(datos.get("dpi"))
        datos["fecha_nacimiento"] = normalizar_fecha(datos.get("fecha_nacimiento"))
        datos["fecha"] = normalizar_fecha(datos.get("fecha"))
        datos["sexo"] = normalizar_sexo_valor(datos.get("sexo"))
        paciente = {k: _campo(datos.get(k), k in LISTAS) for k in
                    ("nombre", "fecha_nacimiento", "comunidad", "alergias", "condiciones_cronicas")}
        sexo = datos.get("sexo")
        paciente["sexo"] = {
            "valor": sexo if sexo in {"F", "M"} else None,
            "confianza": "alta" if sexo in {"F", "M"} else "baja",
        }
        paciente["dpi"] = {"valor": datos.get("dpi"), "confianza": "alta"}
        consulta = {k: _campo(datos.get(k), k in LISTAS) for k in ("fecha", "motivo", "diagnostico", "tratamiento", "vacunas")}
        consulta["pagina"] = 0
        tiene_consulta = any(c.get("valor") for k, c in consulta.items() if k != "pagina" and isinstance(c, dict))
        extr = normalizar_extraccion(
            {"paciente": paciente, "consultas": [consulta] if tiene_consulta else []},
            forzar_pagina_0=True,
        )
        dpi = extr["paciente"]["dpi"]["valor"]
        dpi_top = dpi if isinstance(dpi, str) and (dpi.isdigit() and len(dpi) == 13 or dpi.startswith("TMP-")) else None
        salida.append({"dpi": dpi_top, "fila": i, "extraccion": extr})
    return salida

"""Importar Excel / CSV / Access viejo — prototipo fuera del repo.

Firma fijada en backend/app/modulos/interfaces.py:

    leer_archivo(nombre_archivo: str, contenido: bytes) -> list[FilaImportada]

FilaImportada = {"dpi": str | None, "fila": int, "extraccion": Extraccion}

Extraccion (contrato de Phil, con `error` opcional acordado):
    {
      "paciente": {nombre, dpi, fecha_nacimiento, sexo, comunidad,
                   alergias, condiciones_cronicas: Campo},
      "consultas": [{fecha, motivo, diagnostico, tratamiento, vacunas: Campo,
                     "pagina": int}],
      "error": str   # solo si la fila no se pudo aprovechar
    }
Campo = {"valor": T | None, "confianza": "alta" | "baja"}

Nunca inventa valores. Nunca genera TMP-…: si no hay DPI de 13 dígitos,
dpi=None y el backend asigna el temporal. Nunca guarda un expediente:
solo devuelve filas para revisión y confirmación humana.

Errores de archivo (excepción con atributo `codigo`):
    "formato_no_soportado" -> 400

El backend elige con SIGO_IMPORTAR_IMPL=mock|real (default mock).
El mock es determinista e ignora el contenido (sí valida la extensión).

Confianza pública: solo "alta"|"baja". Si hay un puntaje interno,
>= 0.75 se publica como "alta".
  * 1.0  columna canónica y valor usado tal cual (o recorte de espacios)
  * <0.75 columna por sinónimo, o normalización dudosa (fecha ambigua,
    CUI de 12 dígitos, dígito verificador que no cuadra, sexo en palabras)
Celda vacía -> valor null, confianza "baja".
"Ninguna" (o ninguno/ningunas/ningunos) en una lista -> [] + "alta".
Nombre y apellidos en dos o más celdas llenas se concatenan tal cual y
salen con confianza "alta" (decisión congelada; el prototipo ponía "baja").
Sexo que no es F/M ni una palabra reconocida (Femenino, Masculino, …) ->
null + "baja". Un CUI de 13 dígitos que no pasa el verificador se entrega
igual, con "baja", sin corregir el dígito.
"""

from __future__ import annotations

import csv
import io
import os
import re
import subprocess
import tempfile
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Any, TypedDict

from .errores import ErrorModulo

# Umbral acordado: >= 0.75 se publica como "alta".
UMBRAL_ALTA = 0.75

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
CAMPOS_LISTA = frozenset({"alergias", "condiciones_cronicas", "vacunas"})
CAMPOS_CANONICOS = frozenset(CAMPOS_PACIENTE + CAMPOS_CONSULTA)

# Partes de nombre que se concatenan; no son un campo del contrato.
PARTES_NOMBRE = frozenset({
    "nombre",
    "nombres",
    "primer_nombre",
    "segundo_nombre",
    "apellido",
    "apellidos",
    "primer_apellido",
    "segundo_apellido",
    "apellido_casada",
})

# Encabezado ya normalizado -> campo del contrato. Lo canónico no va aquí.
SINONIMOS: dict[str, str] = {
    "nombres": "nombre",
    "nombre_completo": "nombre",
    "nombre_del_paciente": "nombre",
    "nombre_paciente": "nombre",
    "nombres_y_apellidos": "nombre",
    "paciente": "nombre",
    "nombre_y_apellido": "nombre",
    "cui": "dpi",
    "cui_dpi": "dpi",
    "dpi_cui": "dpi",
    "no_dpi": "dpi",
    "num_dpi": "dpi",
    "numero_dpi": "dpi",
    "no_cui": "dpi",
    "no_documento": "dpi",
    "numero_documento": "dpi",
    "num_documento": "dpi",
    "documento": "dpi",
    "doc": "dpi",
    "cedula": "dpi",
    "identificacion": "dpi",
    "id_documento": "dpi",
    "fecha_nac": "fecha_nacimiento",
    "f_nacimiento": "fecha_nacimiento",
    "fecha_de_nacimiento": "fecha_nacimiento",
    "fec_nac": "fecha_nacimiento",
    "fnac": "fecha_nacimiento",
    "nacimiento": "fecha_nacimiento",
    "fecha_nacio": "fecha_nacimiento",
    "genero": "sexo",
    "sexo_paciente": "sexo",
    "sexo_genero": "sexo",
    "aldea": "comunidad",
    "paraje": "comunidad",
    "canton": "comunidad",
    "caserio": "comunidad",
    "comunidad_paciente": "comunidad",
    "comunidad_aldea": "comunidad",
    "lugar_poblado": "comunidad",
    "alergia": "alergias",
    "alergia_s": "alergias",
    "alergias_conocidas": "alergias",
    "alergico_a": "alergias",
    "condiciones_cronica": "condiciones_cronicas",
    "cronicas": "condiciones_cronicas",
    "enfermedades_cronicas": "condiciones_cronicas",
    "enfermedad_cronica": "condiciones_cronicas",
    "antecedentes": "condiciones_cronicas",
    "padecimientos": "condiciones_cronicas",
    "enfermedades": "condiciones_cronicas",
    "fecha_consulta": "fecha",
    "fecha_de_consulta": "fecha",
    "fecha_atencion": "fecha",
    "fecha_de_atencion": "fecha",
    "fecha_visita": "fecha",
    "f_atencion": "fecha",
    "motivo_consulta": "motivo",
    "motivo_de_consulta": "motivo",
    "queja": "motivo",
    "razon": "motivo",
    "dx": "diagnostico",
    "diag": "diagnostico",
    "diagnosticos": "diagnostico",
    "tx": "tratamiento",
    "medicamentos": "tratamiento",
    "medicina": "tratamiento",
    "medicamento": "tratamiento",
    "receta": "tratamiento",
    "indicaciones": "tratamiento",
    "vacuna": "vacunas",
    "esquema_vacunas": "vacunas",
    "inmunizaciones": "vacunas",
    "inmunizacion": "vacunas",
}

VACIO_LISTA = frozenset({
    "ninguna",
    "ninguno",
    "ningunas",
    "ningunos",
    "n/a",
    "na",
    "no aplica",
    "no_aplica",
})

SEXO_MAPA = {
    "f": "F",
    "m": "M",
    "femenino": "F",
    "femenina": "F",
    "masculino": "M",
    "mujer": "F",
    "hombre": "M",
    "fem": "F",
    "masc": "M",
}

# SAT, Reglas y validaciones v1.7.9, §5.1.5 (conteo de municipios).
MUNICIPIOS_POR_DEPARTAMENTO: dict[str, int] = {
    "01": 17, "02": 8, "03": 16, "04": 16, "05": 13, "06": 14, "07": 19,
    "08": 8, "09": 24, "10": 21, "11": 9, "12": 30, "13": 32, "14": 21,
    "15": 8, "16": 17, "17": 14, "18": 5, "19": 11, "20": 11, "21": 7, "22": 17,
}

EXTENSIONES = frozenset({"csv", "tsv", "xlsx", "xls", "mdb", "accdb"})

# Pacientes INVENTADOS del mock. No son personas reales ni los de la demo.
_MOCK_FILAS: list[dict] = [
    {
        "dpi": "2468100090901",
        "fila": 1,
        "extraccion": {
            "paciente": {
                "nombre": {"valor": "Marta Elena Choc Ixcoy", "confianza": "alta"},
                "dpi": {"valor": "2468100090901", "confianza": "alta"},
                "fecha_nacimiento": {"valor": "1978-05-22", "confianza": "alta"},
                "sexo": {"valor": "F", "confianza": "alta"},
                "comunidad": {"valor": "Paraje Los Pinos", "confianza": "alta"},
                "alergias": {"valor": ["ibuprofeno"], "confianza": "alta"},
                "condiciones_cronicas": {"valor": ["hipertension"], "confianza": "alta"},
            },
            "consultas": [
                {
                    "fecha": {"valor": "2024-03-15", "confianza": "alta"},
                    "motivo": {"valor": "Control de presion", "confianza": "alta"},
                    "diagnostico": {"valor": "Hipertension arterial", "confianza": "alta"},
                    "tratamiento": {"valor": "Losartan 50 mg", "confianza": "alta"},
                    "vacunas": {"valor": ["Td"], "confianza": "alta"},
                    "pagina": 0,
                }
            ],
        },
    },
    {
        "dpi": "2468100170901",
        "fila": 2,
        "extraccion": {
            "paciente": {
                "nombre": {"valor": "Jose Tomas Guarcax Sicajau", "confianza": "alta"},
                "dpi": {"valor": "2468100170901", "confianza": "alta"},
                "fecha_nacimiento": {"valor": "1991-11-03", "confianza": "alta"},
                "sexo": {"valor": "M", "confianza": "alta"},
                "comunidad": {"valor": "Canton La Esperanza", "confianza": "alta"},
                "alergias": {"valor": [], "confianza": "alta"},
                "condiciones_cronicas": {"valor": None, "confianza": "baja"},
            },
            "consultas": [
                {
                    "fecha": {"valor": "2019-07-08", "confianza": "alta"},
                    "motivo": {"valor": "Dolor de oido", "confianza": "alta"},
                    "diagnostico": {"valor": "Otitis media", "confianza": "alta"},
                    "tratamiento": {"valor": "Amoxicilina", "confianza": "alta"},
                    "vacunas": {"valor": None, "confianza": "baja"},
                    "pagina": 0,
                }
            ],
        },
    },
    {
        "dpi": None,
        "fila": 3,
        "extraccion": {
            "paciente": {
                "nombre": {"valor": "Lucia Beatriz Morales Pac", "confianza": "alta"},
                "dpi": {"valor": None, "confianza": "baja"},
                "fecha_nacimiento": {"valor": "2018-08-12", "confianza": "alta"},
                "sexo": {"valor": "F", "confianza": "alta"},
                "comunidad": {"valor": "Canton La Esperanza", "confianza": "alta"},
                "alergias": {"valor": [], "confianza": "alta"},
                "condiciones_cronicas": {"valor": None, "confianza": "baja"},
            },
            "consultas": [
                {
                    "fecha": {"valor": None, "confianza": "baja"},
                    "motivo": {"valor": "Control nino sano", "confianza": "alta"},
                    "diagnostico": {"valor": None, "confianza": "baja"},
                    "tratamiento": {"valor": None, "confianza": "baja"},
                    "vacunas": {"valor": None, "confianza": "baja"},
                    "pagina": 0,
                }
            ],
        },
    },
]


class FilaImportada(TypedDict):
    dpi: str | None
    fila: int
    extraccion: dict[str, Any]


def leer_archivo(nombre_archivo: str, contenido: bytes) -> list[FilaImportada]:
    """Lee un archivo tabular y devuelve una FilaImportada por fila de datos.

    Incluye filas vacías o ilegibles (con extraccion["error"]) para que el
    backend pueda armar total_filas, con_errores y filas[].error de
    POST /importaciones. No agrupa por DPI.
    """
    if not isinstance(contenido, (bytes, bytearray)):
        raise ErrorModulo(
            "El contenido tiene que ser bytes.",
            "formato_no_soportado",
        )
    ext = _extension(nombre_archivo)
    if ext not in EXTENSIONES:
        etiqueta = f".{ext}" if ext else "desconocido"
        raise ErrorModulo(
            f"Formato no soportado ({etiqueta}). Se aceptan .csv, .xlsx, .xls, .mdb y .accdb.",
            "formato_no_soportado",
        )
    impl = (os.environ.get("SIGO_IMPORTAR_IMPL") or "mock").strip().lower()
    if impl != "real":
        return _leer_mock()
    return _leer_real(nombre_archivo, ext, bytes(contenido))


def _leer_mock() -> list[dict]:
    import copy

    return copy.deepcopy(_MOCK_FILAS)


def _extension(nombre: str) -> str:
    base = Path(str(nombre or "").replace("\\", "/")).name
    if "." not in base:
        return ""
    return base.rsplit(".", 1)[-1].lower().lstrip()


def _norm(texto: str) -> str:
    t = unicodedata.normalize("NFKD", str(texto or ""))
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    t = t.casefold().strip()
    t = re.sub(r"[^a-z0-9]+", "_", t)
    return t.strip("_")


def _publicar(puntaje: float) -> str:
    return "alta" if puntaje >= UMBRAL_ALTA else "baja"


def _campo(valor: Any, puntaje: float) -> dict:
    if valor is None or valor == "":
        return {"valor": None, "confianza": "baja"}
    return {"valor": valor, "confianza": _publicar(puntaje)}


def _extraccion_vacia(error: str | None = None) -> dict:
    paciente = {k: {"valor": None, "confianza": "baja"} for k in CAMPOS_PACIENTE}
    out: dict[str, Any] = {"paciente": paciente, "consultas": []}
    if error:
        out["error"] = error
    return out


def _digito_verificador(correlativo: str) -> int | None:
    if len(correlativo) != 8 or not correlativo.isdigit():
        return None
    suma = sum(int(d) * (i + 2) for i, d in enumerate(correlativo))
    residuo = suma % 11
    return None if residuo == 10 else residuo


def _cui_estructura_ok(cui: str) -> bool:
    if len(cui) != 13 or not cui.isdigit():
        return False
    dept, muni = cui[9:11], cui[11:13]
    tope = MUNICIPIOS_POR_DEPARTAMENTO.get(dept)
    if tope is None:
        return False
    try:
        n_muni = int(muni)
    except ValueError:
        return False
    if not 1 <= n_muni <= tope:
        return False
    esperado = _digito_verificador(cui[:8])
    return esperado is not None and esperado == int(cui[8])


def _puntaje_columna(exacta: bool, puntaje_valor: float) -> float:
    tope = 1.0 if exacta else 0.74
    return min(tope, puntaje_valor)


# ---------------------------------------------------------------------------
# Lectura real
# ---------------------------------------------------------------------------

def _leer_real(nombre: str, ext: str, contenido: bytes) -> list[dict]:
    if ext in {"csv", "tsv"}:
        filas_crudas = _leer_csv(contenido, forzar_tab=(ext == "tsv"))
    elif ext == "xlsx":
        filas_crudas = _leer_xlsx(contenido)
    elif ext == "xls":
        filas_crudas = _leer_xls(contenido)
    elif ext in {"mdb", "accdb"}:
        filas_crudas = _leer_access(contenido, ext)
    else:
        raise ErrorModulo(
            f"Formato no soportado (.{ext}).",
            "formato_no_soportado",
        )
    return _filas_a_extracciones(filas_crudas)


def _decodificar(contenido: bytes) -> str:
    if contenido.startswith(b"\xef\xbb\xbf"):
        return contenido.decode("utf-8-sig")
    try:
        return contenido.decode("utf-8")
    except UnicodeDecodeError:
        return contenido.decode("latin-1")


def _separador(muestra: str, forzar_tab: bool = False) -> str:
    if forzar_tab:
        return "\t"
    candidatos = {",": 0, ";": 0, "\t": 0}
    primera = ""
    for linea in muestra.splitlines():
        if linea.strip():
            primera = linea
            break
    if not primera:
        return ","
    # Fuera de comillas, para no confundir un campo con el separador.
    en_comillas = False
    for ch in primera:
        if ch == '"':
            en_comillas = not en_comillas
            continue
        if not en_comillas and ch in candidatos:
            candidatos[ch] += 1
    mejor = max(candidatos, key=lambda c: (candidatos[c], {";": 2, "\t": 1, ",": 0}[c] if candidatos[c] else -1))
    if candidatos[mejor] == 0:
        try:
            dialecto = csv.Sniffer().sniff(primera, delimiters=",;\t")
            return dialecto.delimiter
        except csv.Error:
            return ","
    return mejor


def _leer_csv(contenido: bytes, forzar_tab: bool = False) -> list[dict]:
    if not contenido.strip():
        return []
    texto = _decodificar(contenido)
    delim = _separador(texto, forzar_tab=forzar_tab)
    lector = csv.reader(io.StringIO(texto), delimiter=delim)
    return _matriz_a_dicts(list(lector))


def _matriz_a_dicts(matriz: list[list[Any]]) -> list[dict]:
    # Quita filas de relleno al final (común en Excel).
    while matriz and _fila_cruda_vacia(matriz[-1]):
        matriz.pop()
    if not matriz:
        return []
    encabezados = ["" if c is None else c for c in matriz[0]]
    # Si la "cabecera" no parece texto, igual la usamos tal cual.
    salida: list[dict] = []
    for valores in matriz[1:]:
        fila = {}
        for i, clave in enumerate(encabezados):
            valor = valores[i] if i < len(valores) else None
            # Encabezados repetidos: gana el primero con valor, si no el primero.
            if clave in fila and (fila[clave] is not None and str(fila[clave]).strip() != ""):
                continue
            if clave not in fila:
                fila[clave] = valor
            elif valor is not None and str(valor).strip() != "":
                fila[clave] = valor
        salida.append(fila)
    return salida


def _fila_cruda_vacia(valores: Any) -> bool:
    if isinstance(valores, dict):
        iterable = valores.values()
    else:
        iterable = valores or []
    for v in iterable:
        if v is None:
            continue
        if isinstance(v, (date, datetime)):
            return False
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return False
        if str(v).strip() != "":
            return False
    return True


def _leer_xlsx(contenido: bytes) -> list[dict]:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:
        raise ErrorModulo(
            "Falta openpyxl para leer .xlsx. Instalalo con pip install openpyxl.",
            "formato_no_soportado",
        ) from exc
    try:
        wb = load_workbook(io.BytesIO(contenido), read_only=True, data_only=True)
    except Exception as exc:  # archivo corrupto o no es xlsx
        raise ErrorModulo(
            f"No se pudo leer el .xlsx: {exc}.",
            "formato_no_soportado",
        ) from exc
    try:
        hoja = wb.active
        matriz = [list(row) for row in hoja.iter_rows(values_only=True)]
    finally:
        wb.close()
    return _matriz_a_dicts(matriz)


def _leer_xls(contenido: bytes) -> list[dict]:
    try:
        import xlrd
    except ImportError as exc:
        raise ErrorModulo(
            "Falta xlrd para leer .xls. Instalalo con pip install xlrd.",
            "formato_no_soportado",
        ) from exc
    try:
        libro = xlrd.open_workbook(file_contents=contenido, formatting_info=False)
    except Exception as exc:
        raise ErrorModulo(
            f"No se pudo leer el .xls: {exc}.",
            "formato_no_soportado",
        ) from exc
    hoja = libro.sheet_by_index(0)
    matriz: list[list[Any]] = []
    for r in range(hoja.nrows):
        fila: list[Any] = []
        for c in range(hoja.ncols):
            celda = hoja.cell(r, c)
            if celda.ctype == xlrd.XL_CELL_DATE:
                try:
                    fila.append(xlrd.xldate_as_datetime(celda.value, libro.datemode))
                except Exception:
                    fila.append(celda.value)
            elif celda.ctype == xlrd.XL_CELL_EMPTY:
                fila.append(None)
            elif celda.ctype == xlrd.XL_CELL_NUMBER:
                valor = celda.value
                if isinstance(valor, float) and valor.is_integer():
                    fila.append(int(valor))
                else:
                    fila.append(valor)
            elif celda.ctype == xlrd.XL_CELL_BOOLEAN:
                fila.append(celda.value)
            else:
                fila.append(celda.value)
        matriz.append(fila)
    return _matriz_a_dicts(matriz)


def _mdb_export_bin() -> str | None:
    from shutil import which

    ruta = which("mdb-export")
    if ruta:
        return ruta
    return None


def _leer_access(contenido: bytes, ext: str) -> list[dict]:
    binario = _mdb_export_bin()
    if not binario:
        raise ErrorModulo(
            "Access (.mdb/.accdb) requiere mdbtools (mdb-export, mdb-tables). "
            "No está instalado en este equipo. Instalá el paquete mdbtools e intentá de nuevo.",
            "formato_no_soportado",
        )
    suffix = f".{ext}" if ext in {"mdb", "accdb"} else ".mdb"
    tmp = tempfile.NamedTemporaryFile(prefix="sigo-import-", suffix=suffix, delete=False)
    try:
        tmp.write(contenido)
        tmp.close()
        tablas = _tablas_access(tmp.name)
        if not tablas:
            raise ErrorModulo(
                "El archivo de Access no tiene tablas de usuario que se puedan leer.",
                "formato_no_soportado",
            )
        mejor_nombre, mejor_filas, mejor_puntos = None, [], -1.0
        errores: list[str] = []
        for tabla in tablas:
            try:
                filas = _exportar_tabla(tmp.name, tabla)
            except ErrorModulo as exc:
                errores.append(f"{tabla}: {exc}")
                continue
            puntos = _puntaje_tabla(filas)
            if puntos > mejor_puntos:
                mejor_nombre, mejor_filas, mejor_puntos = tabla, filas, puntos
        if mejor_nombre is None:
            detalle = "; ".join(errores) or "mdb-export no devolvió filas"
            raise ErrorModulo(
                f"No se pudo exportar ninguna tabla de Access. {detalle}",
                "formato_no_soportado",
            )
        return mejor_filas
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def _tablas_access(ruta: str) -> list[str]:
    from shutil import which

    exe = which("mdb-tables")
    if not exe:
        raise ErrorModulo(
            "Access requiere mdbtools (mdb-tables). No está instalado.",
            "formato_no_soportado",
        )
    try:
        proc = subprocess.run(
            [exe, "-1", ruta],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ErrorModulo(
            f"No se pudo listar las tablas de Access: {exc}.",
            "formato_no_soportado",
        ) from exc
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout or "mdb-tables falló").strip()
        raise ErrorModulo(
            f"No se pudo abrir el archivo de Access: {msg}",
            "formato_no_soportado",
        )
    tablas = []
    for linea in proc.stdout.splitlines():
        nombre = linea.strip()
        if not nombre or nombre.lower().startswith("msys"):
            continue
        tablas.append(nombre)
    return tablas


def _exportar_tabla(ruta: str, tabla: str) -> list[dict]:
    from shutil import which

    exe = which("mdb-export") or "mdb-export"
    try:
        proc = subprocess.run(
            [exe, "-D", "%Y-%m-%d", "-T", "%Y-%m-%d %H:%M:%S", ruta, tabla],
            capture_output=True,
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ErrorModulo(
            f"mdb-export falló en la tabla {tabla}: {exc}.",
            "formato_no_soportado",
        ) from exc
    if proc.returncode != 0:
        bruto = proc.stderr or proc.stdout or b""
        msg = (bruto.decode("utf-8", "replace") or "mdb-export falló").strip()
        raise ErrorModulo(
            f"mdb-export falló en la tabla {tabla}: {msg}",
            "formato_no_soportado",
        )
    # mdb-export suele emitir UTF-8; si no, latin-1.
    return _leer_csv(proc.stdout)


def _puntaje_tabla(filas: list[dict]) -> float:
    if not filas:
        return 0.0
    claves = [_resolver_campo(_norm(k))[0] for k in filas[0].keys()]
    puntos = 0.0
    if "dpi" in claves:
        puntos += 3
    if "nombre" in claves:
        puntos += 2
    puntos += sum(1 for c in set(claves) if c in CAMPOS_CANONICOS)
    puntos += min(len(filas), 50) * 0.01
    return puntos


# ---------------------------------------------------------------------------
# Mapeo y normalización
# ---------------------------------------------------------------------------

def _resolver_campo(norm: str) -> tuple[str | None, bool]:
    """Devuelve (campo_contrato o parte de nombre, exacta)."""
    if not norm:
        return None, False
    if norm in CAMPOS_CANONICOS:
        return norm, True
    if norm in SINONIMOS:
        return SINONIMOS[norm], False
    if norm in PARTES_NOMBRE:
        return norm, True
    return None, False


def _texto_celda(valor: Any) -> str:
    if valor is None:
        return ""
    if isinstance(valor, bool):
        return "true" if valor else "false"
    if isinstance(valor, datetime):
        return valor.date().isoformat()
    if isinstance(valor, date):
        return valor.isoformat()
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return str(valor).strip()


def _celda_vacia(valor: Any) -> bool:
    if valor is None:
        return True
    if isinstance(valor, (date, datetime)):
        return False
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        return False
    return str(valor).strip() == ""


def _es_vacio_lista(texto: str) -> bool:
    t = _norm(texto).replace("_", " ").strip()
    t2 = re.sub(r"[\.]+$", "", t).strip()
    return t in VACIO_LISTA or t2 in VACIO_LISTA or t.replace(" ", "_") in VACIO_LISTA


def _partir_lista(texto: str) -> list[str]:
    partes = re.split(r"[;,]", texto)
    return [p.strip() for p in partes if p.strip()]


def _fecha(valor: Any) -> tuple[str | None, float]:
    if isinstance(valor, datetime):
        return valor.date().isoformat(), 1.0
    if isinstance(valor, date):
        return valor.isoformat(), 1.0
    texto = _texto_celda(valor)
    if not texto:
        return None, 0.0
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", texto)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if _fecha_calendario(y, mo, d):
            return f"{y:04d}-{mo:02d}-{d:02d}", 1.0
        return None, 0.0
    m = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})", texto)
    if not m:
        return None, 0.0
    a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y = 2000 + y if y <= 26 else 1900 + y
        puntaje_anio = 0.6
    else:
        puntaje_anio = 0.85
    # Guatemala usa día/mes/año. Si es ambiguo, se asume DMY con confianza baja.
    if a > 31 or b > 31:
        return None, 0.0
    if a > 12 and b <= 12:
        d, mo, puntaje = a, b, min(puntaje_anio, 0.85)
    elif b > 12 and a <= 12:
        # No es DMY válido; se prueba MDY (p. ej. 04/13/2023).
        d, mo, puntaje = b, a, 0.6
    elif a <= 12 and b <= 12:
        d, mo, puntaje = a, b, 0.5  # ambiguo, se asume DMY
    else:
        return None, 0.0
    if not _fecha_calendario(y, mo, d):
        return None, 0.0
    return f"{y:04d}-{mo:02d}-{d:02d}", puntaje


def _fecha_calendario(y: int, mo: int, d: int) -> bool:
    try:
        date(y, mo, d)
        return 1900 <= y <= 2100
    except ValueError:
        return False


def _dpi(valor: Any) -> tuple[str | None, float, str | None]:
    """(valor_campo, puntaje, dpi de 13 dígitos o None para FilaImportada)."""
    if _celda_vacia(valor):
        return None, 0.0, None
    if isinstance(valor, float) and valor.is_integer():
        bruto = str(int(valor))
        solo = bruto
        puntuacion_origen = 0.9
    elif isinstance(valor, int) and not isinstance(valor, bool):
        bruto = str(valor)
        solo = bruto
        puntuacion_origen = 0.9
    else:
        bruto = _texto_celda(valor)
        solo = re.sub(r"\D", "", bruto)
        if solo == bruto:
            puntuacion_origen = 1.0
        elif re.fullmatch(r"[\d\s.\-]+", bruto):
            puntuacion_origen = 0.9
        else:
            # Hay letras u otros signos: no adivinamos un CUI a partir de eso
            # si los dígitos no son 12 o 13.
            puntuacion_origen = 0.6
    if len(solo) == 12:
        solo = "0" + solo
        puntuacion_origen = min(puntuacion_origen, 0.74)
    if len(solo) != 13:
        # No inventamos ni rellenamos. Dejamos el texto original, sin dpi de fila.
        return (bruto or None), 0.5, None
    if _cui_estructura_ok(solo):
        return solo, puntuacion_origen, solo
    # 13 dígitos que no pasan verificador o depto/municipio: se entregan igual
    # (para que el humano los vea), con confianza baja. No se "corrige" el dígito.
    return solo, 0.5, solo


def _sexo(valor: Any) -> tuple[str | None, float]:
    if _celda_vacia(valor):
        return None, 0.0
    texto = _texto_celda(valor)
    if texto in {"F", "M"}:
        return texto, 1.0
    clave = _norm(texto)
    if clave in SEXO_MAPA:
        return SEXO_MAPA[clave], 0.74
    # No inventamos F/M para "Otro", "X", etc.
    return None, 0.0


def _valor_lista(valor: Any) -> tuple[Any, float]:
    if _celda_vacia(valor):
        return None, 0.0
    texto = _texto_celda(valor)
    if _es_vacio_lista(texto):
        return [], 1.0
    items = _partir_lista(texto)
    if not items:
        return None, 0.0
    puntaje = 0.9 if len(items) > 1 or items[0] != texto else 1.0
    return items, puntaje


def _armar_nombre(crudo: dict[str, Any], _meta: dict[str, tuple[str, bool]]) -> tuple[str | None, float]:
    """Junta nombre + apellidos si vienen en columnas separadas. No inventa."""
    # Reconstruimos desde los encabezados originales: norm -> (campo, exacta, valor)
    partes_en_orden = (
        ("primer_nombre", "nombre", "nombres"),
        ("segundo_nombre",),
        ("apellidos", "apellido"),
        ("primer_apellido",),
        ("segundo_apellido",),
        ("apellido_casada",),
    )
    # mapa de parte -> (texto, exacta)
    valores: dict[str, tuple[str, bool]] = {}
    for enc, valor in crudo.items():
        norm = _norm(_texto_celda(enc) if not isinstance(enc, str) else enc)
        campo, exacta = _resolver_campo(norm)
        if campo in PARTES_NOMBRE and not _celda_vacia(valor):
            if campo not in valores:
                valores[campo] = (_texto_celda(valor), exacta and campo in {"nombre", "nombres", "apellidos", "apellido", "primer_nombre", "primer_apellido", "segundo_nombre", "segundo_apellido"})
    # También "nombre" canónico o sinónimo ya mapeado como nombre completo:
    # si hay una columna que mapea directo a "nombre" (nombre_completo, paciente, etc.)
    completo = None
    completo_pts = 0.0
    for enc, valor in crudo.items():
        norm = _norm(enc if isinstance(enc, str) else _texto_celda(enc))
        campo, exacta = _resolver_campo(norm)
        if campo == "nombre" and not _celda_vacia(valor):
            # "nombre" como columna canónica vs sinónimo de nombre completo
            if norm in {"nombre_completo", "nombre_del_paciente", "nombre_paciente", "nombres_y_apellidos", "paciente", "nombre_y_apellido"}:
                completo = _texto_celda(valor)
                completo_pts = _puntaje_columna(False, 1.0)
            elif norm in {"nombre", "nombres", "primer_nombre"}:
                pass  # se arma abajo
            else:
                # sinónimo raro
                if completo is None:
                    completo = _texto_celda(valor)
                    completo_pts = _puntaje_columna(exacta, 1.0)

    armado: list[str] = []
    usados = 0
    for grupo in partes_en_orden:
        for clave in grupo:
            if clave in valores:
                txt, _exacta = valores[clave]
                armado.append(txt)
                usados += 1
                break
    if usados == 0 and completo:
        return completo, completo_pts
    if not armado and completo:
        return completo, completo_pts
    if not armado:
        return (completo, completo_pts) if completo else (None, 0.0)
    texto = " ".join(armado)
    if completo and usados <= 1 and completo != texto:
        # Preferimos el nombre completo de una sola columna si solo había "nombre"
        # y además un "nombre completo". Si hay partes, ganan las partes + nombre.
        pass
    if usados == 1 and "nombre" in valores:
        return valores["nombre"][0], _puntaje_columna(valores["nombre"][1], 1.0)
    if usados == 1 and "nombres" in valores and "apellidos" not in valores and "apellido" not in valores:
        return valores["nombres"][0], _puntaje_columna(False, 1.0)
    if usados >= 2:
        # Nombre y apellidos (u otras partes) en celdas llenas: se concatenan
        # tal cual. Decisión congelada: confianza alta. El prototipo devolvía
        # 0.74 para forzar revisión del pegado.
        return texto, 1.0
    return texto, 0.74


def _mapear_encabezados(encabezados: list[str]) -> dict[str, list[tuple[str, bool, str]]]:
    """campo_contrato -> lista de (encabezado original, exacta, parte o campo)."""
    destinos: dict[str, list[tuple[str, bool, str]]] = {}
    for enc in encabezados:
        norm = _norm(enc if isinstance(enc, str) else _texto_celda(enc))
        campo, exacta = _resolver_campo(norm)
        if not campo:
            continue
        destino = "nombre" if campo in PARTES_NOMBRE else campo
        destinos.setdefault(destino, []).append((enc, exacta, campo))
    return destinos


def _valor_de(fila: dict, encabezado: str) -> Any:
    if encabezado in fila:
        return fila[encabezado]
    # openpyxl/csv a veces dejan claves no str
    for k, v in fila.items():
        if str(k) == str(encabezado):
            return v
    return None


def _construir_consulta(valores: dict[str, tuple[Any, float, bool]]) -> dict | None:
    hay = False
    consulta: dict[str, Any] = {}
    for campo in CAMPOS_CONSULTA:
        if campo not in valores:
            consulta[campo] = {"valor": None, "confianza": "baja"}
            continue
        valor, puntaje, exacta = valores[campo]
        consulta[campo] = _campo(valor, puntaje)
        if consulta[campo]["valor"] not in (None, "", []):
            hay = True
        # [] en vacunas (Ninguna) sí cuenta como leído
        if campo in CAMPOS_LISTA and consulta[campo]["valor"] == []:
            hay = True
    if not hay:
        return None
    consulta["pagina"] = 0  # en importación no hay foto; se documenta en DESALINEACIONES
    return consulta


def _filas_a_extracciones(filas: list[dict]) -> list[dict]:
    salida: list[dict] = []
    for i, fila in enumerate(filas, start=1):
        try:
            salida.append(_convertir_fila(i, fila))
        except Exception as exc:
            # Una fila que no se lee no tumba el archivo: vuelve con error,
            # campos null+baja y consultas vacías. El backend arma con_errores.
            salida.append(
                {
                    "dpi": None,
                    "fila": i,
                    "extraccion": _extraccion_vacia(f"No se pudo leer la fila: {exc}"),
                }
            )
    return salida


def _convertir_fila(numero: int, fila: dict) -> dict:
    if _fila_cruda_vacia(fila):
        return {
            "dpi": None,
            "fila": numero,
            "extraccion": _extraccion_vacia("La fila está vacía."),
        }

    destinos = _mapear_encabezados([str(k) if k is not None else "" for k in fila.keys()])
    if not destinos:
        return {
            "dpi": None,
            "fila": numero,
            "extraccion": _extraccion_vacia(
                "No hay columnas reconocidas en esta fila."
            ),
        }

    # ¿Hay algún valor en columnas mapeadas?
    hay_valor = False
    for campo, origenes in destinos.items():
        for enc, _exacta, _parte in origenes:
            if not _celda_vacia(_valor_de(fila, enc)):
                hay_valor = True
                break
        if hay_valor:
            break
    if not hay_valor:
        return {
            "dpi": None,
            "fila": numero,
            "extraccion": _extraccion_vacia("La fila está vacía."),
        }

    paciente: dict[str, Any] = {}
    dpi_fila: str | None = None
    valores_consulta: dict[str, tuple[Any, float, bool]] = {}

    # nombre
    nombre, pts_nombre = _armar_nombre(fila, {})
    paciente["nombre"] = _campo(nombre, pts_nombre)

    # resto de paciente y consulta
    for campo in list(CAMPOS_PACIENTE) + list(CAMPOS_CONSULTA):
        if campo == "nombre":
            continue
        origenes = destinos.get(campo) or []
        if not origenes:
            if campo in CAMPOS_PACIENTE:
                paciente[campo] = {"valor": None, "confianza": "baja"}
            else:
                valores_consulta[campo] = (None, 0.0, False)
            continue
        # primer origen con valor; si todos vacíos, vacío
        elegido = None
        for enc, exacta, _parte in origenes:
            val = _valor_de(fila, enc)
            if _celda_vacia(val):
                continue
            elegido = (enc, exacta, val)
            break
        if elegido is None:
            if campo in CAMPOS_PACIENTE:
                paciente[campo] = {"valor": None, "confianza": "baja"}
            else:
                valores_consulta[campo] = (None, 0.0, False)
            continue
        _enc, exacta, val = elegido
        if campo == "dpi":
            valor, pts, dpi_fila = _dpi(val)
            paciente["dpi"] = _campo(valor, _puntaje_columna(exacta, pts))
        elif campo == "fecha_nacimiento":
            valor, pts = _fecha(val)
            paciente["fecha_nacimiento"] = _campo(valor, _puntaje_columna(exacta, pts))
        elif campo == "sexo":
            valor, pts = _sexo(val)
            paciente["sexo"] = _campo(valor, _puntaje_columna(exacta, pts))
        elif campo in CAMPOS_LISTA:
            valor, pts = _valor_lista(val)
            # "Ninguna" escrito es explícito: [] + alta, aunque la columna sea sinónimo.
            pts_final = 1.0 if valor == [] and pts >= 1.0 else _puntaje_columna(exacta, pts)
            destino_campo = _campo(valor, pts_final)
            if campo in CAMPOS_PACIENTE:
                paciente[campo] = destino_campo
            else:
                valores_consulta[campo] = (destino_campo["valor"], pts_final, exacta)
        elif campo == "fecha":
            valor, pts = _fecha(val)
            valores_consulta[campo] = (valor, _puntaje_columna(exacta, pts), exacta)
        else:
            texto = _texto_celda(val)
            pts = _puntaje_columna(exacta, 1.0)
            if campo in CAMPOS_PACIENTE:
                paciente[campo] = _campo(texto, pts)
            else:
                valores_consulta[campo] = (texto, pts, exacta)

    for campo in CAMPOS_PACIENTE:
        paciente.setdefault(campo, {"valor": None, "confianza": "baja"})

    consultas = []
    consulta = _construir_consulta(valores_consulta)
    if consulta:
        consultas.append(consulta)

    return {
        "dpi": dpi_fila,
        "fila": numero,
        "extraccion": {"paciente": paciente, "consultas": consultas},
    }

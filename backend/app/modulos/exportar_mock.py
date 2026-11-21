"""Exportador base del backend (funciona sin Arturo).

- md, txt y html: Python puro, con todo escapado (S-10).
- pdf: WeasyPrint desde el HTML escapado, sin cargar URLs externas.
- xlsx: openpyxl desde el JSON.
- docx: Pandoc con -f markdown-raw_html si está instalado; si no, 503.
La implementación "real" de Arturo (modulos-arturo) puede mejorar el diseño.
"""

from __future__ import annotations

import html
import io
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from .interfaces import FORMATOS, ErrorModulo

TIPOS_MEDIA = {
    "txt": "text/plain; charset=utf-8",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "md": "text/markdown; charset=utf-8",
    "html": "text/html; charset=utf-8",
}
_MD_ESPECIALES = re.compile(r"([\\`*_{}\[\]()#+\-.!|<>&])")


def _md(texto) -> str:
    if texto is None or texto == "":
        return "—"
    if isinstance(texto, list):
        texto = ", ".join(str(t) for t in texto) or "—"
    return _MD_ESPECIALES.sub(r"\\\1", str(texto))


def _txt(v) -> str:
    if v is None or v == "" or v == []:
        return "—"
    return ", ".join(map(str, v)) if isinstance(v, list) else str(v)


def _secciones(exp: dict):
    p = exp.get("paciente") or {}
    a = exp.get("alertas") or {}
    ident = [("Nombre", p.get("nombre")), ("DPI", p.get("dpi")), ("Fecha de nacimiento", p.get("fecha_nacimiento")),
             ("Sexo", p.get("sexo")), ("Comunidad", p.get("comunidad"))]
    alertas = [("Alergias", a.get("alergias") or p.get("alergias")),
               ("Condiciones crónicas", a.get("condiciones_cronicas") or p.get("condiciones_cronicas")),
               ("Medicamentos", a.get("medicamentos"))]
    consultas = []
    for c in exp.get("consultas") or []:
        consultas.append((f"{_txt(c.get('fecha'))} — {_txt((c.get('centro') or {}).get('nombre'))} (versión {c.get('version')})",
                          [("Motivo", c.get("motivo")), ("Diagnóstico", c.get("diagnostico")),
                           ("Tratamiento", c.get("tratamiento")), ("Vacunas", c.get("vacunas"))]))
    return p, ident, alertas, consultas


def a_markdown(exp: dict) -> str:
    p, ident, alertas, consultas = _secciones(exp)
    l = [f"# SIGO — expediente de {_md(p.get('nombre'))}", "", "> Tu historia te sigue.", "",
         "> DATOS INVENTADOS PARA EL DEMO.", "", "## Identificación", ""]
    l += [f"- **{k}:** {_md(v)}" for k, v in ident]
    l += ["", "## Alertas", ""] + [f"- **{k}:** {_md(v)}" for k, v in alertas]
    l += ["", "## Consultas", ""]
    if not consultas:
        l.append("Sin consultas.")
    for titulo, campos in consultas:
        l += ["", f"### {_md(titulo)}", ""] + [f"- **{k}:** {_md(v)}" for k, v in campos]
    l += ["", "---", "", "El papel original y el sistema viejo se conservan intactos.", ""]
    return "\n".join(l)


def a_texto(exp: dict) -> str:
    p, ident, alertas, consultas = _secciones(exp)
    l = [f"SIGO — expediente de {_txt(p.get('nombre'))}", "Tu historia te sigue.", "DATOS INVENTADOS PARA EL DEMO.", "",
         "IDENTIFICACIÓN"] + [f"  {k}: {_txt(v)}" for k, v in ident]
    l += ["", "ALERTAS"] + [f"  {k}: {_txt(v)}" for k, v in alertas] + ["", "CONSULTAS"]
    for titulo, campos in consultas:
        l += ["", f"  {titulo}"] + [f"    {k}: {_txt(v)}" for k, v in campos]
    return "\n".join(l) + "\n"


def a_html(exp: dict) -> str:
    e = lambda v: html.escape(_txt(v))  # noqa: E731
    p, ident, alertas, consultas = _secciones(exp)
    partes = [
        "<!DOCTYPE html><html lang='es'><head><meta charset='utf-8'>",
        "<meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; style-src 'unsafe-inline'\">",
        f"<title>SIGO — {e(p.get('nombre'))}</title>",
        "<style>body{font-family:sans-serif;max-width:800px;margin:2em auto}.alerta{color:#b00020}</style></head><body>",
        f"<h1>SIGO — expediente de {e(p.get('nombre'))}</h1><p><em>Tu historia te sigue.</em> Datos inventados para el demo.</p>",
        "<h2>Identificación</h2><ul>", *[f"<li><b>{k}:</b> {e(v)}</li>" for k, v in ident], "</ul>",
        "<h2 class='alerta'>Alertas</h2><ul class='alerta'>", *[f"<li><b>{k}:</b> {e(v)}</li>" for k, v in alertas], "</ul>",
        "<h2>Consultas</h2>",
    ]
    for titulo, campos in consultas:
        partes += [f"<h3>{html.escape(titulo)}</h3><ul>", *[f"<li><b>{k}:</b> {e(v)}</li>" for k, v in campos], "</ul>"]
    partes.append("<hr><p>El papel original y el sistema viejo se conservan intactos.</p></body></html>")
    return "".join(partes)


def _sin_red(url: str, *args, **kwargs):
    raise ValueError(f"SIGO no carga recursos externos al exportar: {url}")


def _pdf(exp: dict) -> bytes:
    try:
        from weasyprint import HTML
    except Exception as exc:  # pragma: no cover
        raise ErrorModulo("WeasyPrint no está instalado.", "formato_no_disponible") from exc
    return HTML(string=a_html(exp), url_fetcher=_sin_red).write_pdf()


def _xlsx(exp: dict) -> bytes:
    from openpyxl import Workbook

    p, ident, alertas, consultas = _secciones(exp)
    libro = Workbook()
    hoja = libro.active
    hoja.title = "Paciente"
    hoja.append(["SIGO — Tu historia te sigue. Datos inventados para el demo."])
    for k, v in ident + alertas:
        hoja.append([k, _txt(v)])
    hc = libro.create_sheet("Consultas")
    hc.append(["Fecha", "Centro", "Versión", "Motivo", "Diagnóstico", "Tratamiento", "Vacunas"])
    for c in exp.get("consultas") or []:
        fila = [c.get("fecha"), (c.get("centro") or {}).get("nombre"), c.get("version"), c.get("motivo"),
                c.get("diagnostico"), c.get("tratamiento"), _txt(c.get("vacunas"))]
        # Evita inyección de fórmulas en Excel
        hc.append([("'" + v) if isinstance(v, str) and v[:1] in "=+-@" else v for v in fila])
    buf = io.BytesIO()
    libro.save(buf)
    return buf.getvalue()


def _docx(exp: dict) -> bytes:
    if not shutil.which("pandoc"):
        raise ErrorModulo("Pandoc no está instalado (sudo apt-get install -y pandoc).", "formato_no_disponible")
    with tempfile.TemporaryDirectory() as tmp:
        origen, destino = Path(tmp) / "e.md", Path(tmp) / "e.docx"
        origen.write_text(a_markdown(exp), encoding="utf-8")
        r = subprocess.run(["pandoc", str(origen), "-f", "markdown-raw_html", "-t", "docx", "-o", str(destino)],
                           capture_output=True, text=True, check=False)
        if r.returncode != 0:
            raise ErrorModulo(f"Pandoc falló: {r.stderr.strip()}", "formato_no_disponible")
        return destino.read_bytes()


def exportar(expediente: dict, formato: str) -> tuple[bytes, str, str]:
    formato = (formato or "").lower().strip()
    if formato not in FORMATOS:
        raise ErrorModulo(f"Formato no soportado: {formato}. Usá uno de: {', '.join(FORMATOS)}.", "formato_no_soportado")
    p = expediente.get("paciente") or {}
    nombre = f"sigo-{re.sub(r'[^A-Za-z0-9-]', '', str(p.get('dpi') or 'paciente'))}.{formato}"
    generadores = {
        "md": lambda: a_markdown(expediente).encode("utf-8"),
        "txt": lambda: a_texto(expediente).encode("utf-8"),
        "html": lambda: a_html(expediente).encode("utf-8"),
        "pdf": lambda: _pdf(expediente),
        "xlsx": lambda: _xlsx(expediente),
        "docx": lambda: _docx(expediente),
    }
    return generadores[formato](), TIPOS_MEDIA[formato], nombre

"""Exporta un expediente de SIGO a TXT, DOCX, PDF, XLSX, MD y HTML.

Interfaz del backend (sigo_modulos.exportar):

    exportar(expediente: dict, formato: str) -> tuple[bytes, str, str]
    # (contenido, content_type, nombre)
    # formato ∈ pdf, docx, xlsx, txt, md, html
    # ExportError.codigo = "formato_no_soportado" (400)
    #                    | "formato_no_disponible" (503)

No importa código del backend.

- Markdown es la fuente única (se arma en Python a partir del Expediente).
- TXT, DOCX y HTML salen con Pandoc (binario de sistema).
- PDF sale con WeasyPrint a partir del HTML.
- XLSX sale con openpyxl a partir del JSON (no del Markdown).

Contrato Phil (reporte-congruencia.txt):
  GET /api/v1/pacientes/{id}/exportar?formato=
  formatos: pdf, docx, xlsx, txt, md, html
  Content-Disposition: attachment
  Quién: solo la o el paciente. El médico en emergencia recibe 403
  solo_emergencia. Esta librería no aplica permisos; solo genera el archivo.

Seguridad (S-10): los campos pasan por html.escape antes de armar el
Markdown (la misma defensa que el exportador base del backend, sin
importarlo). Pandoc usa -f markdown-raw_html. El HTML lleva
Content-Security-Policy sin red. WeasyPrint usa un fetcher que rechaza
http, https y file. En el xlsx, un valor que empieza por = + - o @ no
se guarda como fórmula.

pypandoc no se usa: se llama a /usr/bin/pandoc por subprocess.
"""

from __future__ import annotations

import html
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

FORMATOS = ("txt", "docx", "pdf", "xlsx", "md", "html")

TIPOS_MEDIA = {
    "txt": "text/plain; charset=utf-8",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "md": "text/markdown; charset=utf-8",
    "html": "text/html; charset=utf-8",
}

ESTILO_HTML = """
@page { size: Letter; margin: 1.8cm; }
html { font-family: "DejaVu Sans", "Liberation Sans", sans-serif; }
body { font-size: 11pt; line-height: 1.45; color: #1a1a1a; }
h1 { font-size: 1.55rem; color: #163a5f; margin-bottom: 0.3em; }
h2 { font-size: 1.2rem; color: #163a5f; border-bottom: 1px solid #d0d7de; padding-bottom: 0.15em; margin-top: 1.4em; }
h3 { font-size: 1.05rem; color: #1f4b75; }
blockquote { margin: 0.6em 0; padding: 0.45em 0.85em; border-left: 4px solid #c4a35a; background: #fff8e8; }
ul { padding-left: 1.2em; }
hr { border: none; border-top: 1px solid #d0d7de; }
""".strip()


class ExportError(Exception):
    """Error de exportación. El backend mapea `codigo` al HTTP."""

    def __init__(self, mensaje: str, *, codigo: str):
        super().__init__(mensaje)
        self.codigo = codigo


def _texto(valor: Any, vacio: str = "—") -> str:
    if valor is None:
        return vacio
    if isinstance(valor, str) and not valor.strip():
        return vacio
    return str(valor)


def _escapar_md(valor: Any, vacio: str = "—") -> str:
    """Escapa HTML y caracteres de Markdown en un campo del expediente.

    `html.escape` (comillas incluidas) es la misma defensa del exportador
    base: un campo no puede inyectar `<script>`, `<img onerror>` ni
    atributos. Se aplanan los saltos de línea para que un campo no abra
    encabezados. No se escapa el guion ni el paréntesis (fechas, dosis).
    El guion bajo sí, para que un id como p_12 no se interprete como cursiva.
    """
    texto = _texto(valor, vacio=vacio)
    if texto == vacio and valor in (None, "", []):
        return vacio
    texto = texto.replace("\r\n", "\n").replace("\r", "\n")
    texto = " ".join(texto.split("\n"))
    texto = html.escape(texto, quote=True)
    for caracter in ("\\", "`", "*", "_", "[", "]", "#"):
        texto = texto.replace(caracter, "\\" + caracter)
    return texto


def _celda(valor: Any) -> Any:
    """Evita que Excel interprete un texto del expediente como fórmula."""
    if isinstance(valor, str) and valor[:1] in "=+-@":
        return "'" + valor
    return valor


def _lista_textos(valor: Any) -> list[str]:
    if not valor:
        return []
    if isinstance(valor, str):
        return [valor]
    salida: list[str] = []
    for item in valor:
        if isinstance(item, dict):
            nombre = item.get("sustancia") or item.get("nombre") or item.get("texto")
            if nombre:
                salida.append(str(nombre))
        elif item not in (None, ""):
            salida.append(str(item))
    return salida


def _centro_nombre(centro: Any) -> str:
    if not centro:
        return "centro no indicado"
    if isinstance(centro, str):
        return centro
    if isinstance(centro, dict):
        return centro.get("nombre") or "centro no indicado"
    return str(centro)


def _centro_lugar(centro: Any) -> str:
    if not isinstance(centro, dict):
        return ""
    partes = [p for p in (centro.get("municipio"), centro.get("departamento")) if p]
    return ", ".join(partes)


def _tratamiento_de(consulta: dict[str, Any]) -> str | None:
    if consulta.get("tratamiento"):
        return str(consulta["tratamiento"])
    meds = consulta.get("medicamentos") or []
    if isinstance(meds, list) and meds:
        return ", ".join(str(m) for m in meds if m)
    if isinstance(meds, str) and meds.strip():
        return meds
    return None


def _alertas_desde(paciente: dict[str, Any], consultas: list[dict[str, Any]]) -> dict[str, list[str]]:
    alergias = _lista_textos(paciente.get("alergias"))
    cronicas = _lista_textos(paciente.get("condiciones_cronicas"))
    medicamentos: list[str] = []
    vistos: set[str] = set()
    for consulta in consultas:
        trat = _tratamiento_de(consulta)
        if trat and trat not in vistos:
            vistos.add(trat)
            medicamentos.append(trat)
    return {
        "alergias": alergias,
        "condiciones_cronicas": cronicas,
        "medicamentos": medicamentos,
    }


def normalizar_expediente(datos: dict[str, Any]) -> dict[str, Any]:
    """Acepta un Expediente de Phil o el paciente plano del paquete integracion."""
    if "paciente" in datos and isinstance(datos.get("paciente"), dict):
        paciente = dict(datos["paciente"])
        consultas = [dict(c) for c in (datos.get("consultas") or [])]
        alertas = datos.get("alertas") or _alertas_desde(paciente, consultas)
        return {
            "paciente": paciente,
            "alertas": alertas,
            "consultas": consultas,
            "acceso_vence_en": datos.get("acceso_vence_en"),
            "tipo_acceso": datos.get("tipo_acceso"),
        }

    comunidad = datos.get("comunidad")
    if not comunidad:
        partes = [p for p in (datos.get("municipio_nacimiento"), datos.get("departamento_nacimiento")) if p]
        comunidad = ", ".join(partes) or None

    paciente = {
        "id": datos.get("id") or datos.get("paciente_id"),
        "dpi": datos.get("dpi") or datos.get("id_temporal"),
        "nombre": datos.get("nombre"),
        "fecha_nacimiento": datos.get("fecha_nacimiento"),
        "sexo": datos.get("sexo"),
        "comunidad": comunidad,
        "alergias": _lista_textos(datos.get("alergias")),
        "condiciones_cronicas": _lista_textos(datos.get("condiciones_cronicas")),
        "version": datos.get("version") or 1,
    }
    consultas = [dict(c) for c in (datos.get("consultas") or [])]
    return {
        "paciente": paciente,
        "alertas": datos.get("alertas") or _alertas_desde(paciente, consultas),
        "consultas": consultas,
        "acceso_vence_en": datos.get("acceso_vence_en"),
        "tipo_acceso": datos.get("tipo_acceso"),
    }


def nombre_archivo(expediente: dict[str, Any], formato: str) -> str:
    """Nombre sugerido para Content-Disposition: attachment; filename=..."""
    datos = normalizar_expediente(expediente)
    paciente = datos["paciente"]
    slug = paciente.get("id") or paciente.get("dpi") or "paciente"
    slug = re.sub(r"[^A-Za-z0-9_-]", "", str(slug).replace(" ", "").replace("/", "-")) or "paciente"
    return f"sigo-{slug}.{formato}"


def expediente_a_markdown(expediente: dict[str, Any]) -> str:
    datos = normalizar_expediente(expediente)
    paciente = datos["paciente"]
    alertas = datos.get("alertas") or {}
    consultas = list(datos.get("consultas") or [])

    nombre = _escapar_md(paciente.get("nombre") or "Paciente")
    dpi = _escapar_md(paciente.get("dpi") or "sin identificador")
    paciente_id = paciente.get("id")

    lineas = [
        f"# SIGO — expediente de {nombre}",
        "",
        "> Tu historia te sigue.",
        "",
        "> **DATOS INVENTADOS PARA EL DEMO.** No es un paciente real.",
        "",
        "## Identificación",
        "",
        f"- **Nombre:** {nombre}",
    ]
    if paciente_id:
        lineas.append(f"- **Id:** {_escapar_md(paciente_id)}")
    lineas.extend(
        [
            f"- **DPI / CUI:** {dpi}",
            f"- **Sexo:** {_escapar_md(paciente.get('sexo'))}",
            f"- **Fecha de nacimiento:** {_escapar_md(paciente.get('fecha_nacimiento'))}",
            f"- **Comunidad:** {_escapar_md(paciente.get('comunidad'))}",
            "",
            "## Alertas",
            "",
        ]
    )

    alergias = _lista_textos(alertas.get("alergias") or paciente.get("alergias"))
    cronicas = _lista_textos(alertas.get("condiciones_cronicas") or paciente.get("condiciones_cronicas"))
    medicamentos_alerta = _lista_textos(alertas.get("medicamentos"))

    if alergias:
        lineas.append("- **Alergias:** " + ", ".join(_escapar_md(a, vacio="") for a in alergias))
    else:
        lineas.append("- **Alergias:** sin alergias registradas.")
    if cronicas:
        lineas.append("- **Condiciones crónicas:** " + ", ".join(_escapar_md(c, vacio="") for c in cronicas))
    else:
        lineas.append("- **Condiciones crónicas:** ninguna registrada.")
    if medicamentos_alerta:
        lineas.append(
            "- **Medicamentos en alertas:** "
            + ", ".join(_escapar_md(m, vacio="") for m in medicamentos_alerta)
        )
    lineas.append("")

    lineas.extend(["## Consultas", ""])
    if not consultas:
        lineas.append("Sin consultas registradas.")
        lineas.append("")
    else:
        ordenadas = sorted(consultas, key=lambda c: c.get("fecha") or "", reverse=True)
        for consulta in ordenadas:
            centro = consulta.get("centro")
            titulo_centro = _escapar_md(_centro_nombre(centro))
            fecha = _escapar_md(consulta.get("fecha") or "s/f")
            lineas.append(f"### {fecha} — {titulo_centro}")
            lineas.append("")
            lugar = _centro_lugar(centro)
            if lugar:
                lineas.append(f"- **Lugar:** {_escapar_md(lugar)}")
            lineas.append(f"- **Motivo:** {_escapar_md(consulta.get('motivo'))}")
            lineas.append(f"- **Diagnóstico:** {_escapar_md(consulta.get('diagnostico'))}")
            tratamiento = _tratamiento_de(consulta)
            if tratamiento:
                lineas.append(f"- **Tratamiento:** {_escapar_md(tratamiento)}")
            vacunas = _lista_textos(consulta.get("vacunas"))
            if vacunas:
                lineas.append("- **Vacunas:** " + ", ".join(_escapar_md(v, vacio="") for v in vacunas))
            if consulta.get("notas"):
                lineas.append(f"- **Notas:** {_escapar_md(consulta.get('notas'))}")
            lineas.append("")

    lineas.append("---")
    lineas.append("")
    lineas.append("El papel original y el sistema viejo se conservan intactos.")
    lineas.append("")
    return "\n".join(lineas)


def _pandoc_disponible() -> bool:
    return shutil.which("pandoc") is not None


def _correr_pandoc(markdown: str, destino: Path | None, formato: str, extra: list[str] | None = None) -> str:
    if not _pandoc_disponible():
        raise ExportError(
            "No está instalado Pandoc. Instalálo con: sudo apt-get install -y pandoc",
            codigo="formato_no_disponible",
        )
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as tmp:
        tmp.write(markdown)
        origen = Path(tmp.name)
    try:
        cmd = [
            "pandoc",
            str(origen),
            "-f",
            "markdown-raw_html",
            "-t",
            formato,
        ]
        if extra:
            cmd.extend(extra)
        if destino is not None:
            cmd.extend(["-o", str(destino)])
        resultado = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if resultado.returncode != 0:
            raise ExportError(
                f"Pandoc falló ({formato}): {resultado.stderr.strip()}",
                codigo="formato_no_disponible",
            )
        if destino is None:
            return resultado.stdout
        return ""
    finally:
        origen.unlink(missing_ok=True)


def _envolver_html(cuerpo: str) -> str:
    return (
        "<!DOCTYPE html>\n<html lang='es'>\n<head>\n"
        "<meta charset='utf-8'>\n"
        "<meta http-equiv='Content-Security-Policy' "
        "content=\"default-src 'none'; style-src 'unsafe-inline'\">\n"
        "<title>SIGO</title>\n"
        f"<style>\n{ESTILO_HTML}\n</style>\n"
        "</head>\n<body>\n"
        f"{cuerpo}\n"
        "</body>\n</html>\n"
    )


def _html_desde_markdown(markdown: str, *, exigir_pandoc: bool = False) -> str:
    if _pandoc_disponible():
        try:
            fragmento = _correr_pandoc(markdown, destino=None, formato="html")
            if fragmento.strip():
                return _envolver_html(fragmento)
        except ExportError:
            if exigir_pandoc:
                raise
    if exigir_pandoc:
        raise ExportError(
            "No está instalado Pandoc. Instalálo con: sudo apt-get install -y pandoc",
            codigo="formato_no_disponible",
        )
    # Plan B solo para alimentar el PDF si Pandoc no está.
    cuerpo = (
        markdown.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br>\n")
    )
    return _envolver_html(cuerpo)


def _url_fetcher_seguro(url: str, timeout: int = 10, ssl_context: Any = None) -> dict[str, Any]:
    """Bloquea http(s) y file: foráneos. Solo admite data: (S-10)."""
    esquema = urlparse(url).scheme.lower()
    if esquema == "data":
        from weasyprint import default_url_fetcher

        return default_url_fetcher(url, timeout=timeout, ssl_context=ssl_context)
    raise ExportError(
        f"Carga de recursos externos bloqueada en el PDF: {url}",
        codigo="formato_no_disponible",
    )


def _pdf_desde_html(html: str) -> bytes:
    try:
        from weasyprint import HTML
    except ImportError as exc:
        raise ExportError(
            "No está instalado WeasyPrint. Instalálo con: pip install weasyprint",
            codigo="formato_no_disponible",
        ) from exc
    return HTML(string=html, url_fetcher=_url_fetcher_seguro, base_url=".").write_pdf()


def _xlsx_desde_expediente(expediente: dict[str, Any]) -> bytes:
    datos = normalizar_expediente(expediente)
    paciente = datos["paciente"]
    alertas = datos.get("alertas") or {}
    consultas = list(datos.get("consultas") or [])

    libro = Workbook()
    portada = libro.active
    portada.title = "Paciente"
    portada["A1"] = "SIGO — Tu historia te sigue."
    portada["A1"].font = Font(bold=True, size=14)
    portada["A2"] = "DATOS INVENTADOS PARA EL DEMO. No es un paciente real."
    portada["A2"].fill = PatternFill("solid", fgColor="FFF3CD")
    portada["A2"].alignment = Alignment(wrap_text=True)
    filas = [
        ("Id", paciente.get("id")),
        ("Nombre", paciente.get("nombre")),
        ("DPI / CUI", paciente.get("dpi")),
        ("Sexo", paciente.get("sexo")),
        ("Fecha de nacimiento", paciente.get("fecha_nacimiento")),
        ("Comunidad", paciente.get("comunidad")),
        ("Versión", paciente.get("version")),
    ]
    for i, (campo, valor) in enumerate(filas, start=4):
        portada[f"A{i}"] = campo
        portada[f"B{i}"] = _celda("" if valor is None else valor)
    portada.column_dimensions["A"].width = 32
    portada.column_dimensions["B"].width = 48

    hoja_alergias = libro.create_sheet("Alergias")
    hoja_alergias.append(["Alergia"])
    alergias = _lista_textos(alertas.get("alergias") or paciente.get("alergias"))
    for alergia in alergias:
        hoja_alergias.append([_celda(alergia)])
    if not alergias:
        hoja_alergias.append(["Sin alergias registradas"])

    hoja_cronicas = libro.create_sheet("Condiciones cronicas")
    hoja_cronicas.append(["Condición"])
    cronicas = _lista_textos(alertas.get("condiciones_cronicas") or paciente.get("condiciones_cronicas"))
    for cond in cronicas:
        hoja_cronicas.append([_celda(cond)])
    if not cronicas:
        hoja_cronicas.append(["Ninguna registrada"])

    hoja_consultas = libro.create_sheet("Consultas")
    hoja_consultas.append(
        ["Fecha", "Centro", "Municipio", "Departamento", "Motivo", "Diagnóstico", "Tratamiento", "Vacunas"]
    )
    for consulta in consultas:
        centro = consulta.get("centro") if isinstance(consulta.get("centro"), dict) else {}
        nombre_centro = _centro_nombre(consulta.get("centro"))
        vacunas = ", ".join(_lista_textos(consulta.get("vacunas")))
        hoja_consultas.append(
            [
                _celda(consulta.get("fecha")),
                _celda(nombre_centro),
                _celda((centro or {}).get("municipio") if centro else ""),
                _celda((centro or {}).get("departamento") if centro else ""),
                _celda(consulta.get("motivo")),
                _celda(consulta.get("diagnostico")),
                _celda(_tratamiento_de(consulta)),
                _celda(vacunas),
            ]
        )
    for hoja in (hoja_alergias, hoja_cronicas, hoja_consultas):
        for col in hoja.columns:
            hoja.column_dimensions[col[0].column_letter].width = 28

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        ruta = Path(tmp.name)
    try:
        libro.save(ruta)
        return ruta.read_bytes()
    finally:
        ruta.unlink(missing_ok=True)


def exportar(expediente: dict, formato: str) -> tuple[bytes, str, str]:
    """Devuelve (contenido, content_type, nombre).

    `expediente` puede ser el Expediente de Phil o un paciente plano.
    No aplica permisos ni rutas; eso lo hace el backend.
    """
    formato = (formato or "").lower().strip()
    if formato not in FORMATOS:
        raise ExportError(
            f"Formato no soportado: {formato}. Usá uno de: {', '.join(FORMATOS)}",
            codigo="formato_no_soportado",
        )

    datos = normalizar_expediente(expediente)
    nombre = nombre_archivo(datos, formato)
    markdown = expediente_a_markdown(datos)

    if formato == "md":
        return markdown.encode("utf-8"), TIPOS_MEDIA[formato], nombre
    if formato == "xlsx":
        return _xlsx_desde_expediente(datos), TIPOS_MEDIA[formato], nombre
    if formato == "html":
        return _html_desde_markdown(markdown, exigir_pandoc=True).encode("utf-8"), TIPOS_MEDIA[formato], nombre
    if formato == "pdf":
        html = _html_desde_markdown(markdown)
        return _pdf_desde_html(html), TIPOS_MEDIA[formato], nombre
    if formato in {"txt", "docx"}:
        with tempfile.TemporaryDirectory() as tmpdir:
            destino = Path(tmpdir) / nombre
            _correr_pandoc(markdown, destino, "plain" if formato == "txt" else "docx")
            return destino.read_bytes(), TIPOS_MEDIA[formato], nombre

    raise ExportError(
        f"Formato no soportado: {formato}",
        codigo="formato_no_soportado",
    )

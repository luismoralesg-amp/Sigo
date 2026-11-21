# Exportar — SIGO

Genera el expediente en los seis formatos del contrato de Phil.
La función que carga el backend es `sigo_modulos.exportar.exportar`
(`SIGO_EXPORT_IMPL=real`). Este paquete no importa el backend y el
backend no importa este código: solo llama la función.

Markdown es la fuente única. TXT, DOCX y HTML salen con Pandoc
(`-f markdown-raw_html`). El PDF sale con WeasyPrint desde ese HTML.
El XLSX sale con openpyxl desde el JSON.

## Firma

```python
from sigo_modulos.exportar import ExportError, exportar

# exportar(expediente: dict, formato: str) -> tuple[bytes, str, str]
contenido, content_type, nombre = exportar(expediente, "pdf")
```

`formato` ∈ `pdf`, `docx`, `xlsx`, `txt`, `md`, `html`.

| `ExportError.codigo` | HTTP (lo mapea el backend) |
| --- | --- |
| `formato_no_soportado` | 400 |
| `formato_no_disponible` | 503 (Pandoc o WeasyPrint ausentes, Pandoc falló, o pasó el tiempo límite) |

Pandoc se corta a los 30 segundos. `SIGO_PANDOC_TIMEOUT` cambia ese límite (segundos). Si vence, el código es `formato_no_disponible`.

El nombre sugerido es `sigo-<id>.<formato>` (por ejemplo `sigo-p_12.pdf`).

## Escape y red

Los campos del expediente pasan por `html.escape` (también las comillas)
antes de entrar al Markdown, y Pandoc corre con `markdown-raw_html`
apagado. El HTML lleva `Content-Security-Policy: default-src 'none'`.
WeasyPrint usa un fetcher que rechaza `http`, `https` y `file` (solo
admite `data:`). En el XLSX, un texto que empieza por `=`, `+`, `-` o
`@` se guarda con un apóstrofo delante para que Excel no lo ejecute
como fórmula.

## Cómo correr los tests

Desde `modulos-arturo/` (Ollama no hace falta; Pandoc y WeasyPrint sí,
porque los seis formatos se generan de verdad):

```bash
cd modulos-arturo
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
sudo apt-get install -y pandoc
pytest tests/test_exportar.py
```

`pip install -e ".[dev]"` es equivalente al `requirements.txt`.

## Cómo medir latencia

El script cronometra cada formato con el expediente inventado de Rosa
Ajpop. No llama a la red.

```bash
cd modulos-arturo
source .venv/bin/activate
python exportar/medir_latencia.py
python exportar/medir_latencia.py --repeticiones 3 --salida latencia-exportar.json
```

La hora impresa es la de Guatemala (UTC-6). El PDF es el que más tarda
(WeasyPrint); MD y TXT son instantáneos.

Para regenerar archivos de ejemplo (no se versionan) y abrirlos con
`file`, `unzip -t` y `pdftotext`:

```bash
python exportar/generar_ejemplos.py
```

## Dependencias

Declaradas en `pyproject.toml` y `requirements.txt`:

- `openpyxl==3.1.5`
- `weasyprint==70.0`
- Pandoc del sistema (`pandoc`), no pypandoc

WeasyPrint necesita las bibliotecas del sistema cairo, pango y
gdk-pixbuf, y una fuente (DejaVu Sans o Liberation Sans).

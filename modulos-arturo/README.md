# modulos-arturo

Implementaciones reales de Arturo. El backend las elige con
`SIGO_CAG_IMPL=real` y `SIGO_EXPORT_IMPL=real` e importa
`sigo_modulos.cag.preguntar` y `sigo_modulos.exportar.exportar`.
Ningún lado importa el código del otro.

- [cag/](cag/README.md) — asistente local (Ollama, caché KV, fuentes).
- [exportar/](exportar/README.md) — pdf, docx, xlsx, txt, md, html.

```bash
cd modulos-arturo
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest
```

Pandoc es dependencia de sistema para exportar (`sudo apt-get install -y pandoc`).
Los tests del CAG mockean Ollama: no hace falta el modelo.

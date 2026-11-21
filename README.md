# SIGO — Tu historia te sigue.

Monorepo del hackathon open2 (Legacy). EN CONSTRUCCIÓN: el backend se está alineando al contrato de Phil (docs/contrato-phil-flujo-y-api.txt).

- backend/ — Luis (FastAPI, Supabase, permisos, DPI, códigos, CORS, hosting)
- modulos-arturo/ — Arturo (visión, importar, CAG, exportar). CAG y exportar ya están en esa carpeta; cómo correrlos, en modulos-arturo/README.md
- contrato/ — v0 obsoleta (OpenAPI y mocks); contrato vigente = docs/contrato-phil-flujo-y-api.txt; OpenAPI v1 antes de las 12:00
- frontend/ — grupo de frontend
- docs/ — contrato de Phil y reporte de errores de Arturo

Interfaces backend ↔ Arturo: modulos-arturo/INTERFACES.md. El backend corre solo con mocks (SIGO_*_IMPL=mock).

## Backend

API FastAPI en `backend/` (contrato v1 de Phil, bajo `/api/v1`). Pruebas: `cd backend && python -m pytest`.

Datos de prueba inventados: Rosa Batz Tzoc, DPI `2547896330801`, PIN `4821`. El DPI de ejemplo del contrato (`2547896310801`) no pasa el dígito verificador módulo 11 (se espera 3); no está en los mocks.

`POST /api/v1/dev/sesion` solo responde si `SIGO_ENV=desarrollo` y `SIGO_DEV_LOGIN=true`. En producción, en demo, o si no se configura `SIGO_DEV_LOGIN`, responde 404.

### Importar Access

El servidor necesita **mdbtools** para leer un `.accdb` o `.mdb`:

```bash
sudo apt-get update && sudo apt-get install -y mdbtools
```

`backend/Dockerfile` ya corre ese `apt-get`. Sin el paquete, la importación de Access no puede leer el archivo.

# SIGO — Tu historia te sigue.

Monorepo del hackathon open2 (Legacy). Contrato vigente: `docs/contrato-v3.md` (v3, v1 congelada, rutas por `id`).

- backend/ — Luis (FastAPI, Supabase, permisos, DPI, códigos, CORS, hosting)
- modulos-arturo/ — Arturo (visión, importar, CAG, exportar). CAG y exportar ya están en esa carpeta; cómo correrlos, en modulos-arturo/README.md
- contrato/ — `openapi.yaml` (OpenAPI 3.1, 20 endpoints de la v3) y `mocks/` (un JSON por respuesta)
- frontend/ — Next.js (13 pantallas de la v3). Corre sin backend con mocks: `cd frontend && npm install && npm run dev`. Ver `handoff.md`
- docs/ — `contrato-v3.md` (vigente), versiones anteriores del contrato y reporte de errores de Arturo

Interfaces backend ↔ Arturo: modulos-arturo/INTERFACES.md. El backend corre solo con mocks (SIGO_*_IMPL=mock).

## Backend

API FastAPI en `backend/` (contrato v1 de Phil, bajo `/api/v1`). Pruebas: `cd backend && python -m pytest`.

Datos de prueba inventados: Rosa Batz Tzoc, DPI `2547896330801`. El contrato v3 pide PIN de 6 dígitos: `482193` (lo usan los mocks y el frontend). **Pendiente del backend:** `backend/app/datos.py` todavía siembra `PIN_ROSA = "4821"` (4 dígitos), así que contra el backend real hoy se entra con `4821`.

`POST /api/v1/dev/sesion` solo responde si `SIGO_ENV=desarrollo` y `SIGO_DEV_LOGIN=true`. En producción, en demo, o si no se configura `SIGO_DEV_LOGIN`, responde 404.

### Importar Access

El servidor necesita **mdbtools** para leer un `.accdb` o `.mdb`:

```bash
sudo apt-get update && sudo apt-get install -y mdbtools
```

`backend/Dockerfile` ya corre ese `apt-get`. Sin el paquete, la importación de Access no puede leer el archivo.

# SIGO — Tu historia te sigue.

Monorepo del hackathon open2 (Legacy). El frontend usa `docs/contrato-v3.md`. El backend sirve ese contrato bajo `/api/v1` y conserva lo que ya estaba del contrato de Phil (`docs/contrato-phil-flujo-y-api.txt`).

- backend/ — Luis (FastAPI, Supabase, permisos, DPI, códigos, CORS, hosting)
- modulos-arturo/ — Arturo (visión, importar, CAG, exportar). CAG y exportar ya están en esa carpeta; cómo correrlos, en modulos-arturo/README.md
- contrato/ — el frontend trae `openapi.yaml` (OpenAPI 3.1, 20 endpoints de la v3) y `mocks/`. El backend genera `openapi-v1.json` desde FastAPI (`cd backend && python -m app.exportar_openapi`). Cuál manda si no coinciden queda pendiente; ver `contrato/README.md`.
- frontend/ — Next.js (13 pantallas de la v3). Corre sin backend con mocks: `cd frontend && npm install && npm run dev`. Ver `frontend/README.md`
- docs/ — `contrato-v3.md` (lo que usa el frontend), el contrato de Phil y el reporte de errores de Arturo

Interfaces backend ↔ Arturo: modulos-arturo/INTERFACES.md. El backend corre solo con mocks (SIGO_*_IMPL=mock).

## Backend

API FastAPI en `backend/`. **URL base: `/api/v1`** (local: `http://localhost:8000/api/v1/me`).

Pruebas: `cd backend && python -m pytest`.

OpenAPI v1, generado desde FastAPI (no se edita a mano):

```bash
cd backend && python -m app.exportar_openapi
```

Queda en `contrato/openapi-v1.json`. `contrato/openapi.yaml` es el OpenAPI 3.1 que commiteó el frontend para la v3; no es el archivo generado por FastAPI.

### Túnel de Cloudflare (PC de Luis)

El navegador del frontend manda `Origin` desde `http://localhost:3000`, `http://127.0.0.1:3000` o `https://sigo.vercel.app`. Esos orígenes, y en desarrollo `https://*.trycloudflare.com` por regex, ya están permitidos con credenciales. Se cambian con `SIGO_CORS_ORIGINS` y `SIGO_CORS_ORIGIN_REGEX` (vienen en `backend/.env.example`). En producción `SIGO_CORS_ORIGIN_REGEX` va vacío: sin trycloudflare.

```bash
cd backend && SIGO_CORS_ORIGINS='http://localhost:3000,http://127.0.0.1:3000,https://sigo.vercel.app' SIGO_CORS_ORIGIN_REGEX='^https://[a-zA-Z0-9-]+\.trycloudflare\.com$' SIGO_ENV=desarrollo SIGO_DEV_LOGIN=true uvicorn app.main:app --host 127.0.0.1 --port 8000 & cloudflared tunnel --url http://127.0.0.1:8000
```

La URL que imprime cloudflared es el host del API, **sin** `/api/v1`. El cliente del frontend (`frontend/lib/api/cliente.ts`) arma `BASE = ${NEXT_PUBLIC_API_URL}/api/v1`. `NEXT_PUBLIC_API_URL` va solo con el host, por ejemplo `http://localhost:8000` o `https://<host>.trycloudflare.com`. Si la variable ya trae `/api/v1`, la ruta se duplica. Lo mismo vale para `SIGO_PUBLIC_API_URL` en el backend (firma las URLs de los archivos).

Datos de prueba inventados: Rosa Batz Tzoc, DPI `2547896330801`, PIN de 6 dígitos `482193`. Mateo Batz, `TMP-20261121-K7Q4`, PIN `258025`. El médico de prueba es el Dr. Mateo Us (`mateo.us@sigo.demo`). Un PIN de 4 dígitos ya no entra. Después de 5 intentos fallidos el DPI queda bloqueado 15 minutos. Las fichas de la semilla están en `/api/v1/archivos/semilla/*.svg`.

`POST /api/v1/dev/sesion` solo responde si `SIGO_ENV=desarrollo` y `SIGO_DEV_LOGIN=true`. En producción, en demo, o si no se configura `SIGO_DEV_LOGIN`, responde 404.

### Importar Access

El servidor necesita **mdbtools** para leer un `.accdb` o `.mdb`:

```bash
sudo apt-get update && sudo apt-get install -y mdbtools
```

`backend/Dockerfile` ya corre ese `apt-get`. Sin el paquete, la importación de Access no puede leer el archivo.

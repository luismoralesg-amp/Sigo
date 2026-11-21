# SIGO — Tu historia te sigue.

Monorepo del hackathon open2 (Legacy). EN CONSTRUCCIÓN: el backend se está alineando al contrato de Phil (docs/contrato-phil-flujo-y-api.txt).

- backend/ — Luis (FastAPI, Supabase, permisos, DPI, códigos, CORS, hosting)
- modulos-arturo/ — Arturo (visión, importar, CAG, exportar). CAG y exportar ya están en esa carpeta; cómo correrlos, en modulos-arturo/README.md
- contrato/ — ley = docs/contrato-phil-flujo-y-api.txt; OpenAPI v1 generado = contrato/openapi-v1.json; openapi.yaml es la v0 obsoleta (no borrar)
- frontend/ — grupo de frontend
- docs/ — contrato de Phil y reporte de errores de Arturo

Interfaces backend ↔ Arturo: modulos-arturo/INTERFACES.md. El backend corre solo con mocks (SIGO_*_IMPL=mock).

## Backend

API FastAPI en `backend/`. **URL base: `/api/v1`** (local: `http://localhost:8000/api/v1/me`).

Pruebas: `cd backend && python -m pytest`.

OpenAPI v1, generado desde FastAPI (no se edita a mano):

```bash
cd backend && python -m app.exportar_openapi
```

Queda en `contrato/openapi-v1.json`. `contrato/openapi.yaml` es la v0 obsoleta y se deja a propósito.

### Túnel de Cloudflare (PC de Luis)

El navegador del frontend manda `Origin` desde `http://localhost:3000`, `http://127.0.0.1:3000` o `https://sigo.vercel.app`. Esos orígenes, y `https://*.trycloudflare.com` por regex, ya están permitidos con credenciales. Se cambian con `SIGO_CORS_ORIGINS` y `SIGO_CORS_ORIGIN_REGEX` (vienen en `backend/.env.example`).

```bash
cd backend && SIGO_CORS_ORIGINS='http://localhost:3000,http://127.0.0.1:3000,https://sigo.vercel.app' SIGO_CORS_ORIGIN_REGEX='^https://[a-zA-Z0-9-]+\.trycloudflare\.com$' SIGO_ENV=desarrollo SIGO_DEV_LOGIN=true uvicorn app.main:app --host 127.0.0.1 --port 8000 & cloudflared tunnel --url http://127.0.0.1:8000
```

La URL que imprime cloudflared es el origen del API. En el frontend: `NEXT_PUBLIC_API_URL=https://<ese-host>.trycloudflare.com/api/v1`.

Datos de prueba inventados: Rosa Batz Tzoc, DPI `2547896330801`, PIN `4821`. El DPI de ejemplo del contrato (`2547896310801`) no pasa el dígito verificador módulo 11 (se espera 3); no está en los mocks.

`POST /api/v1/dev/sesion` solo responde si `SIGO_ENV=desarrollo` y `SIGO_DEV_LOGIN=true`. En producción, en demo, o si no se configura `SIGO_DEV_LOGIN`, responde 404.

### Importar Access

El servidor necesita **mdbtools** para leer un `.accdb` o `.mdb`:

```bash
sudo apt-get update && sudo apt-get install -y mdbtools
```

`backend/Dockerfile` ya corre ese `apt-get`. Sin el paquete, la importación de Access no puede leer el archivo.

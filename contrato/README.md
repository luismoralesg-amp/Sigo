# Contrato

En esta carpeta conviven dos descripciones. Este merge no eligió una.

## Backend (lo que sirve FastAPI)

- **OpenAPI v1 generado:** `openapi-v1.json`. No se edita a mano. Desde `backend/`:

  ```bash
  python -m app.exportar_openapi
  ```

  Un test del backend falla si el archivo no coincide con el esquema generado. Las frases de status (`Content Too Large` / `Request Entity Too Large`) no entran en la comparación.
- **URL base que implementa el backend:** `/api/v1` (local: `http://localhost:8000/api/v1`).
- **`NEXT_PUBLIC_API_URL` va sin `/api/v1`.** Solo el host: `http://localhost:8000` o `https://<host>.trycloudflare.com`. El cliente (`frontend/lib/api/cliente.ts`) concatena `/api/v1`. Si la variable ya trae ese sufijo, la ruta se duplica.

## Frontend (v3)

- **Documento que usa el frontend:** `../docs/contrato-v3.md` (v3, rutas por `id`).
- `openapi.yaml`: OpenAPI 3.1 con los 20 endpoints de la v3.
- `mocks/`: un JSON por respuesta (ver `mocks/README.md`).
- `docs/contrato-phil-flujo-y-api.txt` y `docs/contrato-v2.md` quedan como historial, según el frontend.

Si una ruta, un campo o la URL base no coinciden entre los dos, no se resolvió aquí: queda como decisión pendiente.

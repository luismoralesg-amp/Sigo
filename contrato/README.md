# Contrato

- **Ley:** `../docs/contrato-phil-flujo-y-api.txt` (Phil). Rutas y formas no se cambian desde el backend.
- **URL base del API:** `/api/v1`. En local es `http://localhost:8000/api/v1`. Detrás del túnel, el mismo camino: `https://<host>.trycloudflare.com/api/v1`.
- **OpenAPI v1 (generado, no editar a mano):** `openapi-v1.json`. Sale de FastAPI. Desde `backend/`:

  ```bash
  python -m app.exportar_openapi
  ```

  Un test del backend falla si el archivo commiteado no coincide con el esquema generado.
- **v0 obsoleta:** `openapi.yaml` y `mocks/` (borrador anterior, rutas por DPI). Se quedan para no romper enlaces viejos. No los uses para armar el cliente.

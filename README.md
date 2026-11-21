# SIGO — Tu historia te sigue.

Monorepo del hackathon open2 (Legacy). EN CONSTRUCCIÓN: el backend se está alineando al contrato de Phil (docs/contrato-phil-flujo-y-api.txt).

- backend/ — Luis (FastAPI, Supabase, permisos, DPI, códigos, CORS, hosting)
- modulos-arturo/ — Arturo (visión, importar, CAG, exportar)
- contrato/ — OpenAPI y mocks (v0, se reemplaza por v1)
- frontend/ — grupo de frontend
- docs/ — reportes

## Backend

API FastAPI en `backend/` (contrato v1 de Phil, bajo `/api/v1`). Pruebas: `cd backend && python -m pytest`.

Datos de prueba inventados: Rosa Batz Tzoc, DPI `2547896330801`, PIN `4821`. El DPI de ejemplo del contrato (`2547896310801`) no pasa el dígito verificador módulo 11 (se espera 3); no está en los mocks.

### Importar Access

El servidor necesita **mdbtools** para leer un `.accdb` o `.mdb`:

```bash
sudo apt-get update && sudo apt-get install -y mdbtools
```

`backend/Dockerfile` ya corre ese `apt-get`. Sin el paquete, la importación de Access no puede leer el archivo.

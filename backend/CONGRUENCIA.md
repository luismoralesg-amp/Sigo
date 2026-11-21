# Congruencia del backend con el contrato v1

La ley es el contrato de Phil (`docs/contrato-phil-flujo-y-api.txt`): 18 endpoints bajo `/api/v1`. `POST /importaciones` es el extra. `POST /importar` del borrador v0 no existe.

`contrato/openapi.yaml` sigue en v0 (`error` y `mensaje` sueltos, sin enum de códigos). La v1 publica los códigos en el OpenAPI de FastAPI (`/openapi.json`, esquema `ErrorCuerpo`).

## Tabla de errores

| HTTP | codigo |
| --- | --- |
| 400 | validacion, dpi_invalido, sin_consentimiento, formato_no_soportado |
| 401 | sin_sesion, pin_incorrecto |
| 403 | rol_no_permitido, acceso_vencido, solo_emergencia |
| 404 | no_existe |
| 409 | dpi_ya_existe, ficha_ya_confirmada, codigo_ya_usado |
| 410 | codigo_vencido |
| 413 | imagen_muy_grande |
| 422 | ilegible |
| 429 | demasiados_intentos |
| 503 | ia_no_disponible |

`formato_no_soportado` es un 400 con ese código. No se reescribe como `validacion`. Phil no lo enumeraba; la decisión de importación y exportación lo agrega. Un `.accdb` no es formato no soportado: el servidor necesita `mdbtools` y, si el módulo real no está conectado, responde 503 `ia_no_disponible`.

## Pendiente, sin implementar

- S-09: la enfermera no está limitada por centro.
- P-05: no hay cruce por nombre y fecha para fichas anteriores al DPI. `TMP-AAAAMMDD-XXXX` solo cubre el alta de hoy sin DPI.

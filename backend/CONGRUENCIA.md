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

## S-09 (alcance de la enfermera)

La enfermera ve el expediente completo —Phil: para poder corregir— solo si se cumple una de estas:

1. el paciente es de su centro (`centro_id` al darlo de alta, o en la semilla de Chuicacá);
2. tiene una consulta en ese centro;
3. ella atendió esa consulta (`editada_por`).

Rosa y Mateo quedan en el puesto de Ana, así que el demo no cambia. Cada `GET /pacientes/{id}/expediente` de la enfermera se anota en la bitácora que ve la paciente (`tipo: enfermera`) y en el registro interno (`lectura_expediente`). Un intento fuera de alcance no entra a la bitácora de la paciente; queda como `acceso_denegado`.

La exportación no se le abrió. Phil (endpoint 12) la reserva a la paciente. Un `GET /exportar` de la enfermera responde 403 `rol_no_permitido` y también queda en la bitácora interna.

`GET /pacientes/buscar` sigue nacional y responde 200 con el paciente si el DPI existe (lista vacía solo si no existe; ni 403 ni 409). La forma es la de Phil (`pacientes: [Paciente]`). Fuera de emergencia, `alergias` y `condiciones_cronicas` van en `[]`, también si el paciente es del centro de la enfermera. Con `?emergencia=true` se devuelven los valores guardados. El expediente, las versiones, las fichas, las correcciones y los códigos siguen la regla de centro de arriba.

## P-05 (fichas anteriores al DPI) — no implementado

No hay endpoint nuevo: Phil no lo trae y no se agregan rutas. Hoy una fila importada sin DPI crea un `TMP-AAAAMMDD-XXXX` y no cruza con nadie. La ficha de foto nace ligada al paciente de la URL.

Cuando se implemente, sin ligar solo:

- Normalizar nombre (minúsculas, sin tildes, espacios colapsados) y comparar `fecha_nacimiento` exacta (`YYYY-MM-DD`).
- Si hay coincidencias, proponerlas a la enfermera. No llamar `crear_paciente` ni cambiar `paciente_id` por ese cruce.
- El único guardado sigue siendo `POST /fichas/{id}/confirmar` con `consentimiento: true`. Sin ese Confirmar, la ficha no entra al expediente.

## Inconsistencias que no se tocaron

- El DPI de ejemplo de Phil (`2547896310801`) no pasa el dígito verificador. El demo usa `2547896330801`.
- La descarga (`GET /pacientes/{id}/exportar`) es solo de la paciente, igual que `modulos-arturo/INTERFACES.md` y el endpoint 12 de Phil.
- `formato_no_soportado` no está en la tabla de Phil; se documentó arriba y no se reescribe como `validacion`.

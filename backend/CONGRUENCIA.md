# Congruencia del backend con el contrato

La base sigue siendo el contrato de Phil (`docs/contrato-phil-flujo-y-api.txt`): 18 endpoints bajo `/api/v1`. Encima está la v3 (`docs/contrato-v3.md`), sumada sin quitar rutas ni campos:

- `GET /fichas?estado=&importacion_id=` lista fichas del centro de la enfermera (S-09), de la más nueva a la más vieja. Sin `estado`, quedan las pendientes (`lista`).
- `Ficha` suma `originales`, `origen` (`foto` | `importacion`) e `importacion_id`. `imagenes` se conserva (en una foto, las mismas URLs que `originales`).
- `POST /pacientes` responde `{ paciente, pin_inicial, advertencias }`. `dpi_dudoso` si el dígito verificador o el municipio no cuadran (se crea igual). `posible_duplicado` si el nombre ya está y la fecha de nacimiento no contradice. Un `TMP-` no es advertencia. Un DPI repetido sigue siendo `409 dpi_ya_existe`.
- El PIN tiene 6 dígitos. La semilla de Rosa es `482193`. `PUT /me/pin` rechaza otra longitud. 5 intentos fallidos bloquean 15 minutos (S-03).
- `POST /importaciones` responde `201` con la forma congelada. Un archivo de más de 20 MB es `413 archivo_muy_grande`.

`POST /importar` del borrador v0 no existe.

`NEXT_PUBLIC_API_URL` (y `SIGO_PUBLIC_API_URL`) es el host, sin `/api/v1`. El cliente arma `${NEXT_PUBLIC_API_URL}/api/v1`. Ejemplo: `https://<host>.trycloudflare.com`.

`contrato/openapi.yaml` sigue en v0 (`error` y `mensaje` sueltos, sin enum de códigos). La v1 publica los códigos en el OpenAPI de FastAPI (`/openapi.json`, esquema `ErrorCuerpo`).

## Tabla de errores

| HTTP | codigo |
| --- | --- |
| 400 | validacion, dpi_invalido, identificador_invalido, sin_consentimiento, motivo_requerido, formato_no_soportado |
| 401 | sin_sesion, pin_incorrecto |
| 403 | rol_no_permitido, acceso_vencido, solo_emergencia |
| 404 | no_existe |
| 409 | dpi_ya_existe, ficha_ya_confirmada, codigo_ya_usado |
| 410 | codigo_vencido |
| 413 | imagen_muy_grande, archivo_muy_grande |
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

`GET /pacientes/buscar` sigue nacional y responde 200 con el paciente si el DPI existe (lista vacía solo si no existe; ni 403 ni 409). La forma es la de Phil (`pacientes: [Paciente]`). Si el paciente es de su centro según S-09, `alergias` y `condiciones_cronicas` vienen completas. Si no lo es, esas listas van en `[]`. `?emergencia=true` no abre las alertas por sí solo: hace falta un acceso de emergencia vigente de `POST /emergencia` para ese paciente. Esa lectura queda en la bitácora con `tipo: emergencia` (la paciente la ve en rojo). El expediente, las versiones, las fichas, las correcciones y los códigos siguen la regla de centro de arriba.

## P-05 (fichas anteriores al DPI) — no implementado

No hay endpoint nuevo: Phil no lo trae y no se agregan rutas. Hoy una fila importada sin DPI crea un `TMP-AAAAMMDD-XXXX` y no cruza con nadie. La ficha de foto nace ligada al paciente de la URL.

Cuando se implemente, sin ligar solo:

- Normalizar nombre (minúsculas, sin tildes, espacios colapsados) y comparar `fecha_nacimiento` exacta (`YYYY-MM-DD`).
- Si hay coincidencias, proponerlas a la enfermera. No llamar `crear_paciente` ni cambiar `paciente_id` por ese cruce.
- El único guardado sigue siendo `POST /fichas/{id}/confirmar` con `consentimiento: true`. Sin ese Confirmar, la ficha no entra al expediente.

## Diferencias de la v3 que no se cambiaron

- El login de la paciente sigue respondiendo `dpi_invalido` por dentro y lo convierte en `pin_incorrecto`. No se publica `identificador_invalido` en ese camino: distinguiría un DPI mal formado de un PIN mal puesto (S-03).
- Una foto de más de 5 MB sigue siendo `413 imagen_muy_grande`. `archivo_muy_grande` se usa para el archivo de importar de más de 20 MB. El frontend, ante un 413 con un código que no conoce, lo lee como `archivo_muy_grande`.
- `SIGO_DPI_VERIFICADOR_ESTRICTO=true` todavía bloquea un dígito verificador que no cuadra. Apagado (el default) es advertencia `dpi_dudoso`, que es lo que pide la v3. El flag no se quitó.
- La semilla geográfica sigue en Chuicacá / Totonicapán y el médico de prueba es el Dr. Mario Xicará. La v3 narra Chichicastenango y al Dr. Mateo Us. Cambiar los nombres reescribiría la semilla y la prueba de S-09.
- `POST /pacientes/{id}/fichas` sigue en `200` cuando la visión mock devuelve la ficha ya en `lista`. La v3 también acepta `202` si queda en `procesando`. El frontend acepta las dos.
- Un `TMP-` no entra en `advertencias`. La v3 lo dice así: el identificador va en `paciente.dpi`.
- Exportar sigue siendo solo de la paciente. La enfermera y el médico reciben `403`.

## Inconsistencias que no se tocaron

- El DPI de ejemplo de Phil (`2547896310801`) no pasa el dígito verificador. El demo usa `2547896330801`.
- La descarga (`GET /pacientes/{id}/exportar`) es solo de la paciente, igual que `modulos-arturo/INTERFACES.md` y el endpoint 12 de Phil.
- `formato_no_soportado` no está en la tabla de Phil; se documentó arriba y no se reescribe como `validacion`.

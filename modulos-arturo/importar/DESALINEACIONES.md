# Importar — decisiones congeladas

Contrato que manda: Phil (`docs/contrato-phil-flujo-y-api.txt`).
Firma: `sigo_modulos.importar.leer_archivo(nombre_archivo: str, contenido: bytes) -> list[FilaImportada]`.
`FilaImportada = {"dpi": str | None, "fila": int, "extraccion": Extraccion}`.
`Campo = {"valor", "confianza": "alta" | "baja"}`. `extraccion.error` (str) solo si la fila no se pudo leer.

Esta carpeta no toca el backend ni `contrato/`. `POST /importaciones` lo arma el backend.

## Congelado y aplicado

1. **`consultas[].pagina`.** Siempre `0`. En una importación no hay foto.

2. **CUI de 13 dígitos que no pasa el verificador (ni depto/municipio).** Se entrega en `FilaImportada.dpi` y en `paciente.dpi.valor`, con confianza `"baja"`. No se corrige el dígito. La fila no lleva `extraccion.error`: el humano la revisa. Un número que no tiene 13 dígitos deja `FilaImportada.dpi = None` (el valor crudo, si había texto, queda en el campo con `"baja"`).

3. **Sin DPI de 13 dígitos.** `dpi = None`. Este módulo **nunca** genera `TMP-AAAAMMDD-XXXX`. El backend asigna el temporal.

4. **Código de error de archivo.** Extensión rara, archivo corrupto, falta `openpyxl`/`xlrd`, o Access sin mdbtools: excepción `ErrorModulo` con `codigo="formato_no_soportado"` (HTTP 400). El código que debe ver el front es `formato_no_soportado`, no `"validacion"`. Hoy `backend/app/modulos/interfaces.py` reescribe ese código a `"validacion"` en `CODIGOS_ERROR`. Este PR no cambia ese mapa (está fuera de `modulos-arturo`). Para que el front vea el código congelado, el backend tiene que dejar pasar `formato_no_soportado`.

5. **Una hoja, una tabla, sin agrupar.** Excel: solo la hoja activa (`.xls`: la primera). Access: una tabla de usuario, la de mayor puntaje de columnas mapeadas. Dos filas con el mismo CUI son dos `FilaImportada`; creado/actualizado lo decide el backend.

6. **Columna suelta `fecha`.** Va a `consultas[].fecha`. `fecha_nacimiento` solo si el encabezado es el canónico o un sinónimo de nacimiento (`fecha nac.`, `fnac`, …).

7. **Nombre + apellidos.** Si las dos celdas (o más partes: primer apellido, segundo nombre, …) vienen llenas, se concatenan con un espacio y la confianza es **`"alta"`**. El prototipo ponía `"baja"` (0.74). Una sola columna de nombre completo por sinónimo (`Nombre del paciente`, …) sigue en `"baja"`.

8. **Sexo.** `F` y `M` → `"alta"`. Palabras reconocidas (`Femenino`, `Masculino`, `mujer`, `hombre`, `fem`, `masc`) → `F`/`M` con `"baja"`. Cualquier otro valor (`Otro`, `X`) → `null` + `"baja"`. No se inventa un sexo.

9. **Celda vacía y listas.** Vacía → `null` + `"baja"`. `Ninguna` / `Ninguno` / `Ningunas` / `Ningunos` escrito → `[]` + `"alta"`, aunque la columna sea sinónimo.

10. **Fila que no se lee.** Se devuelve igual: `dpi: null`, `extraccion.error` en español (`"La fila está vacía."`, `"No hay columnas reconocidas en esta fila."`, o `"No se pudo leer la fila: …"`), todos los campos de `paciente` en `null`+`"baja"`, `consultas: []`. Las filas vacías del final se omiten (Excel suele rellenar de más); las del medio se reportan.

11. **Columnas sin mapeo.** Se ignoran. Nunca se copian a un campo del contrato (`Observaciones` no aparece en la extracción).

## Cómo arma el backend la respuesta

Este módulo solo entrega `list[FilaImportada]`, `fila` en base 1 (primera fila de datos).

| Campo de `POST /importaciones` | De dónde sale |
|---|---|
| `importacion_id` | backend |
| `total_filas` | `len(filas)` |
| `creados`, `actualizados` | backend, al confirmar contra el expediente |
| `con_errores` | `sum(1 for r in filas if r["extraccion"].get("error"))` |
| `filas[].fila` | `FilaImportada.fila` |
| `filas[].dpi` | `FilaImportada.dpi` (`null` si no hay 13 dígitos) |
| `filas[].estado` | `"error"` si hay `extraccion.error`; si no, creado/actualizado lo decide el backend |
| `filas[].expediente_id` | backend (`null` si la fila es error o aún no hay expediente) |
| `filas[].error` | `extraccion.error` o `null` |

## Dependencia que no es pip

`.mdb` / `.accdb` necesitan el paquete de sistema **mdbtools** (`mdb-export` y `mdb-tables`). Sin ellos el error es `formato_no_soportado` y el mensaje nombra el paquete. No se usa ODBC ni pyodbc.

# SIGO Importar

`sigo_modulos.importar.leer_archivo(nombre_archivo, contenido) -> list[FilaImportada]`

La función que carga el backend está en `modulos-arturo/sigo_modulos/importar.py`
(firma de `backend/app/modulos/interfaces.py`). Esta carpeta trae las pruebas,
las fixtures inventadas y cómo regenerarlas. No escribe expedientes ni genera
`TMP-…`: solo devuelve filas para que una persona las revise y confirme.

```bash
cd modulos-arturo/importar
pip install -r requirements.txt
# Access, en el sistema (no es un paquete de pip):
#   sudo apt-get install -y mdbtools
SIGO_IMPORTAR_IMPL=real python -m pytest -q -s
```

El backend elige con `SIGO_IMPORTAR_IMPL=mock|real` (default `mock`).
Con `mock` (o si la variable no es `real`) la función valida la extensión y
devuelve 3 filas inventadas, sin leer el archivo. Con `real` lee el contenido.

`ErrorModulo` vive en `sigo_modulos/errores.py`. Es el mismo archivo que el PR
de visión (`cursor/vision-extraer-ficha-019c`), copiado tal cual: no hay una
segunda clase. `__init__.py` del paquete también es el de esa rama.
Importar hace `from .errores import ErrorModulo`. CAG y exportar, en su rama,
levantan excepciones propias que también traen `codigo`; al mergear no hace
falta unificarlas para que el backend las lea.

## Formatos (`SIGO_IMPORTAR_IMPL=real`)

| Formato | Dependencia | Notas |
|---|---|---|
| `.csv` / `.tsv` | stdlib | UTF-8 (con o sin BOM) o latin-1. Separador `,`, `;` o tab, detectado en la primera línea fuera de comillas. |
| `.xlsx` | `openpyxl` | Solo la hoja activa. Si falta openpyxl, `formato_no_soportado` y el mensaje pide instalarlo. |
| `.xls` | `xlrd` | Solo la primera hoja. Si falta xlrd, `formato_no_soportado`. |
| `.mdb` / `.accdb` | **mdbtools** (`mdb-tables` + `mdb-export`) | Una sola tabla de usuario: la que más columnas mapea (en la fixture, `pacientes` y no `departamentos`). |

Si `mdb-export` no está en el `PATH`, el archivo `.mdb`/`.accdb` levanta
`ErrorModulo` con `codigo="formato_no_soportado"` y un mensaje que dice que
hay que instalar el paquete de sistema `mdbtools` (`mdb-export`, `mdb-tables`).
No hay rueda de pip que lo reemplace.

Cualquier otra extensión levanta el mismo código. El backend lo traduce a
HTTP 400. El código que debe ver el front es `formato_no_soportado`.

## Qué hace

- Mapea columnas por nombre, con sinónimos en español (CUI, fecha nac., género, aldea, Dx, medicamentos, …). Una columna suelta `fecha` va a `consultas[].fecha`, no a `fecha_nacimiento`.
- Fechas a `YYYY-MM-DD`. Confianza pública solo `"alta"` | `"baja"` (puntaje interno `>= 0.75` → alta). Columna canónica y valor tal cual → alta. Sinónimo o normalización dudosa → baja.
- **Nombre + apellidos en dos celdas llenas se concatenan y salen en `"alta"`.** El prototipo ponía `"baja"`.
- Celda vacía → `valor: null`, `confianza: "baja"`. `Ninguna` / `Ninguno` / `Ningunas` / `Ningunos` en una lista → `[]` + `"alta"`.
- Sin 13 dígitos: `FilaImportada.dpi = None` y no se inventa `TMP-…` (lo asigna el backend). Un CUI de 13 dígitos que no pasa el verificador se entrega igual, con `"baja"`, sin corregir el dígito.
- Sexo `F`/`M` → alta. Palabras reconocidas (`Femenino`, `Masculino`, `mujer`, `hombre`, …) → `F`/`M` con baja. Cualquier otro valor (`Otro`, `X`) → `null` + `"baja"`.
- No copia columnas sin mapear (`Observaciones` se ignora).
- Una fila del archivo = una `FilaImportada`. No agrupa por DPI. `consultas[].pagina` es `0` (no hay foto).
- Fila vacía o que no se puede leer: se devuelve igual, con `extraccion.error`, todos los campos `null`+`"baja"` y `consultas: []`. Las filas vacías al final se omiten.

Con eso el backend arma `POST /importaciones`:

`{importacion_id, total_filas, creados, actualizados, con_errores, filas:[{fila, dpi, estado, expediente_id, error}]}`

`total_filas = len(lista)`. `con_errores` cuenta filas con `extraccion.error`.
`filas[].fila`, `filas[].dpi` y `filas[].error` salen de la fila. `estado`,
`expediente_id`, `creados`, `actualizados` e `importacion_id` los decide el
backend (esta respuesta no se arma aquí).

## Fixtures (datos inventados, nadie real)

`fixtures/pacientes_feo_latin1.csv`, `pacientes_exactos.csv`, `pacientes_tab.csv`,
`pacientes_columnas_raras.xlsx`, `pacientes_columnas_raras.xls`,
`pacientes_inventados.mdb`.

Los CSV y el `.xlsx` están sueltos. El `.mdb` y el `.xls` vienen del zip de
fixtures. Para regenerarlos: `python generate_fixtures.py` (el `.mdb` además
necesita Java y Jackcess; `CrearMdb.java` está en esta carpeta). En runtime
solo hace falta mdbtools.

## Pruebas

`SIGO_IMPORTAR_IMPL=real python -m pytest` desde esta carpeta. **20 passed**
el 21 nov 2026 (tarde, hora de Guatemala). Latencia mediana de 7 corridas,
`SIGO_IMPORTAR_IMPL=real`:

- `pacientes_feo_latin1.csv` (6 filas, 797 B): **0.54 ms**
- `pacientes_exactos.csv` (2 filas, 416 B): **0.20 ms**
- `pacientes_tab.csv` (2 filas, 148 B): **0.08 ms**
- `pacientes_columnas_raras.xlsx` (4 filas, 5480 B): **2.39 ms**
- `pacientes_columnas_raras.xls` (3 filas, 5632 B): **0.60 ms**
- `pacientes_inventados.mdb` (5 filas, 131072 B): **4.12 ms**

# Interfaces SIGO — backend ↔ módulos de Arturo

Fuente de verdad en código: `backend/app/modulos/interfaces.py`. Si cambia una firma, se cambia en los dos lados y en este archivo, con aviso a Luis.

El backend **no depende** de este código: trae implementaciones mock que funcionan solas. Cada módulo real se activa con una variable de entorno (por defecto `mock`):

| Variable | mock (backend) | real (este paquete) |
|---|---|---|
| `SIGO_VISION_IMPL` | extracción fija del ejemplo de Phil | `sigo_modulos.vision` |
| `SIGO_IMPORTAR_IMPL` | CSV/XLSX simples | `sigo_modulos.importar` |
| `SIGO_CAG_IMPL` | búsqueda por palabras con cita | `sigo_modulos.cag` |
| `SIGO_EXPORT_IMPL` | 6 formatos básicos escapados | `sigo_modulos.exportar` |

Con `real`, el backend agrega `modulos-arturo/` al `sys.path` (o usá `pip install -e modulos-arturo`) e importa la función. Si no la encuentra, el backend no arranca y dice por qué.

## Las 4 firmas (funciones a nivel de módulo)

```python
# sigo_modulos/vision/__init__.py
def extraer_ficha(imagenes: list[bytes]) -> dict: ...
#   imagenes: JPEGs en orden de página (≤1600 px, <1.5 MB c/u)
#   -> Extraccion: {"paciente": {nombre, dpi, fecha_nacimiento, sexo, comunidad, alergias, condiciones_cronicas: Campo},
#                   "consultas": [{fecha, motivo, diagnostico, tratamiento, vacunas: Campo, "pagina": int}]}
#   Campo = {"valor": T | None, "confianza": "alta" | "baja"}   (nunca inventa: no leído -> None + "baja")
#   "error" es opcional. Si viene, el backend responde 422 ilegible y no guarda la ficha.
#   Errores: codigo "ilegible" -> 422 ilegible ; "ia_no_disponible" -> 503

# sigo_modulos/importar/__init__.py
def leer_archivo(nombre_archivo: str, contenido: bytes) -> list[dict]: ...
#   .xlsx, .csv, .accdb/.mdb -> [{"dpi": str | None, "fila": int, "extraccion": Extraccion}, ...]
#   Sexo fuera de F|M: valor null y confianza "baja". pagina = 0.
#   Un CUI que no pasa el verificador llega con confianza "baja" y no es error de fila.
#   Fila ilegible: extraccion.error, campos null, confianza "baja", consultas [].
#   Errores: codigo "formato_no_soportado" -> 400 formato_no_soportado

# sigo_modulos/cag/__init__.py
def preguntar(expediente: dict, pregunta: str) -> dict: ...
#   expediente = Expediente del contrato (paciente, alertas, consultas vigentes)
#   -> {"respuesta": str, "fuentes": [{"consulta_id": str, "version": int, "original_url": str, "campo": str}]}
#   Sin fuente: "No lo encontré en el expediente." y fuentes = []. Nunca inventa.
#   Errores: codigo "ia_no_disponible" -> 503

# sigo_modulos/exportar/__init__.py
def exportar(expediente: dict, formato: str) -> tuple[bytes, str, str]: ...
#   formato ∈ {"pdf","docx","xlsx","txt","md","html"} -> (contenido, content_type, nombre_archivo)
#   Escapar HTML/Markdown y no cargar URLs externas (S-10). Evitar fórmulas en Excel (=,+,-,@).
#   Errores: codigo "formato_no_soportado" -> 400 formato_no_soportado ; "formato_no_disponible" -> 503
```

**Errores sin dependencias:** levantá cualquier excepción con atributo `codigo` (ver `sigo_modulos/errores.py`). El backend lee `codigo` y responde con la forma del contrato `{"error": {"codigo", "mensaje"}}`.

## Endpoints por los que Luis expone cada módulo (contrato de Phil, bajo `/api/v1`)

| Módulo | Endpoint | Quién |
|---|---|---|
| visión | `POST /pacientes/{id}/fichas` (202, procesa en segundo plano) → `GET /fichas/{id}` | enfermera |
| importar | `POST /importaciones` (archivo + `paciente_id` o columna DPI) → fichas en `lista` | enfermera |
| CAG | `POST /pacientes/{id}/preguntar` | médico con acceso por código vigente |
| exportar | `GET /pacientes/{id}/exportar?formato=` | paciente (dueña); médico con código; nunca en emergencia |

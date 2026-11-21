# Sigo: flujo de usuario y contrato frontend–backend

Nov 21, 2026 · @Phil

## Resumen

**Versión 2, 21 de noviembre a las 11:30:** las rutas quedan alineadas al código del backend y se aplican los arreglos del reporte de errores. Las rutas marcadas “por confirmar” se revisan contra el `openapi.yaml` del backend antes de congelar la v1 a las 12:00.

Usamos el flujo de backend: la enfermera digitaliza, la paciente ve y comparte su historial con un código temporal, y el médico lo consulta solo mientras ese código esté vigente. El MVP son 13 pantallas y 20 endpoints, y todo tiene que funcionar antes de las 18:30.

- **Qué es:** una web app que se abre con un link en el celular o la computadora y se puede guardar como ícono. Funciona en celulares viejos.
- **Stack:** frontend en Next.js (PWA); backend en FastAPI con control de roles; Supabase para la base de datos, las fotos y el login del personal; IA de visión para leer las fichas; CAG local para las preguntas y los resúmenes.
- **Tres roles:** `enfermera` digitaliza, importa y corrige pacientes de su centro; `paciente` solo ve, descarga y comparte (no edita ni borra); `medico` solo lee, con el código que le da la paciente o, en una emergencia, solo las alertas.
- **Cómo se identifica al paciente:** en las rutas va su DPI de 13 dígitos o, si es un niño sin DPI, un identificador temporal `TMP-AAAAMMDD-XXXX`.
- **Nada se borra:** corregir crea una versión nueva, y la foto o el archivo original queda guardado junto al dato.
- **Historia del demo:** doña Rosa, de Chichicastenango (Quiché), referida al Hospital Regional de Quiché, igual que en los datos del backend.
- **Convenciones:** JSON; campos en español y `snake_case`; fechas `YYYY-MM-DD`; fecha y hora en ISO 8601 con zona `-06:00`; todo bajo `/api/v1`.

## Flujo del usuario

&#91;embedded content: flujo del usuario · enfermera, paciente y médico\]

La paciente es la que da el permiso: el médico solo ve el expediente con el código que ella genera, y el acceso se cierra solo. Si la paciente no tiene smartphone, la enfermera genera el código o se lo manda por SMS; si llega inconsciente, el médico abre un acceso de emergencia que solo muestra alergias y condiciones crónicas. La enfermera nunca borra; cada corrección es una versión nueva. Si no hay señal al escanear, la foto espera en el celular y sigue el mismo camino cuando vuelve la conexión.

## Pantallas y rutas

Son 13 pantallas: 6 de la enfermera, 5 de la paciente y 2 del médico. El personal entra por `/login` y la paciente por `/mi/entrar`, con su DPI y su PIN. `[dpi]` en una ruta es el DPI o el identificador `TMP-`.

| Ruta | Pantalla | Rol | Endpoints que usa |
| --- | --- | --- | --- |
| `/login` | Inicio de sesión del personal | enfermera, médico | Supabase Auth, `GET /me` |
| `/puesto` | Buscar paciente por DPI; si no existe, formulario para crearlo (o niño sin DPI) y mostrar su PIN inicial | enfermera | `GET /pacientes/{dpi}`, `POST /pacientes` |
| `/puesto/pacientes/[dpi]` | Paciente: sus consultas, botones “Escanear ficha”, “Corregir” en cada dato y “Generar código” para la paciente sin smartphone | enfermera | `GET /pacientes/{dpi}/expediente`, `POST /consultas/{id}/versiones`, `POST /pacientes/{dpi}/versiones`, `POST /pacientes/{dpi}/consentimientos` |
| `/puesto/pacientes/[dpi]/captura` | Cámara: una o varias páginas | enfermera | `POST /fichas/foto` (o la cola local si no hay señal) |
| `/puesto/fichas/[id]` | Revisión: foto o fila original a la izquierda, campos a la derecha, dudosos en amarillo, consentimiento, confirmar | enfermera | `GET /fichas/{id}`, `POST /fichas/{id}/confirmar` |
| `/puesto/importar` | Subir Excel, CSV o Access; ver y ajustar qué columna va a qué campo; confirmar; lista de fichas creadas para revisar | enfermera | `POST /importar`, `POST /importar/{id}/confirmar` |
| `/mi/entrar` | Entrar con DPI y PIN | paciente | `POST /auth/paciente` |
| `/mi/pin` | Cambiar el PIN; obligatorio la primera vez que entra | paciente | `PUT /me/pin` |
| `/mi` | Mi historial: alergias arriba, línea de tiempo, botón “Descargar” con los formatos | paciente | `GET /pacientes/{dpi}/expediente`, `GET /pacientes/{dpi}/exportar` |
| `/mi/compartir` | Código y QR temporal, con cuenta regresiva y opción de mandarlo por SMS | paciente | `POST /pacientes/{dpi}/consentimientos` |
| `/mi/accesos` | Quién vio mi historial y cuándo; las emergencias en rojo | paciente | `GET /pacientes/{dpi}/accesos` |
| `/hospital` | Escribir el código o escanear el QR; botón “Acceso de emergencia” que pide DPI y motivo | médico | `POST /consentimientos/activar`, `POST /emergencia` |
| `/hospital/pacientes/[dpi]` | Expediente: alerta de alergias, línea de tiempo, versiones, asistente, tiempo que le queda al acceso. En emergencia, solo las alertas y una banda roja | médico | `GET /pacientes/{dpi}/expediente`, `GET /consultas/{id}/versiones`, `POST /pacientes/{dpi}/preguntar` |

Cada pantalla con datos tiene cuatro estados que el frontend dibuja: cargando, vacío, error y sin señal. Las del médico tienen un quinto: “el acceso venció”, que lo regresa a `/hospital`. La alerta de alergias se ve siempre que el paciente tenga alguna, con texto neutro (“Alergia: penicilina”), no solo cuando hay una receta en conflicto.

## Modelos de datos

Estos tipos son el contrato: el backend responde con esta forma exacta y el frontend la usa tal cual. Al paciente se le identifica por `dpi`, que es el DPI o el identificador `TMP-` de un niño. Una ficha en papel puede traer varias consultas de distintos años, así que la extracción devuelve una lista. Las consultas y los datos del paciente tienen número de versión, porque corregir nunca borra.

```typescript
// Un dato leído por la IA o por la importación. "baja" = se pinta en amarillo y se revisa primero.
type Campo<T> = { valor: T | null; confianza: "alta" | "baja" };

// 13 dígitos, o "TMP-" + fecha AAAAMMDD + "-" + 4 caracteres aleatorios: "TMP-20261121-7KQ2"
type Identificador = string;

type Rol = "enfermera" | "medico" | "paciente";

type Centro = {
  id: string;
  nombre: string;              // "Puesto de Salud de Chichicastenango"
  tipo: "puesto" | "centro" | "hospital";
  municipio: string;
  departamento: string;
};

// Para paciente, centro = null y dpi = el suyo.
type Usuario = { id: string; nombre: string; rol: Rol; centro: Centro | null; dpi: Identificador | null; debe_cambiar_pin: boolean };

// Lo que la IA o la importación leyeron, antes de que una persona confirme.
type Extraccion = {
  paciente: {
    nombre: Campo<string>;
    dpi: Campo<string>;
    fecha_nacimiento: Campo<string>;    // YYYY-MM-DD
    sexo: Campo<"F" | "M">;
    comunidad: Campo<string>;
    alergias: Campo<string[]>;
    condiciones_cronicas: Campo<string[]>;
  };
  consultas: Array<{
    fecha: Campo<string>;
    motivo: Campo<string>;
    diagnostico: Campo<string>;
    tratamiento: Campo<string>;
    vacunas: Campo<string[]>;
    pagina: number;                     // foto o fila de donde salió (0, 1, 2...)
  }>;
};

type Ficha = {
  id: string;
  dpi: Identificador;                   // la ficha nace ligada al paciente buscado o creado
  origen: "foto" | "importacion";
  client_id: string | null;             // lo genera el celular; null si vino de importación
  estado: "procesando" | "lista" | "confirmada" | "error";
  originales: string[];                 // URLs firmadas de las fotos o del archivo, válidas al menos 1 hora
  extraccion: Extraccion | null;        // null mientras estado = "procesando"
  error: string | null;
  creada_en: string;
};

type Paciente = {
  dpi: Identificador;
  nombre: string;
  fecha_nacimiento: string | null;
  sexo: "F" | "M" | null;
  comunidad: string | null;
  alergias: string[];
  condiciones_cronicas: string[];
  version: number;                      // sube con cada corrección
};

type Consulta = {
  id: string;
  version: number;                      // 1 al confirmar; 2, 3... con cada corrección
  fecha: string | null;
  centro: Centro;
  motivo: string | null;
  diagnostico: string | null;
  tratamiento: string | null;
  vacunas: string[];
  original_url: string;                 // la foto o el archivo de donde salió
  editada_por: string;
  editada_en: string;
};

type Version = {
  version: number;
  datos: Omit<Consulta, "id" | "version" | "editada_por" | "editada_en">;
  motivo_cambio: string | null;         // null en la versión 1
  editada_por: string;
  editada_en: string;
};

type Expediente = {
  paciente: Paciente;
  alertas: { alergias: string[]; condiciones_cronicas: string[]; medicamentos: string[] }; // siempre presentes
  consultas: Consulta[];                // versión vigente, de la más reciente a la más antigua; [] en emergencia
  tipo_acceso: "codigo" | "emergencia" | null;  // null para paciente y enfermera
  acceso_vence_en: string | null;
};

type Consentimiento = {
  codigo: string;                       // 8 caracteres aleatorios, sin 0, O, 1 ni I: "K7P4-Q2XM"
  qr: string;                           // texto que el frontend convierte en QR
  vence_en: string;                     // hasta cuándo se puede activar (10 minutos)
  enviado_por_sms: boolean;
};

type Acceso = {
  quien: string;                        // médico o enfermera
  centro: string;
  tipo: "codigo" | "emergencia" | "enfermera";
  motivo: string | null;                // obligatorio en emergencia
  desde: string;
  hasta: string;
  preguntas_hechas: number;
};

type Fuente = { consulta_id: string; version: number; original_url: string; campo: string };

type Importacion = {
  id: string;
  archivo: string;
  filas: number;
  columnas: string[];                   // como vienen en el archivo
  mapeo_sugerido: Record<string, string | null>; // columna → campo ("DPI" → "dpi"); null = se ignora
  muestra: Record<string, string>[];    // las primeras 5 filas, tal cual
};
```

## Contrato de API

Todas las rutas van bajo `/api/v1`, reciben y devuelven JSON (salvo la subida de archivos y las descargas) y piden `Authorization: Bearer <token>`. El personal usa el token de Supabase y la paciente el que le da `POST /auth/paciente`. El backend saca el rol y el centro del token y revisa los permisos; el frontend nunca los manda. `{dpi}` acepta `^([0-9]{13}|TMP-[0-9]{8}-[A-Z0-9]{4})$`.

La columna “En el código” dice qué rutas ya existen en el paquete del backend según el reporte de errores. Las “por confirmar” se revisan contra su `openapi.yaml`; si el nombre es otro, se cambia aquí antes de congelar.

| # | Método y ruta | Quién | Para qué | En el código |
| --- | --- | --- | --- | --- |
| 1 | `GET /me` | todos | Quién soy, mi rol y si debo cambiar el PIN | por confirmar |
| 2 | `POST /auth/paciente` | público | Paciente entra con DPI y PIN | por confirmar |
| 3 | `PUT /me/pin` | paciente | Cambiar el PIN | nuevo |
| 4 | `GET /pacientes/{dpi}` | enfermera | Buscar paciente | por confirmar |
| 5 | `POST /pacientes` | enfermera | Crear paciente y su PIN inicial | por confirmar |
| 6 | `POST /fichas/foto` | enfermera | Subir las fotos de una ficha | sí; falta leer la imagen (C-07) |
| 7 | `GET /fichas/{id}` | enfermera | Estado y extracción de la ficha | por confirmar |
| 8 | `POST /fichas/{id}/confirmar` | enfermera | Guardar en el expediente como versión 1 | sí; no guarda la consulta (C-08) |
| 9 | `POST /consultas/{id}/versiones` | enfermera | Corregir una consulta | por confirmar |
| 10 | `POST /pacientes/{dpi}/versiones` | enfermera | Corregir datos o alergias | por confirmar |
| 11 | `GET /pacientes/{dpi}/expediente` | paciente, médico, enfermera | Ver el expediente | por confirmar |
| 12 | `GET /consultas/{id}/versiones` | paciente, médico, enfermera | Historial de cambios | por confirmar |
| 13 | `GET /pacientes/{dpi}/exportar?formato=` | paciente | Descargar el historial | sí; falta escapar HTML (S-10) |
| 14 | `POST /pacientes/{dpi}/consentimientos` | paciente, enfermera | Generar código o QR temporal | sí; códigos predecibles (S-01) |
| 15 | `POST /consentimientos/activar` | médico | Abrir el acceso con el código | sí; se puede reusar (S-02) |
| 16 | `POST /pacientes/{dpi}/preguntar` | médico | Preguntar al asistente | sí; devuelve un mock (C-07) |
| 17 | `GET /pacientes/{dpi}/accesos` | paciente | Bitácora: quién vio y cuándo | por confirmar |
| 18 | `POST /emergencia` | médico | Acceso de emergencia: solo alertas | nuevo |
| 19 | `POST /importar` | enfermera | Subir un Excel, CSV o Access viejo | sí; ignora el archivo (C-05) |
| 20 | `POST /importar/{id}/confirmar` | enfermera | Aplicar el mapeo y crear las fichas | nuevo |

`GET /consentimientos` no es parte de la v1: hoy le muestra a la enfermera los códigos de todos los pacientes (S-09). Se quita o se deja solo con `SIGO_ENV=desarrollo`.

### Entrar

**1. `GET /me`** → `Usuario`.

```json
{ "id": "u_01", "nombre": "Ana Tzul", "rol": "enfermera", "dpi": null, "debe_cambiar_pin": false,
  "centro": { "id": "c_01", "nombre": "Puesto de Salud de Chichicastenango", "tipo": "puesto",
              "municipio": "Chichicastenango", "departamento": "Quiché" } }
```

**2. `POST /auth/paciente`** con `{ "dpi": "2547896310801", "pin": "482193" }` → `{ "token": "…", "vence_en": "2026-11-21T13:42:00-06:00", "dpi": "2547896310801" }`. Después de 5 intentos fallidos para ese DPI responde `429` durante 15 minutos.

**3. `PUT /me/pin`** con `{ "pin_actual": "482193", "pin_nuevo": "903417" }` → `204`. El PIN tiene 6 dígitos. Mientras `GET /me` diga `debe_cambiar_pin: true`, el frontend manda a `/mi/pin` antes que a cualquier otra pantalla.

### Enfermera

La enfermera solo puede leer, corregir y exportar pacientes que tengan alguna consulta en su centro o que ella haya creado. Fuera de eso, todo responde `403`.

**4. `GET /pacientes/{dpi}`** → `Paciente`, o `404` con `no_existe` si no está registrado.

**5. `POST /pacientes`** con `{ "dpi", "nombre", "fecha_nacimiento", "sexo", "comunidad", "telefono" }` → `201` con `{ "paciente": Paciente, "pin_inicial": "482193", "advertencias": [] }`. Para un niño sin DPI se manda `"dpi": null` y el backend genera el `TMP-`. El PIN se muestra una sola vez. Si el DPI ya existe, responde `409`. Si el dígito verificador o el municipio del DPI no cuadran con la tabla de la SAT, lo crea igual y devuelve `"advertencias": ["dpi_dudoso"]` para que la enfermera lo revise.

**6. `POST /fichas/foto`**, en `multipart/form-data`:

- `dpi`: el del paciente que la enfermera ya buscó o creó.
- `client_id`: UUID que genera el celular al tomar la foto. Si llega dos veces, el backend devuelve la ficha que ya existe con `200`.
- `imagenes`: uno o más JPEG en orden de página, reducidos por el frontend a 1600 px de lado y menos de 1.5 MB cada uno.
- `capturada_en`: fecha y hora de la foto.

Responde `202` con la ficha en `procesando`. Si la IA es rápida, puede responder directo con `lista` y la extracción; el frontend acepta las dos.

**7. `GET /fichas/{id}`** → `Ficha`. El frontend la consulta cada 2 segundos, hasta 60 segundos, mientras esté en `procesando`.

```json
{ "id": "f_88", "dpi": "2547896310801", "origen": "foto", "client_id": "7c1e…", "estado": "lista",
  "originales": ["https://…/f_88_0.jpg"],
  "extraccion": {
    "paciente": {
      "nombre": { "valor": "Rosa Batz Tzoc", "confianza": "alta" },
      "dpi": { "valor": "2547896310801", "confianza": "alta" },
      "fecha_nacimiento": { "valor": "1984-03-12", "confianza": "alta" },
      "sexo": { "valor": "F", "confianza": "alta" },
      "comunidad": { "valor": "Chichicastenango", "confianza": "alta" },
      "alergias": { "valor": ["penicilina"], "confianza": "alta" },
      "condiciones_cronicas": { "valor": [], "confianza": "alta" }
    },
    "consultas": [
      { "fecha": { "valor": "2025-08-14", "confianza": "alta" },
        "motivo": { "valor": "Control prenatal", "confianza": "alta" },
        "diagnostico": { "valor": "Embarazo 24 semanas", "confianza": "baja" },
        "tratamiento": { "valor": "Sulfato ferroso", "confianza": "alta" },
        "vacunas": { "valor": ["Td"], "confianza": "alta" },
        "pagina": 0 }
    ]
  },
  "error": null, "creada_en": "2026-11-21T10:42:00-06:00" }
```

Si el DPI que leyó la IA no coincide con el del paciente de la ficha, el frontend lo marca en rojo antes de confirmar. Las fichas viejas sin DPI escrito se ligan al paciente que la enfermera ya eligió.

**8. `POST /fichas/{id}/confirmar`** con los datos ya corregidos, sin `confianza`:

```json
{ "paciente": { "alergias": ["penicilina"], "condiciones_cronicas": [] },
  "consultas": [ { "fecha": "2025-08-14", "motivo": "Control prenatal", "diagnostico": "Embarazo 24 semanas",
                   "tratamiento": "Sulfato ferroso", "vacunas": ["Td"], "pagina": 0 } ],
  "consentimiento": true }
```

Crea las consultas en el expediente y actualiza alergias y vacunas del paciente, todo como versión nueva y con el original guardado. Responde `201` con `{ "consultas_creadas": 1, "version": 1 }`. Después de esta llamada, `GET /pacientes/{dpi}/expediente` ya tiene que mostrar la consulta. Si `consentimiento` no es `true`, responde `400`; si la ficha ya estaba confirmada, `409`.

**9. `POST /consultas/{id}/versiones`** con los campos corregidos y `"motivo_cambio": "Fecha mal leída"` → `201` con la `Consulta` en su nueva versión. La anterior se queda guardada.

**10. `POST /pacientes/{dpi}/versiones`**: igual, para nombre, alergias o condiciones crónicas. El DPI no se corrige desde la app.

**19. `POST /importar`** con un archivo `.xlsx`, `.csv` o `.accdb` → `201` con una `Importacion`: las columnas tal como vienen, el mapeo sugerido y las primeras 5 filas.

**20. `POST /importar/{id}/confirmar`** con `{ "mapeo": { "No. DPI": "dpi", "Paciente": "nombre", "Fecha visita": "consultas.fecha", "Observaciones": null } }` → `{ "fichas": [{ "id": "f_201", "dpi": "…", "nombre": "…" }], "filas_con_error": [{ "fila": 14, "motivo": "DPI inválido" }] }`. Crea una ficha en `lista` por paciente, que se revisa y confirma igual que una foto. Si un DPI del archivo no existe, crea al paciente.

### Expediente

**11. `GET /pacientes/{dpi}/expediente`** → `Expediente`. Para el médico, el backend revisa que tenga un acceso vigente para ese paciente y registra la consulta en la bitácora; el frontend no manda nada extra. Con acceso de emergencia devuelve solo `paciente` y `alertas`, con `consultas: []`. Sin acceso vigente responde `403` con `acceso_vencido`.

**12. `GET /consultas/{id}/versiones`** → `{ "versiones": Version[] }`, de la más nueva a la más vieja.

### Paciente

**13. `GET /pacientes/{dpi}/exportar?formato=pdf`** → el archivo, con `Content-Disposition: attachment`. Formatos: `pdf`, `docx`, `xlsx`, `txt`, `md`, `html` y `json`. El `json` es un resumen estructurado pensado para sistemas oficiales (MSPAS, X-Road), simulado en el demo. El texto de las notas se escapa antes de exportar, y el PDF no carga recursos externos.

**14. `POST /pacientes/{dpi}/consentimientos`** con `{ "enviar_sms": false }` → `201` con un `Consentimiento`:

```json
{ "codigo": "K7P4-Q2XM", "qr": "https://sigo.app/c/K7P4-Q2XM", "vence_en": "2026-11-21T11:40:00-06:00", "enviado_por_sms": false }
```

El código es aleatorio (8 caracteres generados con `secrets`, sin 0, O, 1 ni I) y único. Sirve una sola vez y se puede activar durante 10 minutos; el acceso que abre dura 2 horas. Lo puede pedir la paciente desde su celular, o la enfermera desde el puesto a pedido de la paciente (queda en la bitácora). Con `"enviar_sms": true` también se manda por SMS al teléfono registrado; en el demo el envío se simula. En modo demo, el acceso dura 2 minutos.

**17. `GET /pacientes/{dpi}/accesos`** → `{ "accesos": Acceso[] }`, el más reciente primero.

### Médico

**15. `POST /consentimientos/activar`** con `{ "codigo": "K7P4-Q2XM" }` → `{ "dpi": "2547896310801", "acceso_vence_en": "2026-11-21T13:35:00-06:00" }`. Si el código venció responde `410`; si ya se usó, `409`, y el acceso sigue siendo del primer médico que lo activó. Después de 5 códigos fallidos, ese médico queda bloqueado 15 minutos (`429`).

**16. `POST /pacientes/{dpi}/preguntar`** con `{ "pregunta": "¿Cuándo fue su última vacuna?" }` → `{ "respuesta": "…", "fuentes": Fuente[] }`. Responde sobre el paciente de la ruta, no sobre Rosa. Si no hay fuente, la respuesta dice que no lo encontró; nunca inventa. Pide acceso vigente, igual que el expediente.

**18. `POST /emergencia`** con `{ "dpi": "2547896310801", "motivo": "Llega inconsciente a emergencias" }` → `{ "dpi": "2547896310801", "acceso_vence_en": "2026-11-21T12:45:00-06:00", "tipo_acceso": "emergencia" }`. El motivo es obligatorio, con al menos 10 caracteres. El acceso dura 1 hora y solo deja ver los datos del paciente y las alertas; versiones, asistente y descargas responden `403` con `solo_emergencia`. Queda en la bitácora de la paciente marcado como emergencia, con el motivo.

## Errores y reglas

Todos los errores tienen la misma forma, para que el frontend muestre el `mensaje` tal cual: `{ "error": { "codigo": "codigo_vencido", "mensaje": "Este código ya venció. Pide uno nuevo a la paciente." } }`.

| HTTP | `codigo` | Cuándo | Qué hace el frontend |
| --- | --- | --- | --- |
| 400 | `validacion`, `identificador_invalido`, `sin_consentimiento`, `motivo_requerido` | Falta un dato o está mal | Marca el campo en rojo con el mensaje |
| 401 | `sin_sesion` | Token vencido o ausente | Manda a `/login` o a `/mi/entrar` |
| 401 | `pin_incorrecto` | DPI o PIN no coinciden | “DPI o PIN incorrectos”, sin decir cuál |
| 403 | `rol_no_permitido` | El rol no puede hacer eso, o la enfermera pide un paciente de otro centro | Pantalla “No tienes acceso” |
| 403 | `acceso_vencido` | El médico ya no tiene acceso vigente | Regresa a `/hospital`: “Pide un código nuevo” |
| 403 | `solo_emergencia` | Con acceso de emergencia, pide versiones, asistente o descarga | “Para ver más, pide el código a la paciente” |
| 404 | `no_existe` | Paciente, ficha o consulta no existe | En `/puesto`, abre el formulario de crear; en otras pantallas, “No encontrado” |
| 409 | `dpi_ya_existe` | Se crea un paciente con un DPI repetido | Abre el paciente que ya existe |
| 409 | `ficha_ya_confirmada` | Se confirma dos veces | Va directo al paciente |
| 409 | `codigo_ya_usado` | El código ya se activó | “Este código ya se usó” |
| 410 | `codigo_vencido` | El código pasó su `vence_en` | “Pide un código nuevo” |
| 413 | `archivo_muy_grande` | Una foto pasa de 5 MB o un archivo de 20 MB | Vuelve a comprimir la foto; para el archivo, “Divide el archivo” |
| 422 | `ilegible` | La IA o la importación no pudieron leer nada | “Toma la foto otra vez, con más luz” o “Revisa el archivo” |
| 429 | `demasiados_intentos` | 5 PIN o 5 códigos fallidos seguidos | “Espera 15 minutos” |
| 503 | `ia_no_disponible` | La IA o el asistente fallaron | Deja la ficha en cola, o “Intenta de nuevo” en el asistente |

Una advertencia no es un error: `dpi_dudoso` llega dentro de `advertencias` con `201`, y el frontend la muestra en amarillo para que la enfermera confirme.

Reglas que ambos lados tienen que respetar:

1. **Nada se borra.** No hay `DELETE` en la API, y la base no permite `UPDATE` directo sobre pacientes ni consultas: las correcciones solo se insertan como versiones.
2. **La IA nunca guarda sola.** Nada entra al expediente sin `POST /fichas/{id}/confirmar`. Lo que la IA no lee va con `valor: null` y `confianza: "baja"`; jamás un valor inventado.
3. **El médico entra con código o por emergencia.** Sin un acceso vigente, todo lo del paciente responde `403`. El acceso se cierra solo al llegar a `acceso_vence_en`, y el frontend muestra cuánto le queda. Activar un consentimiento lo hace una función del backend que solo cambia estado, médico y fecha.
4. **La paciente solo ve, descarga y comparte.** Cualquier escritura con su token responde `403`.
5. **La enfermera solo ve su centro.** Pacientes con alguna consulta en su centro o que ella creó. Nunca ve los códigos de consentimiento.
6. **Códigos imposibles de adivinar.** Aleatorios, de 8 caracteres, únicos y de un solo uso, con bloqueo tras 5 intentos fallidos.
7. **Sin tokens de prueba en público.** Los tokens `dev-paciente`, `dev-enfermera` y `dev-medico` solo funcionan con `SIGO_ENV=desarrollo`, nunca en el túnel ni en el deploy.
8. **La bitácora es del backend.** Solo el backend escribe en ella, con el usuario sacado del token. Activar un código, abrir el expediente, cada pregunta al asistente y cada lectura de la enfermera quedan registrados sin que el frontend haga nada.
9. **El PIN tiene 6 dígitos y nunca viaja de vuelta.** Solo se muestra una vez, en la respuesta de `POST /pacientes`, y el backend lo guarda cifrado. La paciente lo cambia la primera vez que entra.
10. **Sin señal no se pierde nada.** El frontend guarda la foto y el `client_id` en el celular y reintenta al volver la señal; un `client_id` repetido devuelve la ficha existente.
11. **Lo exportado es seguro.** Las notas se escapan antes de exportar, y el PDF no carga recursos externos.
12. **Datos del demo limpios.** Todo es inventado, ningún paciente real, y sin notas de utilería en las consultas (como la de `con-002`). Si la visión corre en la nube (`VISION_MODE=cloud`), se dice en el pitch.

## Plan hasta las 19:00

El hackathon va de 8:00 a 19:00 y el pitch es de 18:30 a 19:00. Lo que bloquea la unión del front y el back va antes de las 12:00; después, lo que hace que el demo funcione de punta a punta; al final, la seguridad de fondo y los ensayos. Los códigos entre paréntesis son los del reporte de errores.

**Antes de las 12:00: congelar la v1 del contrato**

- [ ] CORS con `SIGO_CORS_ORIGINS`: Vercel y el túnel (C-01) · Luis
- [ ] Leer las variables de entorno y avisar en el LEEME que el almacén es en memoria (C-02) · Backend 1
- [ ] Mocks dentro de `app/` y prueba de arranque en limpio (C-03) · Luis
- [ ] `{dpi}` acepta DPI o `TMP-`, y un niño de ejemplo en los datos (C-06) · Luis
- [ ] Códigos aleatorios de 8 caracteres (S-01) y de un solo uso (S-02) · Backend 2
- [ ] Tokens `dev-` solo con `SIGO_ENV=desarrollo` (S-04) · Luis
- [ ] Revisar las rutas “por confirmar” contra el `openapi.yaml` y congelar la v1 · Luis y front
- [ ] Datos semilla: una enfermera, un médico, doña Rosa con PIN, 3 consultas y alergia a penicilina, y un niño con `TMP-` · Backend 2

**12:00 a 14:00: que el demo funcione de punta a punta**

- [ ] Confirmar guarda paciente, consultas, alergias y vacunas como versión (C-08) · Backend 1
- [ ] `POST /emergencia` (P-01) · Backend 1
- [ ] Bloqueo tras 5 intentos de PIN o de código, PIN de 6 dígitos y `PUT /me/pin` (S-03) · Backend 1
- [ ] Enfermera limitada a su centro y sin ver códigos (S-09) · Backend 1
- [ ] Lectura real de Excel, CSV y Access con mapeo (C-05) · Backend 2
- [ ] Quitar notas de utilería de los datos (P-06) · Backend 2
- [ ] Pantalla `/puesto/importar` y meterla en el ensayo (C-04) · Arturo
- [ ] Pantallas de paciente, médico y emergencia contra los mocks · Arturo
- [ ] Una sola historia en propuesta, pitch y carteles: Rosa de Chichicastenango, Hospital Regional de Quiché (P-02) · Pitch

**14:00 a 16:00: IA y lo que falta del flujo**

- [ ] Visión y asistente conectados, con la latencia medida (C-07) · Backend 1 (visión) y Backend 2 (asistente)
- [ ] Decidir `VISION_MODE` con esa latencia; si es nube, decirlo en el pitch (M-05) · Pitch
- [ ] Exportar en `pdf` y `json`, con las notas escapadas (P-03, S-10) · Backend 2
- [ ] Versiones, bitácora y código por SMS simulado · Backend 1
- [ ] Banner de alergias siempre visible, con texto neutro (P-07) · Arturo y Backend 2
- [ ] Cola de fotos sin señal; si no da tiempo a las 16:00, pasa al pitch como siguiente paso (P-04) · Arturo

**16:00 a 17:30: seguridad de fondo y pulido**

- [ ] RLS: sin `UPDATE` directo, bitácora solo desde el backend y políticas faltantes (S-05 a S-08) · Luis
- [ ] DPI dudoso como advertencia y no como error (M-01, M-02) · Backend 1
- [ ] `TMP-` con fecha y parte aleatoria (M-06) · Backend 1
- [ ] Versiones fijas en `requirements.txt` (M-03) · Luis
- [ ] Pruebas de código único, un solo uso y CORS (M-04) · Backend 2

**17:30 a 18:30: congelar y ensayar**

- [ ] Congelar el código; solo arreglos que rompan el demo
- [ ] Modo demo con el acceso de 2 minutos
- [ ] Video de respaldo del demo completo
- [ ] Al menos 3 ensayos completos, con el pitch cronometrado al tiempo que den los organizadores (P-08)

De mi lado (front) entrego: la app en Vercel, los tipos de la sección de modelos en un `types.ts` compartido y las 4 fichas de prueba fotografiadas para probar la IA.

## Decisiones tomadas

Estas son las decisiones de la v1. Si alguna cambia después, se actualiza aquí y en el contrato.

| Tema | Decisión |
| --- | --- |
| Emergencias (P-01) | El médico abre un acceso de emergencia con DPI y motivo obligatorio. Solo muestra alergias y condiciones crónicas, dura 1 hora y queda en rojo en la bitácora de la paciente (`POST /emergencia`). |
| Paciente sin smartphone | La enfermera puede generar el código desde el puesto, a pedido de la paciente, y el código también se puede mandar por SMS (simulado en el demo). |
| Códigos (S-01, S-02, S-03) | 8 caracteres aleatorios, únicos y de un solo uso. Se activan en 10 minutos y el acceso dura 2 horas (2 minutos en modo demo). Bloqueo de 15 minutos tras 5 códigos fallidos. |
| PIN (S-03) | 6 dígitos. El backend lo genera al crear a la paciente, la enfermera se lo entrega y la paciente lo cambia la primera vez que entra. Bloqueo de 15 minutos tras 5 intentos fallidos. |
| Identificador del paciente (C-06, M-06) | DPI de 13 dígitos, o `TMP-AAAAMMDD-XXXX` generado por el backend para niños sin DPI. |
| Lo que ve la enfermera (S-09) | El expediente completo, para poder corregir, pero solo de pacientes de su centro o que ella creó. Nunca ve los códigos. Su lectura queda en la bitácora. |
| DPI mal escrito o dudoso (M-01, M-02) | No se corrige desde la app. Un dígito verificador o un municipio que no cuadra es una advertencia que la enfermera confirma, no un error. |
| Fichas viejas sin DPI (P-05) | La ficha se liga al paciente que la enfermera ya buscó o creó antes de escanear. |
| Importar (C-04, C-05) | Entra al MVP: es la mitad “sistema viejo” del track. Pantalla `/puesto/importar` con mapeo de columnas. |
| Exportar al sistema oficial (P-03) | Se agrega `formato=json`, simulado en el demo. Sin eso, se quita la frase del pitch. |
| Sin señal (P-04) | La cola de fotos se intenta hasta las 16:00; si no está, el pitch la presenta como siguiente paso. |
| Historia del demo (P-02) | Doña Rosa, de Chichicastenango (Quiché), referida al Hospital Regional de Quiché, como en los datos del backend. Se ajustan propuesta, pitch y carteles. |
| Lectura con IA | `POST /fichas/foto` responde `202` y el frontend pregunta cada 2 segundos. |
| Visión local o en la nube (M-05) | Se decide a las 16:00 con la latencia medida. Si es nube, se dice en el pitch y solo se usan datos inventados. |

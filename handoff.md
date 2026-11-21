# Handoff: frontend de Sigo contra el contrato v3

Última actualización: 21 de noviembre de 2026, por la tarde. Este documento sirve para seguir el trabajo en Cursor (u otro agente) sin repetir lo que ya se hizo.

## 1. Fuente de verdad

- **`docs/contrato-v3.md` manda sobre todo lo demás.** Es la v1 congelada del contrato (21 nov, 12:15).
- `docs/contrato-v2.md` y `docs/contrato-phil-flujo-y-api.txt` quedaron **obsoletos**. No usar sus rutas.
- Las rutas por DPI (`/pacientes/{dpi}`, `/fichas/foto`, `/consentimientos/*`, `/importar/*`) **ya no existen**. Todo va por `id` interno del paciente.
- El `contrato/openapi.yaml` y `contrato/mocks/` que hay hoy en el repo son la **v0 del backend**. También están obsoletos y hay que reemplazarlos (ver la sección 5).

## 2. Dónde está el código

- Repo: `Desktop/Hackathon/Sigo`, frontend en `frontend/`, con Next.js 15, React 19 y Tailwind 4.
- Rama de trabajo: **`frontend-contrato-v2`**, creada desde `origin/frontend`. Nada está commiteado todavía: todo está en el árbol de trabajo. **No hacer commit ni push sin que Phil lo pida.**
- `main` no tiene frontend. El frontend original vive en `origin/frontend`.

## 3. Bloqueo actual: `npm install` no termina

La red del hackathon tiene un **firewall Fortinet que intercepta TLS**. El certificado de `registry.npmjs.org` llega firmado por `O=Fortinet, CN=FG6H0FTB22905955`, y npm falla con `UNABLE_TO_VERIFY_LEAF_SIGNATURE` en unos 20 a 48 paquetes en cada intento. Por eso **todavía no se ha compilado (`tsc`/`next build`) ni se ha visto nada en el navegador**.

Opciones, de la más segura a la menos:

1. Cambiar de red (hotspot del celular) y correr `cd frontend && npm install`.
2. Exportar el certificado de la CA de Fortinet y usar `NODE_EXTRA_CA_CERTS=/ruta/fortinet.pem npm install`.
3. **No** usar `strict-ssl=false` ni `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Después de instalar: `npm run typecheck`, `npm run lint`, `npm run dev` y revisar las 13 pantallas a 360 px y en escritorio.

Tampoco corre el lanzador de la skill impeccable (`skills-diseno-video/diseno/impeccable/scripts/impeccable` da "operation not permitted", probablemente por la cuarentena de macOS en un archivo descargado). Por ahora se usó leyendo `reference/craft-floor.md` y `reference/operate.md` a mano.

## 4. Qué ya está escrito (hecho contra la v2, hay que adaptarlo a la v3)

| Archivo | Qué hace | Estado frente a la v3 |
| --- | --- | --- |
| `frontend/lib/types.ts` | Tipos copiados del contrato | **Rehacer** con los tipos de la v3 |
| `frontend/lib/api/errores.ts` | `ErrorApi`, tabla de códigos, `leerError` | Sirve; falta `formato_no_soportado` |
| `frontend/lib/api/token.ts` | Token Bearer en localStorage | Sirve |
| `frontend/lib/api/cliente.ts` | Las 20 rutas, base `/api/v1`, Bearer, mocks | **Rehacer las rutas** (sección 5) |
| `frontend/lib/api/sesion.tsx` | Login del personal (Supabase o demo) y de la paciente; `<Protegida rol>` con desvío a `/mi/pin` si `debe_cambiar_pin` | Sirve; cambiar `usuario.dpi` por `usuario.paciente_id` |
| `frontend/lib/api/usar.ts` | `useDatos` (cargando, listo, error), `useCuentaRegresiva`, `formatoRestante` | Sirve |
| `frontend/lib/api/mock/servidor.ts` | Servidor simulado con estado en localStorage y las reglas del contrato (roles, 403, códigos de un solo uso, 429, emergencia, bitácora, versiones) | **Rehacer las rutas por id** y sacar las respuestas de `contrato/mocks/*.json` |
| `frontend/lib/api/mock/datos.ts` | Semilla: Ana Tzul, Dr. Mateo Us, Rosa, niño `TMP-20261121-7KQ2`, 4 consultas y bitácora | Cambiar el DPI de Rosa a **2547896330801**, agregar `id` (`p_12`) |
| `frontend/lib/api/mock/archivos.ts` | Exportar pdf, docx, xlsx, txt, md, html y json con escape (regla 11) | Sirve |
| `frontend/lib/pendientes.ts` | Cola sin señal en IndexedDB (fotos y `client_id`) | Cambiar `api.subirFoto` a la ruta por id |
| `frontend/components/estado.tsx` | Cargando, error, sin señal, sin acceso, no encontrado; redirige con `sin_sesion` y `acceso_vencido` | Sirve |
| `frontend/components/expediente/alertas.tsx` | `BannerAlergias` neutro ("Alergia: penicilina") y `PanelAlertas` | Sirve |
| `frontend/components/expediente/consultas.tsx` | Línea de tiempo, ver original, versiones, corregir | Sirve |
| `frontend/components/expediente/codigo.tsx` | Generar código, QR, cuenta regresiva y SMS | Cambiar a `CodigoTemporal` y `/codigos` |
| `frontend/components/expediente/escaner-qr.tsx` | Lee el QR con `BarcodeDetector` | Sirve |
| `frontend/components/expediente/cabecera.tsx` | Cabecera del paciente | Sirve |
| `frontend/components/shell.tsx` | Encabezado, navegación por rol y salir | Restilizar (sección 6) |
| `frontend/app/**` | 12 de las 13 pantallas | Mover `[dpi]` a `[id]` y ajustarlas a la v3 |

Ya se borró (estaba en `origin/frontend` y la v3 no lo usa): `/tablero`, `app/api/leer-ficha` (llamaba a Claude desde Next; la visión es del backend), `/puesto/digitalizar`, `/hospital/expediente/[id]`, `datos/demo.ts`, `lib/ia.ts`, `lib/sesion.ts` y `lib/supabase/server.ts`.

No se tocaron, como se acordó: `lib/union.ts`, `lib/limpieza.ts`, `lib/mapeo.ts`, `lib/tipos.ts` (tipos viejos que usa `union.ts`), `tests/` y `supabase/migrations/`.

## 5. Qué cambia con la v3

**Tipos** (copiar tal cual de "Modelos de datos" a `frontend/lib/types.ts`, sin renombrar):

- `Usuario.dpi` pasa a ser `Usuario.paciente_id`.
- `Paciente` gana `id`.
- `Ficha.dpi` pasa a ser `Ficha.paciente_id`, y se agrega `importacion_id`.
- `Extraccion` gana `error?`.
- `Consentimiento` pasa a llamarse `CodigoTemporal`.
- `Importacion` se reemplaza por `ResultadoImportacion` (resultado fila por fila).

**Rutas** (las 20 de la v3):

| # | Ruta | Antes (v2) |
| --- | --- | --- |
| 4 | `GET /pacientes/buscar?dpi=` → `{ pacientes: [] }`, **nunca 404** | `GET /pacientes/{dpi}` con 404 |
| 6 | `POST /pacientes/{id}/fichas` (multipart, sin `dpi`) | `POST /fichas/foto` |
| 8 | `GET /fichas?estado=lista&importacion_id=` **(nueva)** | no existía |
| 9 | Confirmar lleva el **paciente completo menos el DPI** | solo alergias y condiciones |
| 14 | Exportar es **solo de la paciente** | también la enfermera |
| 15 | `POST /pacientes/{id}/codigos` → `CodigoTemporal` | `/consentimientos` |
| 16 | `POST /codigos/canjear` → `{ paciente_id, acceso_vence_en }` | `/consentimientos/activar` → `dpi` |
| 19 | `POST /emergencia` → `paciente_id` | → `dpi` |
| 20 | `POST /importaciones` **en un solo paso**, sin pantalla de mapeo | `POST /importar` + `/confirmar` |
| — | `POST /auth/paciente` → `paciente_id` | → `dpi` |
| — | Error nuevo: `400 formato_no_soportado` | — |

**Pantallas:** las carpetas pasan de `[dpi]` a `[id]`. `/puesto` busca y recibe una lista vacía en vez de un 404. `/puesto/importar` sube el archivo, muestra el resultado fila por fila (creado, actualizado o error) y lista las fichas con la ruta 8.

**Falta por completo:**

- `frontend/app/hospital/pacientes/[id]/page.tsx`. Debe tener:
  - expediente del médico con cuenta regresiva hasta `acceso_vence_en` (al llegar a 0 regresa a `/hospital?vencido=1`);
  - en emergencia, banda roja arriba y solo `PanelAlertas`;
  - con código, línea de tiempo, versiones y asistente (`POST /preguntar`, con las fuentes enlazadas a `original_url`).
- `contrato/openapi.yaml` (OpenAPI 3.1) con los 20 endpoints, y `contrato/mocks/` con un JSON por respuesta, a partir de los ejemplos del doc. Reemplazan a los de la v0.
- Las fotos de demo que referencian los mocks no existen: `public/demo/ficha-rosa-2025.jpg`, `ficha-rosa-2026.jpg`, `ficha-rosa-2019.jpg` y `ficha-diego-2026.jpg`. Las actuales (`ficha-rosa-2012/2014/2024.jpg`) son de la historia vieja (Chuicacá, Totonicapán, otro DPI). Se pueden regenerar con `scripts/generar-fichas.ts` (usa `sharp`), cambiando los datos por los de la v3.

## 6. Estilo: como la app Simple (simple.org), con la marca de Sigo

- **Tono:** utilitario y calmado. Sin gradientes, sombras fuertes ni ilustraciones.
- **Acción principal:** una por pantalla, en un botón de ancho completo, fijo abajo, de 56 px de alto, azul marino con texto blanco.
- **Superficies:** fondo crema; tarjetas blancas con borde de 1 px color arena y radio de 12 px.
- **Texto:** base de 17 a 18 px; títulos de 22 a 28 px; números importantes (DPI, código temporal, PIN) grandes y en cifras tabulares.
- **Controles:** inputs de 52 px o más; DPI y PIN con `inputmode="numeric"`; objetivos táctiles de 48 px o más; foco visible y contraste AA.
- **Color con significado:** rojo es alergia o emergencia, amarillo es dato dudoso, verde es guardado y azul marino es acción.
- **Blobs** (`Manchas`, `PanelMarca`): solo en `/login` y `/mi/entrar`.
- **Pantallas:** mobile first a 360 px; las del médico y la de importar también tienen que verse bien en escritorio.
- **Listas de pacientes:** filas grandes con nombre, DPI parcial y edad a la izquierda, y el estado a la derecha.
- **Textos:** español claro, con verbos ("Escanear ficha", "Confirmar y guardar", "Compartir mi historial").
- **Tipografía:** Poppins 600 solo en títulos y en "SIGO"; el resto con `system-ui`. Hay que quitar DM Sans, League Spartan, IBM Plex Mono y Caveat de `app/layout.tsx`.
- **Íconos:** de línea, con `lucide-react`.

```css
--sigo-navy: #233458;         /* botones, títulos, texto fuerte */
--sigo-navy-pressed: #1A2744;
--sigo-ink-2: #5B6478;        /* texto secundario */
--sigo-cream: #EEEAE5;        /* fondo */
--sigo-sand: #E4DCD6;         /* bordes y fondos secundarios */
--sigo-surface: #FFFFFF;      /* tarjetas */
--sigo-copper: #D4996B;       /* SOLO decorativo: nunca texto ni botones */
--sigo-alerta: #B42318;       /* sobre #FDECEA */
--sigo-dudoso: #8A5A00;       /* sobre #FFF3C4, borde #E0B000 */
--sigo-ok: #1E7A46;           /* sobre #E7F4EC */
```

Lo que hay que quitar de `app/globals.css` y de los componentes: `papel-kraft`, `esquina-doblada`, el grano SVG, `tabla-vieja` con rayas, `sombra-calida*`, el degradado de `Esqueleto` y de la línea de tiempo, el brillo del barrido de escaneo, el texto `text-kraft-tinta` y la clase `.ceja` (etiqueta en mayúsculas sobre los títulos, prohibida por impeccable).

## 7. Reglas que no hay que romper

- No renombrar campos del contrato.
- La bitácora la escribe solo el backend; el frontend no manda nada extra.
- Nada se borra: no hay botones de borrar, y corregir siempre crea una versión.
- La paciente no ve botones de escribir; exportar es solo de ella.
- La enfermera nunca ve una lista de códigos, solo el que acaba de generar.
- El PIN solo se muestra una vez, en la respuesta de `POST /pacientes`.
- Mientras no haya backend, los mocks se activan con `NEXT_PUBLIC_SIGO_MOCKS=1`, o solos si falta `NEXT_PUBLIC_API_URL`. `NEXT_PUBLIC_SIGO_MODO_DEMO=0` apaga el acceso de 2 minutos.
- Cuentas de demo: enfermera `ana.tzul@sigo.demo`, médico `mateo.us@sigo.demo` (con cualquier contraseña en modo mock). Paciente: DPI `2547896330801`, PIN `482193`.

## 8. Dudas abiertas del contrato v3 (para Phil)

1. **¿La enfermera puede exportar?** Dice "solo la paciente" en la ruta 14 y en "Decisiones", pero "La enfermera solo puede leer, corregir y exportar…" en la sección Enfermera.
2. **¿La emergencia muestra los medicamentos?** El texto dice que solo muestra alergias y condiciones crónicas, pero `alertas` también trae `medicamentos`. Hoy se muestran las tres.
3. **Horario:** el plan dice "12:15 a 12:45" y luego "12:00 a 14:00".

## 9. Orden sugerido para terminar

1. Resolver `npm install` (sección 3).
2. Reemplazar `lib/types.ts` con la v3.
3. Escribir `contrato/openapi.yaml` y `contrato/mocks/*.json`.
4. Rehacer `cliente.ts` y el mock con las rutas por id.
5. Mover `[dpi]` a `[id]` y ajustar las pantallas.
6. Escribir `/hospital/pacientes/[id]`.
7. Aplicar el estilo de la sección 6 (tokens en `globals.css` y `layout.tsx` primero, luego cada pantalla).
8. Correr `typecheck`, `lint` y `dev`, y revisar cada pantalla a 360 px: contraste, 48 px táctiles y los estados cargando, vacío, error y sin señal.

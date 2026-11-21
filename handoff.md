# Handoff: frontend de Sigo contra el contrato v3

Última actualización: 21 de noviembre de 2026, por la tarde. Sirve para seguir en Cursor (u otro agente) sin repetir trabajo.

## 1. Fuente de verdad

- **`docs/contrato-v3.md` manda sobre todo.** Es la v1 congelada. Ya tiene dos correcciones: exportar es solo de la paciente, y la emergencia muestra solo alergias y condiciones crónicas (`alertas.medicamentos` llega vacío).
- `docs/contrato-v2.md` y `docs/contrato-phil-flujo-y-api.txt` están obsoletos.
- **El contrato publicado:** `contrato/openapi.yaml` (OpenAPI 3.1, las 20 rutas por id) y `contrato/mocks/*.json` (un JSON por respuesta; ver `contrato/mocks/README.md`). Reemplazan a los de la v0.

## 2. Ramas y commits

- Rama de trabajo: **`frontend-contrato-v3`**, que sale de `frontend-contrato-v2` (el WIP de la v2), que a su vez sale de `origin/frontend`. **Nada se ha subido (push).**
- Commits en `frontend-contrato-v3`, uno por punto:
  1. Contrato v3: tipos, OpenAPI 3.1, mocks y cliente del API.
  2. Rutas por id: `[dpi]` pasa a `[id]`.
  3. Puesto v3: búsqueda por lista, revisión con el paciente completo, importación en un paso.
  4. Médico: `/hospital/pacientes/[id]`.
  5. Estilo en la línea de Simple.
  6. Fichas de demo de la v3.

## 3. Cómo correrlo

```bash
cd frontend
npm install        # si la red tiene el Fortinet que intercepta TLS, usar el hotspot; NO apagar strict-ssl
npm run dev        # http://localhost:3000
npx tsc --noEmit   # tipos
npx eslint app components lib
NEXT_DIST_DIR=.next-build npx next build
npm run fichas:generar   # regenera public/demo/*.jpg (sharp + fuente Bradley Hand de macOS)
```

- **Mocks:** se activan solos si no hay `NEXT_PUBLIC_API_URL`, o con `NEXT_PUBLIC_SIGO_MOCKS=1`. El estado vive en `localStorage` (`sigo:mock:v3`); para volver a la semilla, borra esa clave.
- **Modo demo:** el acceso por código dura 2 minutos. `NEXT_PUBLIC_SIGO_MODO_DEMO=0` lo deja en las 2 horas reales.
- **Cuentas de demo:**
  - Enfermera: `ana.tzul@sigo.demo`.
  - Médico: `mateo.us@sigo.demo`, con cualquier contraseña.
  - Paciente: DPI `2547896330801`, PIN `482193`. La primera vez pide cambiar el PIN.
- **Backend real:** `NEXT_PUBLIC_API_URL=https://…` (sin `/api/v1`), además de `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` para el login del personal.

## 4. Mapa del código (`frontend/`)

| Archivo | Qué hace |
| --- | --- |
| `lib/types.ts` | Tipos copiados tal cual de "Modelos de datos" de la v3. No renombrar campos |
| `lib/api/cliente.ts` | Las 20 rutas (`api.*`), base `/api/v1` y Bearer |
| `lib/api/errores.ts` | `ErrorApi` y la tabla de errores (incluye `formato_no_soportado` y `sin_senal`, que es solo del front) |
| `lib/api/token.ts` | Token en `localStorage` |
| `lib/api/sesion.tsx` | Login (Supabase o demo), `<Protegida rol>` y desvío a `/mi/pin` si `debe_cambiar_pin` |
| `lib/api/usar.ts` | `useDatos`, `useCuentaRegresiva` y `formatoRestante` |
| `lib/api/mock/servidor.ts` | Servidor simulado con las reglas del contrato |
| `lib/api/mock/datos.ts` | Semilla, importada de `contrato/mocks/*.json` (alias `@contrato/*`, `externalDir`) |
| `lib/api/mock/archivos.ts` | Exportar pdf, docx, xlsx, txt, md, html y json, con escape |
| `lib/pendientes.ts` | Cola sin señal en IndexedDB (fotos, `paciente_id` y `client_id`) |
| `components/ui/button.tsx` | `Boton` y `BarraAccion` (acción principal fija abajo, 56 px) |
| `components/estado.tsx` | Estados cargando, error, sin señal, sin acceso y no encontrado; redirige con `sin_sesion` y `acceso_vencido` |
| `components/expediente/*` | Banner de alergias, panel de alertas, línea de tiempo con versiones y corrección, código con QR, lector de QR y cabecera |
| `app/globals.css` | Tokens `--sigo-*` y las clases `titulo`, `subtitulo`, `tarjeta`, `cifra` y `etiqueta-*`/`aviso-*` |

**Pantallas (las 13 de la v3):**
- Personal: `/login`.
- Enfermera: `/puesto`, `/puesto/pacientes/[id]`, `/puesto/pacientes/[id]/captura`, `/puesto/fichas/[id]` y `/puesto/importar`.
- Paciente: `/mi/entrar`, `/mi/pin`, `/mi`, `/mi/compartir` y `/mi/accesos`.
- Médico: `/hospital` y `/hospital/pacientes/[id]`.

## 5. Decisiones que no están en el contrato

- **DPI en la revisión de ficha:** la `Ficha` no trae el DPI del paciente, pero hace falta para marcarlo en rojo si no coincide. Llega por la URL (`?dpi=`) desde la captura o desde importar; si falta, se lee con `GET /pacientes/{id}/expediente`. **Propuesta para el backend:** agregar el DPI del paciente a la `Ficha`, o hacer él la comparación.
- **`/puesto` lista "Fichas por revisar"** con la ruta 8 sin `importacion_id`. Sin eso, las fotos que sube la cola sin señal no tienen por dónde abrirse.
- **La captura recibe nombre y DPI por la URL**, para no leer el expediente solo para mostrarlos y para que funcione sin señal.
- **Importar en el mock:** el mapeo de columnas lo decide `lib/mapeo.ts` (automático, porque la v3 no tiene pantalla de mapeo). Access (.accdb, .mdb) responde 422 en el mock porque el navegador no puede leerlo; el backend sí.
- **Código inexistente al canjear:** el mock responde `404 no_existe` y lo cuenta como intento fallido. El contrato no define ese caso.

## 6. Verificado

- `tsc`, `eslint` y `next build` pasan, con las 13 pantallas.
- Hay una prueba de punta a punta contra el servidor simulado, con 43 de 43 casos bien: buscar y crear (con `dpi_dudoso` y `TMP-`), subir, esperar y confirmar una ficha, 409, versiones, código de un solo uso, acceso de 2 minutos, emergencia sin consultas ni medicamentos, `solo_emergencia`, PIN y 429, bitácora, los 7 formatos de exportar e importar el CSV de ejemplo. El script está en el scratchpad de la sesión; se puede rehacer con `npx tsx` importando `lib/api/cliente.ts`.
- Contraste AA en todas las combinaciones de texto (mínimo 4.72:1, el verde sobre su fondo). El cobre (2.05:1) solo se usa como adorno.
- Capturas a 360 px de `/puesto`, `/puesto/pacientes/p_12` y `/mi/entrar`, y a 1280 px de `/hospital`.

## 7. Pendiente

- **Revisión visual a 360 px y en computadora** de `/puesto/fichas/[id]` en estado "lista", `/puesto/importar` con resultado, `/mi`, `/mi/compartir` con código y `/hospital/pacientes/[id]` (con código y en emergencia). Necesitan una sesión con datos, así que hay que recorrerlas a mano o con Playwright.
- **`frontend/GUION_DEMO.md` y `frontend/README.md`** siguen con la historia vieja (Chuicacá, Totonicapán, otros nombres y DPI). Hay que reescribirlos con la v3.
- **Fichas de prueba:** `public/demo/` tiene las 4 nuevas (Rosa 2019, 2025 prenatal y 2026, y el carné de Diego), con datos borrosos a propósito. Las viejas se borraron.
- **Archivos viejos que se conservan pero ya no usa la interfaz:** `lib/tipos.ts`, `lib/union.ts`, `lib/limpieza.ts`, `tests/` y `supabase/migrations/`. `lib/mapeo.ts` y `lib/limpieza.ts` los usa el mock de importar.
- **`next@15.5.4`** tiene un aviso de seguridad (CVE-2025-66478). Conviene actualizar cuando haya tiempo.
- **Al conectar el backend real:** revisar CORS (`SIGO_CORS_ORIGINS`) y que las rutas coincidan con `contrato/openapi.yaml`.

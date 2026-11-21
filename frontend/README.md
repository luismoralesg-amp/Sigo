# SIGO · Tu historia te sigue

> “El país está digitalizando el futuro, pero nadie está rescatando el pasado.”

SIGO rescata el historial médico atrapado en fichas de papel y en sistemas antiguos de los puestos de salud de Guatemala y lo une en un expediente digital ligado al DPI/CUI, que cualquier centro autorizado puede consultar.

Hay dos fuentes y un solo expediente:

- **Ficha en papel:** la enfermera toma una foto con el celular, la IA lee la letra (incluso escrita a mano) y una persona revisa y confirma.
- **Sistema antiguo:** el Excel, Access o CSV se sube tal como está y se mapea al mismo expediente, sin tocar ni apagar el sistema original.

La IA solo transcribe: nunca guarda sola. La foto o el archivo original queda junto a cada dato.

Proyecto para el Track 03 “Legacy”: conectar un sistema antiguo con tecnología actual **sin reemplazarlo**.

## Contra el backend real

`NEXT_PUBLIC_API_URL` es el host, **sin** `/api/v1`. El cliente (`lib/api/cliente.ts`) arma `${NEXT_PUBLIC_API_URL}/api/v1`.

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
# Túnel: NEXT_PUBLIC_API_URL=https://<host>.trycloudflare.com
```

Con esa variable puesta y sin `NEXT_PUBLIC_SIGO_MOCKS=1`, la app habla con el backend. Si la variable está vacía, o `NEXT_PUBLIC_SIGO_MOCKS=1`, usa los mocks.

Doña Rosa (inventada): DPI `2547896330801`, PIN de 6 dígitos `482193`. El PIN de 4 dígitos no entra.

---

## Estado actual

| Parte | Estado |
|---|---|
| Interfaz completa (login, puesto, hospital, tablero) | ✅ Funciona de punta a punta con **datos de demo locales** |
| Limpieza de datos, mapeo de columnas y unión por DPI (`lib/`) | ✅ Escrito y con pruebas (`npm test`) |
| Endpoint de IA `POST /api/leer-ficha` (Claude con visión) | ✅ Escrito; todavía no lo usa la interfaz |
| Migraciones SQL con RLS (`supabase/migrations/`) | ✅ Escritas; falta aplicarlas a un proyecto de Supabase |
| Seed en Supabase, login real y guardado en la base | ⏳ Pendiente |

En la versión de interfaz:

- **Leer ficha** devuelve siempre la lectura ya procesada de la ficha de Rosa (`datos/lectura-respaldo.ts`), con cualquier foto.
- **Importar** lee, limpia y cuenta el archivo real en el navegador, pero no guarda nada.
- **El expediente** muestra los datos de `datos/demo.ts`.

---

## Cómo correrlo local

Requisitos: Node.js 20 o más reciente.

```bash
npm install
```

```bash
npm run dev
```

Abre http://localhost:3000. Entra eligiendo un centro; la contraseña no se valida en la versión de interfaz.

| Centro | Rol | Qué ve |
|---|---|---|
| Puesto de Salud Aldea Chuicacá (Totonicapán) | `puesto` | Digitalizar ficha · Importar sistema antiguo |
| Hospital Regional de Quetzaltenango | `hospital` | Buscar expediente · Tablero |

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compila para producción (Vercel) |
| `npm test` | Pruebas de limpieza, mapeo y unión por DPI (duplicados y coincidencias) |
| `npm run typecheck` | Revisión de tipos de TypeScript |
| `npm run fichas:generar` | Regenera las fotos simuladas de fichas en `public/demo/` |
| `npm run csv:generar` | Regenera `public/ejemplos/registro_puesto_2015_2022.csv` |

---

## Variables de entorno

Copia `.env.example` a `.env.local` y completa los valores. `.env.local` nunca se sube al repositorio. La versión de interfaz **no necesita ninguna** para funcionar.

| Variable | Para qué sirve | Dónde se usa |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase | Cliente y servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública (las reglas RLS protegen los datos) | Cliente y servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de administración, solo para el seed | Solo scripts |
| `SUPABASE_DB_URL` | Conexión a Postgres (Session pooler) para aplicar migraciones | Solo scripts |
| `ANTHROPIC_API_KEY` | Lectura de fichas con Claude (`claude-sonnet-5-5`) | Solo servidor (`app/api/leer-ficha`) |
| `IA_ESFUERZO` | Opcional: `low` (por defecto), `medium` o `high` | Solo servidor |
| `DEMO_PASSWORD` | Contraseña de los 2 usuarios de prueba del seed | Solo scripts |

La clave de Anthropic solo se lee en el servidor: el navegador nunca la ve.

---

## Base de datos y seed

Las migraciones están en `supabase/migrations/`:

1. `20261121000001_esquema.sql`: tablas `centro`, `paciente` (DPI/CUI único), `consulta` (con `origen` foto/sistema_antiguo/digital, el original y la fila tal como venía), `usuario_perfil` y `acceso` (bitácora).
2. `20261121000002_rls.sql`: seguridad por filas. `puesto` lee y escribe solo a nombre de su propio centro. `hospital` solo lee y deja registro en la bitácora. También crea el bucket privado `originales`.

Para aplicarlas: Supabase → SQL Editor → pega cada archivo en orden.

**Seed (pendiente de conectar).** Los datos que irán al seed ya existen en `datos/demo.ts`: 2 centros, 2 usuarios (`puesto@sigo.test`, `hospital@sigo.test`) y 4 pacientes inventados:

| Paciente | DPI/CUI | Historia |
|---|---|---|
| Rosa Elena Tzul Batz | 2456 78901 0801 | Alérgica a la penicilina e hipertensa; de 2012 a 2026 en papel, sistema antiguo y digital |
| Juana Catarina Tzoc Pu | 3012 45678 0801 | Embarazada, con controles prenatales en 2026 |
| Mateo Batz Tzul | 2987 65432 0801 | Niño de 2 años con su esquema de vacunas |
| Francisco Ajpacajá Chox | 1876 54321 0901 | Diabetes tipo 2 e hipertensión, con sus medicamentos |

Todos los pacientes son inventados. Ninguno es real.

---

## Cómo está hecho

- **Next.js 15 (App Router) + TypeScript + Tailwind 4**, con componentes propios inspirados en shadcn/ui, lucide-react y framer-motion.
- **Supabase** para Postgres, Storage y Auth.
- **Claude con visión** (`claude-sonnet-5-5`), llamado solo desde el servidor. Devuelve JSON con `{valor, confianza}` por campo; se valida con zod y se reintenta una vez si el formato viene mal. Tiene respaldo automático del servidor si el modelo se niega a responder.
- **Unión por DPI** (`lib/union.ts`): la misma lógica sirve para la foto y para la importación. Si el DPI existe, agrega la consulta y fusiona alergias y condiciones sin duplicar (“PNC” = “Penicilina”). Sin DPI, sugiere coincidencias por nombre y fecha de nacimiento. Una consulta importada dos veces no se duplica.
- **Limpieza** (`lib/limpieza.ts`): fechas dd/mm/aa, mm/dd de Excel en inglés y números de serie de Excel; MAYÚSCULAS; celdas “N/A”, “-” o vacías; DPI con espacios o guiones.

```
app/
  login/                 selección de centro
  puesto/                inicio · digitalizar · importar
  hospital/              búsqueda por DPI · expediente/[id]
  tablero/               fichas rescatadas por municipio
  api/leer-ficha/        IA (solo servidor)
components/              ui · marca · ficha · importar · expediente · tablero
lib/                     limpieza · mapeo · union · ia · pendientes · supabase
datos/                   datos de demo y lectura de respaldo
supabase/migrations/     esquema y RLS
public/demo/             fotos simuladas de fichas
public/ejemplos/         registro_puesto_2015_2022.csv
```

### Diseño

Marca SIGO: marino `#283659`, crema `#EEEAE5` y cobre `#CC9C70`. Títulos en League Spartan, interfaz en DM Sans y logotipo en Poppins. Lo que viene del pasado (papel y sistemas antiguos) lleva tonos cobre con textura de papel y esquina doblada; lo digital y confirmado es limpio. Pensado primero para celular: texto base de 17 px, áreas táctiles de 44 px como mínimo, foco visible y contraste AA.

---

## Para el pitch: qué conservamos / qué incorporamos

| Conservamos | Incorporamos |
|---|---|
| **La ficha en papel.** No se destruye ni se reemplaza; su foto queda junto a cada dato como evidencia. | **Lectura con IA** de letra a mano, con nivel de confianza por campo. |
| **El sistema antiguo del puesto** (Excel, Access, CSV). Sigue funcionando igual; solo leemos una copia. | **Mapeo y limpieza automáticos**: fechas, MAYÚSCULAS y celdas vacías, sin arreglar el archivo antes. |
| **El criterio de la enfermera.** Nada se guarda sin que una persona revise y confirme. | **Un solo expediente por DPI/CUI**, que une papel, sistema antiguo y registros nuevos sin duplicar. |
| **El flujo de trabajo del puesto**: el mismo celular y la misma ficha. | **Alerta clínica inmediata** en el hospital: alergias, condiciones crónicas y medicamentos actuales. |
| **El control de quién ve qué**, con roles por centro. | **Bitácora de acceso**: cada vez que alguien abre un expediente queda registrado. |
| **La realidad sin señal.** | **Modo sin señal**: la ficha se guarda en el celular y se sube sola al volver la señal. |
| **Al niño sin DPI.** | **Carné con QR** que abre su expediente en cualquier centro. |

En una frase: **conservamos el papel; le agregamos memoria.**

El guion paso a paso del demo está en [GUION_DEMO.md](GUION_DEMO.md).

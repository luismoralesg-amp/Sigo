# Variables de entorno de los módulos de Arturo

| Variable | Módulo | Por defecto | Qué hace |
|---|---|---|---|
| `SIGO_VISION_IMPL` / `SIGO_IMPORTAR_IMPL` / `SIGO_CAG_IMPL` / `SIGO_EXPORT_IMPL` | backend de Luis | `mock` | `real` activa el módulo de este paquete |
| `VISION_MODE` | visión | `local` | `local` (Ollama) o `cloud` (las fotos SALEN de la máquina: decirlo en el pitch, M-05) |
| `OLLAMA_HOST` | visión, CAG | `http://127.0.0.1:11434` | Dirección de Ollama (la PC con GPU de Luis) |
| `OLLAMA_VISION_MODEL` | visión | `qwen2.5vl:7b` | Modelo de visión en Ollama |
| `SIGO_VISION_API_KEY` (o `ANTHROPIC_API_KEY`) | visión cloud | — | Llave de la API; solo por entorno, nunca en el repo |
| `SIGO_VISION_CLOUD_MODEL` / `SIGO_VISION_CLOUD_URL` | visión cloud | `claude-sonnet-5-5` / API de Anthropic | Modelo y URL |
| `VISION_TIMEOUT_S` | visión | `50` | El front espera hasta 60 s |
| `OLLAMA_MODEL` | CAG | `qwen2.5:7b` | Modelo del asistente |
| `OLLAMA_KEEP_ALIVE` | CAG, visión | `30m` | Mantiene modelo y caché KV en memoria |
| `OLLAMA_NUM_CTX` | CAG | `8192` | Ventana de contexto (debe ser constante para reusar la caché) |
| `CAG_TIMEOUT_S` | CAG | `60` | La 1.ª pregunta (modelo frío) puede tardar |
| `CAG_MAX_CONTEXTO` | CAG | `24000` | Caracteres de contexto; recorta las consultas más antiguas |

Medir latencia (C-07): `from sigo_modulos import cag; cag.latencias()` devuelve, por pregunta, `n` (1 = primera),
`ms` totales, `carga_ms`, `prompt_tokens`, `prompt_ms`, `gen_ms`. También sale en el log `sigo.cag` (sin texto clínico).

Importar Access: necesita `mdbtools` (`apt install mdbtools`) o, en Windows, `pyodbc` con el controlador de Access.
Exportar DOCX: necesita `pandoc`. Exportar PDF: `weasyprint`.

## Sesión del personal en desarrollo

El login del personal en el front es de Supabase (no se cambia aquí). Sin Supabase, y solo con `SIGO_ENV=desarrollo` y `SIGO_DEV_LOGIN=true`, el front puede pedir un token así. En producción, en demo, o si `SIGO_DEV_LOGIN` no está, la ruta responde 404.

Enfermera (Ana Tzul, `ana.tzul@sigo.demo`):

```http
POST /api/v1/dev/sesion
Content-Type: application/json

{"rol": "enfermera"}
```

Médico (Dr. Mateo Us, `mateo.us@sigo.demo`; `mario.xicara@sigo.demo` es alias del mismo):

```http
POST /api/v1/dev/sesion
Content-Type: application/json

{"rol": "medico"}
```

Responde `200` con `{ "token", "vence_en", "usuario" }`. El `usuario` del médico se llama `Dr. Mateo Us`. A partir de ahí el front manda `Authorization: Bearer <token>`, igual que con el token de Supabase. El host es `NEXT_PUBLIC_API_URL` sin `/api/v1` (por ejemplo `http://localhost:8000`).

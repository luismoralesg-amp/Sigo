# CAG local — SIGO

Asistente de solo lectura para `POST /pacientes/{id}/preguntar`.
La función que carga el backend es `sigo_modulos.cag.preguntar`
(`SIGO_CAG_IMPL=real`). Este paquete no importa el backend.

Al preguntar se carga el expediente que llega en el contexto y se reúsa
la caché KV de Ollama: el mensaje de sistema es un prefijo idéntico por
paciente y modo, con `keep_alive` largo. Cada respuesta cita la fuente.
Si la cita no existe en el expediente, se descarta. El CAG nunca
escribe ni corrige el expediente.

El acceso de emergencia no es un modo de este módulo. El backend
responde 403 `solo_emergencia` antes de llamar a `preguntar`.

Las firmas están en `backend/app/modulos/interfaces.py` (no hay un
`INTERFACES.md`). Coinciden con este módulo.

Solo datos inventados (Rosa Ajpop, Juan Tecún).

## Firma

```python
from sigo_modulos.cag import OllamaNoDisponible, preguntar

# preguntar(expediente: dict, pregunta: str) -> {"respuesta": str, "fuentes": list[Fuente]}
resultado = preguntar(expediente, "¿A qué es alérgica Rosa?")
```

`Fuente = {consulta_id, version, original_url, campo}`.

Si no hay fuente, la respuesta es exactamente `Eso no está en el expediente.`
y `fuentes` es `[]`. Nunca inventa.

Si Ollama no responde se lanza `OllamaNoDisponible` con
`exc.codigo == "ia_no_disponible"` (el backend lo mapea a HTTP 503).

`precalentar(expediente)` calienta la caché KV. No forma parte de la
firma mínima.

## Cómo se reúsa la caché KV

1. Un prefijo idéntico por `(paciente, modo)`: instrucciones + expediente
   serializado, con ids y versiones.
2. Cada pregunta va a `POST /api/chat` con ese mismo mensaje `system` y
   un solo turno `user`. No se acumula historial, para no cambiar el prefijo.
3. `keep_alive` por defecto es `24h`.
4. `precalentar()` hace el warm-up. También guarda el `context` de
   `POST /api/generate` por si se usa `generar_con_context`.

## Cómo correr los tests

Ollama va mockeado (httpx o un cliente falso). No hace falta el servicio
ni bajar un modelo.

```bash
cd modulos-arturo
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest cag/tests
```

Cubre: fuentes válidas se conservan; una cita inventada se descarta; una
pregunta fuera del expediente lo dice; la alergia cita la ficha confirmada
por última vez y un dato importado cita la fila; el expediente no se muta;
si Ollama no responde, `codigo == "ia_no_disponible"`; el prefijo de
sistema de dos preguntas seguidas es idéntico.

## Cómo medir latencia

Esto sí necesita Ollama en la máquina (la medición del pitch es la de la
PC con GPU, no esta VM). No se versionan modelos ni binarios.

```bash
# Ollama ya instalado y en marcha: http://127.0.0.1:11434
# ollama pull qwen2.5:7b
cd modulos-arturo
source .venv/bin/activate
export OLLAMA_URL=http://127.0.0.1:11434   # o OLLAMA_HOST, es lo mismo
export OLLAMA_MODEL=qwen2.5:7b             # alterno: llama3.1:8b
python -m cag.medir_latencia --salida latencia-cag.json
python -m cag.medir_latencia --con-warmup-explicito --salida latencia-cag-warmup.json
```

Imprime tiempo al primer token (TTFT) y tiempo total, en frío (primera
pregunta, llena la caché del prefijo) y en caliente (las siguientes, mismo
expediente). La hora es la de Guatemala (UTC-6).

Variables que lee el módulo (no las lee a través del backend):

```bash
export OLLAMA_URL=http://127.0.0.1:11434
export OLLAMA_MODEL=qwen2.5:7b
```

## Citas de alergias y condiciones crónicas

`campo` es `paciente.alergias` o `paciente.condiciones_cronicas`.

- Si el ítem apunta a una ficha (`consulta_id`, `ficha_id`, o `fuente`
  igual al id de una consulta), la cita usa el id de esa ficha, su
  `version` y su `original_url`. Si hay varias, queda la de `editada_en`
  o `fecha` más reciente.
- Si no hay ficha y el dato es importado (`fuente` o `origen` en
  `importacion` / `importado`, o trae `fila` / `fila_id`), `consulta_id`
  es el id de esa fila y `original_url` es null. `fila` es el entero de
  `FilaImportada`; `fila_id` es un id de texto.

El `Expediente` de Phil guarda esos campos como `string[]` y no trae la
ficha de origen. En ese caso la cita usa la consulta más reciente del
expediente (el único registro con id, versión y foto). Es una
aproximación, no la ficha que registró el dato.

## Dependencias

`httpx` (cliente de Ollama), declarada en `pyproject.toml` y
`requirements.txt`. El modelo no se instala con pip.

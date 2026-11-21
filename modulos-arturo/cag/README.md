# CAG local — SIGO

Asistente de solo lectura para `POST /pacientes/{id}/preguntar`.
La función que carga el backend es `sigo_modulos.cag.preguntar`
(`SIGO_CAG_IMPL=real`). Este paquete no importa el backend.

Al preguntar se carga el expediente completo en el contexto (en
emergencia, solo alergias y condiciones crónicas) y se reúsa la caché
KV de Ollama: el mensaje de sistema es un prefijo idéntico por
paciente y modo, con `keep_alive` largo. Cada respuesta cita la fuente.
Si la cita no existe en el expediente, se descarta. El CAG nunca
escribe ni corrige el expediente.

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
pregunta fuera del expediente lo dice; en emergencia el contexto no trae
consultas y una pregunta ajena responde que no está disponible; el
expediente no se muta; si Ollama no responde, `codigo == "ia_no_disponible"`;
el prefijo de sistema de dos preguntas seguidas es idéntico.

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

## Decisiones abiertas (las revisa Alphagod)

1. **Emergencia.** Si el expediente trae `tipo_acceso="emergencia"`,
   `emergencia=True` o `acceso.tipo="emergencia"`, este módulo contesta
   recortado a alergias y condiciones crónicas. Cualquier otra pregunta
   responde exactamente `no está disponible en acceso de emergencia` y
   `fuentes: []`. El contrato de Phil dice otra cosa: el asistente en
   emergencia debe responder **403** `solo_emergencia`. El 403, si se
   confirma, lo corta el endpoint antes de llamar a `preguntar`. Si el
   backend ya mandó el expediente filtrado y sin marca, se usa tal cual
   y lo que no esté se responde con `Eso no está en el expediente.`

2. **Cómo citar alergias y condiciones crónicas.** Esos campos viven en
   el paciente, no en una consulta, y `Fuente` exige `consulta_id`.
   Hoy se cita así: `consulta_id=""`, `version` igual a la del paciente,
   `original_url=""`, `campo` = `alergias` o `condiciones_cronicas`.

## Dependencias

`httpx` (cliente de Ollama), declarada en `pyproject.toml` y
`requirements.txt`. El modelo no se instala con pip.

"""Extractor de fichas clínicas.

Firma de backend/app/modulos/interfaces.py:

    extraer_ficha(imagenes: list[bytes]) -> dict

Devuelve una Extraccion del contrato de Phil:
    {"paciente": {campo: {valor, confianza}}, "consultas": [{..., "pagina": int}],
     "error": str?}
Campo = {"valor": T | None, "confianza": "alta" | "baja"}.

Nunca inventa. Renglón vacío -> valor None y confianza "baja".
"Ninguna" / "No refiere" / "—" escrito -> [] y "alta".
Nunca genera un DPI ni un id TMP-... (si no hay DPI, valor null; el backend
asigna TMP-AAAAMMDD-XXXX). Nunca confirma ni guarda un expediente.

Si un modelo interno devuelve un float, >= 0.75 es "alta"; si no, "baja".
El contrato público solo expone "alta" | "baja".

Errores (excepción con atributo codigo):
    "ilegible"          -> 422, con la Extraccion vacía en exc.extraccion
    "ia_no_disponible"  -> 503

Imagen que no es ficha, o de la que no se lee nada: se lanza "ilegible".
En exc.extraccion van todos los valor en null y "baja", consultas [] y error.

El backend elige con SIGO_VISION_IMPL=mock|real (default mock).
El prompt que usa el modo real está en modulos-arturo/vision/prompt_vision_ficha.md.
"""

from __future__ import annotations

import base64
import copy
import hashlib
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .errores import ErrorModulo

MODULOS_DIR = Path(__file__).resolve().parents[1]
VISION_DIR = MODULOS_DIR / "vision"
PROMPT_PATH = VISION_DIR / "prompt_vision_ficha.md"
FIXTURES_DIR = VISION_DIR / "fixtures"

# Ejemplo inventado del contrato de Phil (el mismo que el mock del backend).
# No es un paciente real y no se debe confirmar.
EXTRACCION_EJEMPLO = {
    "paciente": {
        "nombre": {"valor": "Rosa Batz Tzoc", "confianza": "alta"},
        "dpi": {"valor": "2547896310801", "confianza": "alta"},
        "fecha_nacimiento": {"valor": "1984-03-12", "confianza": "alta"},
        "sexo": {"valor": "F", "confianza": "alta"},
        "comunidad": {"valor": "Chuicacá", "confianza": "alta"},
        "alergias": {"valor": ["penicilina"], "confianza": "alta"},
        "condiciones_cronicas": {"valor": [], "confianza": "alta"},
    },
    "consultas": [
        {
            "fecha": {"valor": "2025-08-14", "confianza": "alta"},
            "motivo": {"valor": "Control prenatal", "confianza": "alta"},
            "diagnostico": {"valor": "Embarazo 24 semanas", "confianza": "baja"},
            "tratamiento": {"valor": "Sulfato ferroso", "confianza": "alta"},
            "vacunas": {"valor": ["Td"], "confianza": "alta"},
            "pagina": 0,
        }
    ],
}

PACIENTE_FIELDS = [
    "nombre",
    "dpi",
    "fecha_nacimiento",
    "sexo",
    "comunidad",
    "alergias",
    "condiciones_cronicas",
]
CONSULTA_FIELDS = ["fecha", "motivo", "diagnostico", "tratamiento", "vacunas"]
ARRAY_FIELDS = {"alergias", "condiciones_cronicas", "vacunas"}
UMBRAL_ALTA = 0.75
VACIO_ESCRITO = {
    "ninguna",
    "ninguno",
    "ningunas",
    "ningunos",
    "no refiere",
    "n/a",
    "na",
    "—",
    "–",
    "-",
}
CLAVES_PROVEEDOR = (
    "VISION_BASE_URL",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENAI_API_KEY",
    "XAI_API_KEY",
    "OLLAMA_HOST",
    "OLLAMA_URL",
)


def extraccion_ilegible(mensaje: str = "imagen ilegible") -> dict:
    """Todos los valor en null + 'baja', consultas vacías, error de texto."""
    vacio = {"valor": None, "confianza": "baja"}
    return {
        "paciente": {k: dict(vacio) for k in PACIENTE_FIELDS},
        "consultas": [],
        "error": mensaje,
    }


def lanzar_ilegible(mensaje: str, extraccion: dict | None = None) -> None:
    """Levanta ErrorModulo(codigo='ilegible') con la Extraccion adjunta."""
    payload = copy.deepcopy(extraccion) if extraccion is not None else extraccion_ilegible(mensaje)
    if not payload.get("error"):
        payload["error"] = mensaje
    payload["consultas"] = payload.get("consultas") if isinstance(payload.get("consultas"), list) else []
    exc = ErrorModulo(mensaje, "ilegible")
    exc.extraccion = payload
    raise exc


def impl_activa() -> str:
    raw = (os.environ.get("SIGO_VISION_IMPL") or "mock").strip().lower()
    return "real" if raw == "real" else "mock"


def proveedor_detectado() -> str | None:
    """Proveedor de visión según el entorno. Sin key ni host, None.

    Ollama no usa API key: basta OLLAMA_HOST u OLLAMA_URL.
    El modelo local se elige con OLLAMA_VISION_MODEL (p. ej. qwen2.5vl).
    """
    if os.environ.get("VISION_BASE_URL"):
        return "openai_compat"
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or os.environ.get("GOOGLE_GENAI_API_KEY"):
        return "gemini"
    if os.environ.get("XAI_API_KEY"):
        return "xai"
    if os.environ.get("OLLAMA_HOST") or os.environ.get("OLLAMA_URL"):
        return "ollama"
    return None


def extraer_ficha(imagenes: list[bytes]) -> dict:
    """JPEGs (o PNG de prueba) en orden de página -> Extraccion.

    Errores: ErrorModulo(codigo="ilegible") o ErrorModulo(codigo="ia_no_disponible").
    """
    if impl_activa() == "real":
        return extraer_ficha_real(imagenes)
    return extraer_ficha_mock(imagenes)


def extraer_ficha_mock(imagenes: list[bytes]) -> dict:
    if not imagenes or not any(imagenes):
        lanzar_ilegible("No llegó ninguna imagen.")
    catalogo = _catalogo_fixtures()
    for blob in imagenes:
        if not blob:
            continue
        digest = hashlib.sha256(blob).hexdigest()
        if digest in catalogo:
            encontrado = copy.deepcopy(catalogo[digest])
            if encontrado.get("error"):
                lanzar_ilegible(str(encontrado["error"]), encontrado)
            return encontrado
    return copy.deepcopy(EXTRACCION_EJEMPLO)


def extraer_ficha_real(imagenes: list[bytes]) -> dict:
    if not imagenes or not any(imagenes):
        lanzar_ilegible("No llegó ninguna imagen.")
    paginas = [b for b in imagenes if b]
    proveedor = proveedor_detectado()
    if not proveedor:
        raise ErrorModulo(
            "No hay un modelo de visión configurado (API key u Ollama/VISION_BASE_URL).",
            "ia_no_disponible",
        )
    try:
        prompt = _cargar_prompt()
        crudo = _llamar_proveedor(proveedor, prompt, paginas)
    except ErrorModulo:
        raise
    except Exception as exc:
        raise ErrorModulo(
            f"La IA de visión no respondió: {type(exc).__name__}",
            "ia_no_disponible",
        ) from exc
    if not isinstance(crudo, str):
        crudo = "" if crudo is None else str(crudo)
    try:
        datos = json.loads(_strip_fences(crudo))
    except (json.JSONDecodeError, TypeError) as exc:
        try:
            lanzar_ilegible("La IA no devolvió un JSON legible.")
        except ErrorModulo as err:
            raise err from exc
    extraccion = _sanear_extraccion(datos)
    if _esta_vacia(extraccion):
        frase = None
        if isinstance(datos, dict) and isinstance(datos.get("error"), str) and datos["error"].strip():
            frase = datos["error"].strip()
        frase = frase or extraccion.get("error") or "La IA no pudo leer nada."
        extraccion["error"] = frase
        extraccion["consultas"] = []
        lanzar_ilegible(frase, extraccion)
    return extraccion


def _catalogo_fixtures() -> dict[str, dict]:
    global _CATALOGO
    if _CATALOGO is not None:
        return _CATALOGO
    catalogo: dict[str, dict] = {}
    if FIXTURES_DIR.is_dir():
        for truth_path in FIXTURES_DIR.glob("ficha_*.truth.json"):
            png = truth_path.with_name(truth_path.name.replace(".truth.json", ".png"))
            if not png.is_file():
                continue
            catalogo[hashlib.sha256(png.read_bytes()).hexdigest()] = json.loads(
                truth_path.read_text(encoding="utf-8")
            )
    _CATALOGO = catalogo
    return catalogo


_CATALOGO: dict[str, dict] | None = None


def _cargar_prompt() -> str:
    """Devuelve las instrucciones operativas, sin la nota de unificación.

    El corte es la línea de encabezado, no la primera vez que el texto
    menciona esas palabras. Así la nota para humanos no le llega al modelo.
    """
    text = PROMPT_PATH.read_text(encoding="utf-8")
    head = (
        "La salida tiene que ser solo un objeto JSON válido, sin markdown, "
        "sin cercas, sin comentarios y sin texto alrededor.\n\n"
    )
    lineas = text.splitlines()
    for i, linea in enumerate(lineas):
        if linea.strip() == "## Instrucciones":
            return head + "\n".join(lineas[i + 1 :]).strip()
    return text


def _strip_fences(text: str) -> str:
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]
    return text


def _confianza(valor: Any, crudo: Any) -> str:
    if isinstance(crudo, str) and crudo.strip().lower() in ("alta", "baja"):
        return crudo.strip().lower()
    if isinstance(crudo, (int, float)) and not isinstance(crudo, bool):
        return "alta" if float(crudo) >= UMBRAL_ALTA else "baja"
    return "baja" if valor is None else "alta"


def _texto_vacio_escrito(texto: str) -> bool:
    t = texto.strip().strip(".").casefold()
    t = t.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
    return t in VACIO_ESCRITO


def _campo(crudo: Any, array: bool = False, sexo: bool = False) -> dict:
    if isinstance(crudo, dict) and "valor" in crudo:
        valor, conf = crudo.get("valor"), crudo.get("confianza")
    else:
        valor, conf = crudo, None
    ninguna_escrita = False
    if array:
        if isinstance(valor, str):
            if valor.strip() and _texto_vacio_escrito(valor):
                valor = []
                ninguna_escrita = True
            elif not valor.strip():
                valor = None
            else:
                partes = [p.strip() for p in re.split(r"[,;/]", valor) if p.strip()]
                valor = partes or None
        elif valor is not None and not isinstance(valor, list):
            valor = None
        if isinstance(valor, list):
            limpio = []
            for item in valor:
                if item is None or not str(item).strip():
                    continue
                texto = str(item).strip()
                if _texto_vacio_escrito(texto):
                    ninguna_escrita = True
                    continue
                limpio.append(texto)
            if limpio:
                valor = limpio
                ninguna_escrita = False
            elif ninguna_escrita or valor == []:
                valor = []
            else:
                valor = None
    elif sexo:
        if valor is not None:
            letra = str(valor).strip().upper()
            valor = letra if letra in ("F", "M") else None
    elif valor is not None and not isinstance(valor, str):
        valor = str(valor)
    if isinstance(valor, str) and not valor.strip():
        valor = None
    if valor is None:
        confianza = "baja"
    elif ninguna_escrita and valor == []:
        confianza = "alta"
    else:
        if array and valor == [] and conf is None:
            conf = "alta"
        confianza = _confianza(valor, conf)
    return {"valor": valor, "confianza": confianza}


def _sanear_extraccion(datos: Any) -> dict:
    if not isinstance(datos, dict):
        lanzar_ilegible("La IA no devolvió un objeto Extraccion.")
    fuente_pac = datos.get("paciente") if isinstance(datos.get("paciente"), dict) else datos
    paciente = {}
    for key in PACIENTE_FIELDS:
        paciente[key] = _campo(fuente_pac.get(key), array=key in ARRAY_FIELDS, sexo=key == "sexo")
    dpi_val = paciente["dpi"]["valor"]
    if isinstance(dpi_val, str):
        if dpi_val.strip().upper().startswith("TMP-"):
            paciente["dpi"] = {"valor": None, "confianza": "baja"}
        else:
            digitos = re.sub(r"\D", "", dpi_val)
            if len(digitos) == 13:
                paciente["dpi"]["valor"] = digitos
            else:
                paciente["dpi"] = {"valor": None, "confianza": "baja"}
    if paciente["dpi"]["valor"] is None:
        paciente["dpi"]["confianza"] = "baja"

    consultas_in = datos.get("consultas")
    if not isinstance(consultas_in, list):
        if any(k in datos for k in ("motivo", "diagnostico", "tratamiento", "fecha_consulta", "medicamentos")):
            consultas_in = [
                {
                    "fecha": datos.get("fecha_consulta") or datos.get("fecha"),
                    "motivo": datos.get("motivo"),
                    "diagnostico": datos.get("diagnostico"),
                    "tratamiento": datos.get("tratamiento") or datos.get("medicamentos"),
                    "vacunas": datos.get("vacunas"),
                    "pagina": 0,
                }
            ]
        else:
            consultas_in = []
    consultas = []
    for i, item in enumerate(consultas_in):
        if not isinstance(item, dict):
            continue
        fila = {k: _campo(item.get(k), array=k in ARRAY_FIELDS) for k in CONSULTA_FIELDS}
        pagina = item.get("pagina", i)
        try:
            pagina = int(pagina)
            if pagina < 0:
                pagina = i
        except (TypeError, ValueError):
            pagina = i
        fila["pagina"] = pagina
        consultas.append(fila)
    out: dict[str, Any] = {"paciente": paciente, "consultas": consultas}
    if isinstance(datos.get("error"), str) and datos["error"].strip():
        out["error"] = datos["error"].strip()
    return out


def _esta_vacia(extraccion: dict) -> bool:
    pac = extraccion.get("paciente") or {}
    if any((pac.get(k) or {}).get("valor") is not None for k in PACIENTE_FIELDS):
        return False
    for cons in extraccion.get("consultas") or []:
        if any((cons.get(k) or {}).get("valor") is not None for k in CONSULTA_FIELDS):
            return False
    return True


def _b64(blob: bytes) -> str:
    return base64.b64encode(blob).decode("ascii")


def _mime(blob: bytes) -> str:
    if blob.startswith(b"\x89PNG"):
        return "image/png"
    if blob[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if blob[:4] == b"RIFF" and b"WEBP" in blob[:16]:
        return "image/webp"
    return "image/jpeg"


def _http_json(url: str, payload: dict, headers: dict, timeout: int = 120) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"HTTP {exc.code}: {err}") from exc


def _llamar_proveedor(proveedor: str, prompt: str, paginas: list[bytes]) -> str:
    if proveedor == "openai":
        model = os.environ.get("EVAL_MODEL") or "gpt-4o"
        return _openai_compat(
            prompt,
            paginas,
            os.environ.get("OPENAI_BASE_URL") or "https://api.openai.com/v1",
            os.environ.get("OPENAI_API_KEY"),
            model,
        )
    if proveedor == "xai":
        model = os.environ.get("EVAL_MODEL") or "grok-2-vision-1212"
        return _openai_compat(prompt, paginas, "https://api.x.ai/v1", os.environ.get("XAI_API_KEY"), model)
    if proveedor == "openai_compat":
        base = os.environ.get("VISION_BASE_URL") or ""
        key = os.environ.get("VISION_API_KEY") or os.environ.get("OPENAI_API_KEY")
        model = os.environ.get("VISION_MODEL") or os.environ.get("EVAL_MODEL") or "qwen2.5-vl"
        return _openai_compat(prompt, paginas, base, key, model)
    if proveedor == "anthropic":
        return _anthropic(prompt, paginas)
    if proveedor == "gemini":
        return _gemini(prompt, paginas)
    if proveedor == "ollama":
        return _ollama(prompt, paginas)
    raise ErrorModulo(f"Proveedor de visión no soportado: {proveedor}", "ia_no_disponible")


def _openai_compat(prompt: str, paginas: list[bytes], base_url: str, api_key: str | None, model: str) -> str:
    url = base_url.rstrip("/") + "/chat/completions"
    content: list[dict] = [{"type": "text", "text": "Extrae los campos de esta ficha. Devolvé solo JSON."}]
    for blob in paginas:
        content.append(
            {"type": "image_url", "image_url": {"url": f"data:{_mime(blob)};base64,{_b64(blob)}"}}
        )
    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": content},
        ],
    }
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    out = _http_json(url, payload, headers)
    return out["choices"][0]["message"]["content"]


def _anthropic(prompt: str, paginas: list[bytes]) -> str:
    model = os.environ.get("EVAL_MODEL") or "claude-sonnet-4-20250514"
    parts: list[dict] = []
    for blob in paginas:
        parts.append(
            {
                "type": "image",
                "source": {"type": "base64", "media_type": _mime(blob), "data": _b64(blob)},
            }
        )
    parts.append({"type": "text", "text": "Extrae los campos de esta ficha. Devolvé solo JSON."})
    payload = {
        "model": model,
        "max_tokens": 2000,
        "temperature": 0,
        "system": prompt,
        "messages": [{"role": "user", "content": parts}],
    }
    headers = {
        "Content-Type": "application/json",
        "x-api-key": os.environ.get("ANTHROPIC_API_KEY") or "",
        "anthropic-version": "2023-06-01",
    }
    out = _http_json("https://api.anthropic.com/v1/messages", payload, headers)
    return "\n".join(p.get("text", "") for p in out.get("content", []) if p.get("type") == "text")


def _gemini(prompt: str, paginas: list[bytes]) -> str:
    key = (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("GOOGLE_GENAI_API_KEY")
        or ""
    )
    model = os.environ.get("EVAL_MODEL") or "gemini-2.0-flash"
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={key}"
    )
    parts: list[dict] = [{"text": "Extrae los campos de esta ficha. Devolvé solo JSON."}]
    for blob in paginas:
        parts.append({"inline_data": {"mime_type": _mime(blob), "data": _b64(blob)}})
    payload = {
        "system_instruction": {"parts": [{"text": prompt}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    out = _http_json(url, payload, {"Content-Type": "application/json"})
    cands = out.get("candidates") or []
    if not cands:
        raise RuntimeError("Gemini no devolvió candidates")
    return "".join(p.get("text", "") for p in cands[0].get("content", {}).get("parts", []))


def _ollama(prompt: str, paginas: list[bytes]) -> str:
    host = os.environ.get("OLLAMA_HOST") or os.environ.get("OLLAMA_URL") or "http://127.0.0.1:11434"
    model = os.environ.get("OLLAMA_VISION_MODEL") or os.environ.get("OLLAMA_MODEL") or "qwen2.5vl:7b"
    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": prompt},
            {
                "role": "user",
                "content": "Extrae los campos de esta ficha. Devolvé solo JSON.",
                "images": [_b64(b) for b in paginas],
            },
        ],
        "options": {"temperature": 0},
    }
    out = _http_json(host.rstrip("/") + "/api/chat", payload, {"Content-Type": "application/json"}, timeout=180)
    return out.get("message", {}).get("content") or ""

"""Cliente HTTP de Ollama con reúso de caché KV (prefijo idéntico + keep_alive largo).

Usa /api/chat con el mismo mensaje de sistema (sistema + expediente) en cada
pregunta del mismo DPI/modo, para que Ollama reúse el prefijo cacheado.
También expone /api/generate por si se quiere pasar el campo `context`.
"""

from __future__ import annotations

import os
import time
import json
from collections.abc import Callable
from typing import Any

import httpx

MODELO_DEFAULT = "qwen2.5:7b"
MODELO_ALTERNO = "llama3.1:8b"
URL_DEFAULT = "http://localhost:11434"
KEEP_ALIVE_DEFAULT = "24h"


class OllamaNoDisponible(RuntimeError):
    """Ollama no responde. El backend mapea `codigo` a HTTP 503."""

    codigo = "ia_no_disponible"

    def __init__(self, mensaje: str = "El asistente no está disponible. Intentá de nuevo.") -> None:
        super().__init__(mensaje)
        self.codigo = "ia_no_disponible"
        self.mensaje = mensaje


def _url_base(valor: str | None = None) -> str:
    crudo = (valor or os.environ.get("OLLAMA_URL") or os.environ.get("OLLAMA_HOST") or URL_DEFAULT).strip()
    if not crudo:
        crudo = URL_DEFAULT
    if "://" not in crudo:
        crudo = "http://" + crudo
    return crudo.rstrip("/")


def _modelo(valor: str | None = None) -> str:
    return (valor or os.environ.get("OLLAMA_MODEL") or MODELO_DEFAULT).strip() or MODELO_DEFAULT


class OllamaCliente:
    def __init__(
        self,
        url: str | None = None,
        modelo: str | None = None,
        keep_alive: str = KEEP_ALIVE_DEFAULT,
        timeout: float = 300.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.url = _url_base(url)
        self.modelo = _modelo(modelo)
        self.keep_alive = keep_alive
        self.timeout = timeout
        self._http = httpx.Client(base_url=self.url, timeout=timeout, transport=transport)
        # context tokens devueltos por /api/generate, por clave de prefijo
        self._contextos: dict[str, list[int]] = {}

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "OllamaCliente":
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def disponible(self) -> bool:
        try:
            r = self._http.get("/api/tags")
            r.raise_for_status()
            return True
        except (httpx.HTTPError, OSError):
            return False

    def _fallo(self, exc: Exception) -> OllamaNoDisponible:
        return OllamaNoDisponible(
            f"Ollama no está disponible en {self.url} (modelo {self.modelo}): {exc}"
        )

    def mensajes(self, prefijo: str, pregunta: str) -> list[dict[str, str]]:
        """Prefijo de sistema idéntico + la pregunta del turno. No acumula historial."""
        user = (
            "Pregunta del personal de salud:\n"
            f"{pregunta.strip()}\n\n"
            "Respondé SOLO el JSON, sin markdown."
        )
        return [
            {"role": "system", "content": prefijo},
            {"role": "user", "content": user},
        ]

    def precalentar(self, clave: str, prefijo: str) -> None:
        """Carga el prefijo en la caché KV (warm-up). Descarta la respuesta."""
        cuerpo = {
            "model": self.modelo,
            "messages": self.mensajes(prefijo, "OK. Confirmá que cargaste el expediente con un JSON vacío de fuentes."),
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": {"temperature": 0, "num_predict": 16},
        }
        try:
            r = self._http.post("/api/chat", json=cuerpo)
            r.raise_for_status()
        except (httpx.HTTPError, OSError) as exc:
            raise self._fallo(exc) from exc
        # También calentamos /api/generate para guardar `context` si el runtime lo devuelve.
        self._precalentar_generate(clave, prefijo)

    def _precalentar_generate(self, clave: str, prefijo: str) -> None:
        cuerpo = {
            "model": self.modelo,
            "prompt": prefijo + "\n",
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": {"temperature": 0, "num_predict": 1},
        }
        try:
            r = self._http.post("/api/generate", json=cuerpo)
            r.raise_for_status()
            data = r.json()
        except (httpx.HTTPError, OSError, ValueError):
            return
        contexto = data.get("context")
        if isinstance(contexto, list):
            self._contextos[clave] = contexto

    def generar(self, clave: str, prefijo: str, pregunta: str) -> str:
        """Una pregunta nueva; el prefijo de sistema se mantiene idéntico para reusar caché."""
        cuerpo = {
            "model": self.modelo,
            "messages": self.mensajes(prefijo, pregunta),
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": {"temperature": 0},
        }
        try:
            r = self._http.post("/api/chat", json=cuerpo)
            r.raise_for_status()
            data = r.json()
        except (httpx.HTTPError, OSError, ValueError) as exc:
            raise self._fallo(exc) from exc
        mensaje = (data.get("message") or {}).get("content") or data.get("response") or ""
        return str(mensaje)

    def generar_con_context(self, clave: str, prefijo: str, pregunta: str) -> str:
        """Variante /api/generate que reenvía el `context` devuelto en el warm-up.

        El prompt completo mantiene el mismo prefijo; si hay `context` previo del
        mismo prefijo se envía, pero cada pregunta es independiente (no se
        encadena el historial de respuestas).
        """
        prompt = prefijo + "\n\nPREGUNTA:\n" + pregunta.strip() + "\n\nRespondé SOLO el JSON, sin markdown.\n"
        cuerpo: dict[str, Any] = {
            "model": self.modelo,
            "prompt": prompt,
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": {"temperature": 0},
        }
        if clave in self._contextos:
            # No pasamos el context de un generate que ya incluyó otra pregunta;
            # solo el del warm-up del prefijo puro, que se guarda en precalentar.
            cuerpo["context"] = self._contextos[clave]
        try:
            r = self._http.post("/api/generate", json=cuerpo)
            r.raise_for_status()
            data = r.json()
        except (httpx.HTTPError, OSError, ValueError) as exc:
            raise self._fallo(exc) from exc
        return str(data.get("response") or "")

    def generar_stream(
        self,
        clave: str,
        prefijo: str,
        pregunta: str,
        al_token: Callable[[str], None] | None = None,
    ) -> tuple[str, float, float]:
        """Devuelve (texto, segundos_a_primer_token, segundos_totales)."""
        cuerpo = {
            "model": self.modelo,
            "messages": self.mensajes(prefijo, pregunta),
            "stream": True,
            "keep_alive": self.keep_alive,
            "options": {"temperature": 0},
        }
        t0 = time.perf_counter()
        primer: float | None = None
        partes: list[str] = []
        try:
            with self._http.stream("POST", "/api/chat", json=cuerpo) as r:
                r.raise_for_status()
                for linea in r.iter_lines():
                    if not linea:
                        continue
                    try:
                        data = json.loads(linea)
                    except ValueError:
                        continue
                    trozo = ((data.get("message") or {}).get("content")) or data.get("response") or ""
                    if trozo:
                        if primer is None:
                            primer = time.perf_counter()
                        partes.append(str(trozo))
                        if al_token:
                            al_token(str(trozo))
        except (httpx.HTTPError, OSError) as exc:
            raise self._fallo(exc) from exc
        t1 = time.perf_counter()
        ttft = (primer - t0) if primer is not None else (t1 - t0)
        return "".join(partes), ttft, (t1 - t0)

#!/usr/bin/env python3
"""Mide tiempo a primer token y total, en frío y en caliente, contra Ollama.

Pensado para correrlo en la PC de Luis (RTX 5090). En esta máquina de
desarrollo se puede intentar en CPU, pero no es la medición del pitch.

Ejemplo:

    export OLLAMA_URL=http://127.0.0.1:11434
    export OLLAMA_MODEL=qwen2.5:7b
    python -m cag.medir_latencia
    python -m cag.medir_latencia --modelo llama3.1:8b
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Permite `python cag/medir_latencia.py` además de `python -m cag.medir_latencia`.
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from cag.expediente import armar_prefijo, clave_cache  # noqa: E402
from cag.fixtures import ROSA  # noqa: E402
from cag.ollama_cliente import MODELO_ALTERNO, MODELO_DEFAULT, OllamaCliente, OllamaNoDisponible  # noqa: E402

HORA_GT = timezone(timedelta(hours=-6))

PREGUNTAS = [
    "¿A qué es alérgica Rosa?",
    "¿Cuándo fue su última vacuna?",
    "¿Qué le recetaron en la consulta del 2 de noviembre de 2024?",
]


def _ahora() -> str:
    return datetime.now(HORA_GT).strftime("%Y-%m-%d %H:%M:%S") + " hora Guatemala (UTC-6)"


def _fila(nombre: str, ttft: float, total: float, caracteres: int) -> dict:
    return {
        "corrida": nombre,
        "segundos_a_primer_token": round(ttft, 3),
        "segundos_totales": round(total, 3),
        "caracteres": caracteres,
    }


def medir(args: argparse.Namespace) -> int:
    cliente = OllamaCliente(url=args.url, modelo=args.modelo, keep_alive=args.keep_alive, timeout=args.timeout)
    print(f"CAG SIGO — medición de latencia")
    print(f"Hora: {_ahora()}")
    print(f"Ollama: {cliente.url}")
    print(f"Modelo: {cliente.modelo}")
    print(f"keep_alive: {cliente.keep_alive}")
    print()

    if not cliente.disponible():
        print(
            "Ollama no responde. Levantalo y volvé a correr este script:\n"
            "  ollama serve\n"
            f"  ollama pull {cliente.modelo}\n"
            f"  export OLLAMA_URL={cliente.url}\n"
            f"  export OLLAMA_MODEL={cliente.modelo}\n"
            "  python -m cag.medir_latencia",
            file=sys.stderr,
        )
        return 2

    tipo = "codigo"
    prefijo = armar_prefijo(ROSA, tipo)
    clave = clave_cache(ROSA, tipo)
    resultados: list[dict] = []

    print("1) Frío — primera pregunta (llena la caché KV del prefijo sistema+expediente).")
    t0 = time.perf_counter()
    texto, ttft, total = cliente.generar_stream(clave, prefijo, PREGUNTAS[0])
    resultados.append(_fila("frio_pregunta_1", ttft, total, len(texto)))
    print(f"   TTFT {ttft:.3f}s   total {total:.3f}s   ({len(texto)} caracteres)")
    print(f"   recorte: {texto[:180].replace(chr(10), ' ')}")
    print()

    print("2) Caliente — segunda pregunta, mismo DPI, mismo prefijo.")
    texto, ttft, total = cliente.generar_stream(clave, prefijo, PREGUNTAS[1])
    resultados.append(_fila("caliente_pregunta_2", ttft, total, len(texto)))
    print(f"   TTFT {ttft:.3f}s   total {total:.3f}s   ({len(texto)} caracteres)")
    print(f"   recorte: {texto[:180].replace(chr(10), ' ')}")
    print()

    print("3) Caliente — tercera pregunta, mismo DPI.")
    texto, ttft, total = cliente.generar_stream(clave, prefijo, PREGUNTAS[2])
    resultados.append(_fila("caliente_pregunta_3", ttft, total, len(texto)))
    print(f"   TTFT {ttft:.3f}s   total {total:.3f}s   ({len(texto)} caracteres)")
    print(f"   recorte: {texto[:180].replace(chr(10), ' ')}")
    print()

    if args.con_warmup_explicito:
        print("4) Warm-up explícito + pregunta (otro proceso de medición).")
        tw = time.perf_counter()
        cliente.precalentar(clave, prefijo)
        t_warm = time.perf_counter() - tw
        print(f"   precalentar: {t_warm:.3f}s")
        texto, ttft, total = cliente.generar_stream(clave, prefijo, PREGUNTAS[0])
        resultados.append(_fila("despues_warmup_explicito", ttft, total, len(texto)))
        print(f"   TTFT {ttft:.3f}s   total {total:.3f}s")
        print()

    transcurrido = time.perf_counter() - t0
    print("Resumen")
    print(f"{'corrida':<28} {'TTFT_s':>10} {'total_s':>10}")
    for f in resultados:
        print(f"{f['corrida']:<28} {f['segundos_a_primer_token']:>10.3f} {f['segundos_totales']:>10.3f}")
    print(f"Tiempo de pared de la medición: {transcurrido:.1f}s")
    print()
    print(
        "Nota: 'frío' es la primera pregunta sobre este expediente (carga del prefijo). "
        "'caliente' reúsa la caché KV del mismo prefijo. Esta cifra en CPU no es la del pitch; "
        "la que cuenta es la de la RTX 5090."
    )

    if args.salida:
        ruta = Path(args.salida)
        payload = {
            "hora_guatemala": _ahora(),
            "url": cliente.url,
            "modelo": cliente.modelo,
            "resultados": resultados,
            "datos": "inventados (Rosa Ajpop)",
        }
        ruta.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Guardado: {ruta}")

    cliente.close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Medir latencia del CAG (frío vs caliente).")
    parser.add_argument("--url", default=None, help="Override de OLLAMA_URL / OLLAMA_HOST")
    parser.add_argument("--modelo", default=None, help=f"Override de OLLAMA_MODEL (default {MODELO_DEFAULT}, alterno {MODELO_ALTERNO})")
    parser.add_argument("--keep-alive", default="24h")
    parser.add_argument("--timeout", type=float, default=600.0)
    parser.add_argument("--con-warmup-explicito", action="store_true")
    parser.add_argument("--salida", default=None, help="Ruta JSON para guardar el resumen")
    args = parser.parse_args()
    try:
        return medir(args)
    except OllamaNoDisponible as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Mide cuánto tarda cada formato de exportación.

Usa el expediente inventado de Rosa Ajpop. No llama a la red: el PDF
pasa por el fetcher que bloquea http(s) y file.

Ejemplo, desde modulos-arturo/:

    python exportar/medir_latencia.py
    python exportar/medir_latencia.py --repeticiones 3 --salida latencia-exportar.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from sigo_modulos.exportar import FORMATOS, exportar  # noqa: E402
from tests.datos_inventados import EXPEDIENTE_ROSA  # noqa: E402

HORA_GT = timezone(timedelta(hours=-6))


def main() -> int:
    parser = argparse.ArgumentParser(description="Medir latencia de exportación por formato.")
    parser.add_argument("--repeticiones", type=int, default=1)
    parser.add_argument("--salida", default=None, help="Ruta JSON opcional para el resumen")
    args = parser.parse_args()
    if args.repeticiones < 1:
        print("--repeticiones debe ser >= 1", file=sys.stderr)
        return 2

    print("Exportar SIGO — medición de latencia")
    print(datetime.now(HORA_GT).strftime("%Y-%m-%d %H:%M:%S") + " hora Guatemala (UTC-6)")
    print(f"Repeticiones: {args.repeticiones}")
    print(f"{'formato':<8} {'media_ms':>10} {'bytes':>10}  nombre")

    resultados: list[dict] = []
    for formato in FORMATOS:
        tiempos: list[float] = []
        tam = 0
        tipo = ""
        nombre = ""
        for _ in range(args.repeticiones):
            t0 = time.perf_counter()
            contenido, tipo, nombre = exportar(EXPEDIENTE_ROSA, formato)
            tiempos.append(time.perf_counter() - t0)
            tam = len(contenido)
        media = sum(tiempos) / len(tiempos)
        print(f"{formato:<8} {media * 1000:10.1f} {tam:10}  {nombre}")
        resultados.append(
            {
                "formato": formato,
                "segundos": round(media, 4),
                "bytes": tam,
                "content_type": tipo,
                "nombre": nombre,
            }
        )

    if args.salida:
        ruta = Path(args.salida)
        ruta.write_text(
            json.dumps(
                {
                    "hora_guatemala": datetime.now(HORA_GT).strftime("%Y-%m-%d %H:%M:%S")
                    + " hora Guatemala (UTC-6)",
                    "datos": "inventados (Rosa Ajpop)",
                    "repeticiones": args.repeticiones,
                    "resultados": resultados,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"Guardado: {ruta}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

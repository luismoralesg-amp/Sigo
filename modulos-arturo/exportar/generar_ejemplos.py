"""Genera los 6 formatos en salidas_ejemplo/ y verifica que se puedan abrir."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.datos_inventados import EXPEDIENTE_ROSA  # noqa: E402
from sigo_modulos.exportar import FORMATOS, exportar  # noqa: E402

DESTINO = Path(__file__).resolve().parent / "salidas_ejemplo"


def _correr(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


def verificar(ruta: Path, formato: str) -> str:
    file_out = _correr(["file", "-b", str(ruta)]).stdout.strip()
    extras: list[str] = []
    if formato in {"docx", "xlsx"}:
        unzip = _correr(["unzip", "-t", str(ruta)])
        if unzip.returncode != 0:
            raise SystemExit(f"unzip -t falló en {ruta.name}: {unzip.stdout}\n{unzip.stderr}")
        extras.append("unzip -t: OK")
    if formato == "pdf":
        texto = _correr(["pdftotext", str(ruta), "-"])
        if texto.returncode != 0:
            raise SystemExit(f"pdftotext falló en {ruta.name}: {texto.stderr}")
        if "Rosa Ajpop" not in texto.stdout or "SIGO" not in texto.stdout:
            raise SystemExit(f"pdftotext no encontró el contenido esperado en {ruta.name}")
        extras.append(f"pdftotext: OK ({len(texto.stdout)} caracteres)")
    if formato in {"md", "txt", "html"}:
        contenido = ruta.read_text(encoding="utf-8")
        if "Rosa Ajpop" not in contenido or "SIGO" not in contenido:
            raise SystemExit(f"{ruta.name} no tiene el contenido esperado")
        extras.append("texto: OK")
    detalle = file_out
    if extras:
        detalle += " | " + "; ".join(extras)
    return detalle


def main() -> int:
    DESTINO.mkdir(parents=True, exist_ok=True)
    print(f"Escribiendo ejemplos en {DESTINO}")
    for formato in FORMATOS:
        contenido, tipo, nombre = exportar(EXPEDIENTE_ROSA, formato)
        ruta = DESTINO / nombre
        ruta.write_bytes(contenido)
        detalle = verificar(ruta, formato)
        print(f"  {nombre:24}  {len(contenido):7} bytes  {tipo}")
        print(f"    {detalle}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

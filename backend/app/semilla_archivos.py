"""Dibujos inventados de las fichas de la semilla.

No hay pacientes reales. El expediente apunta a /api/v1/archivos/semilla/<nombre>.svg
y esa ruta tiene que responder, sin firma: el navegador la pide como imagen.
"""

from __future__ import annotations

import html

# nombre de archivo -> (quién, fecha, nota). Todo inventado.
_FICHAS: dict[str, tuple[str, str, str]] = {
    "rosa_2019.svg": ("Rosa Batz Tzoc", "20 de mayo de 2019", "Faringitis. Dato inventado."),
    "rosa_2022.svg": ("Rosa Batz Tzoc", "3 de noviembre de 2022", "Control de presión. Dato inventado."),
    "rosa_2025.svg": ("Rosa Batz Tzoc", "14 de agosto de 2025", "Control prenatal. Dato inventado."),
    "mateo_2024.svg": ("Mateo Batz", "10 de febrero de 2024", "Vacuna SPR. Dato inventado."),
}


def _dibujo(quien: str, fecha: str, nota: str) -> bytes:
    e = html.escape
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640">
  <rect width="480" height="640" fill="#f3eee6"/>
  <rect x="28" y="28" width="424" height="584" fill="#fffdf8" stroke="#8a7355" stroke-width="2"/>
  <text x="48" y="78" font-family="sans-serif" font-size="14" fill="#8a7355">SIGO · FICHA INVENTADA</text>
  <text x="48" y="128" font-family="sans-serif" font-size="28" fill="#283659">{e(quien)}</text>
  <text x="48" y="168" font-family="sans-serif" font-size="18" fill="#283659">{e(fecha)}</text>
  <text x="48" y="230" font-family="sans-serif" font-size="16" fill="#3d3a36">{e(nota)}</text>
  <text x="48" y="560" font-family="sans-serif" font-size="13" fill="#8a7355">No es un paciente real.</text>
</svg>
"""
    return svg.encode("utf-8")


SEMILLAS: dict[str, bytes] = {nombre: _dibujo(*datos) for nombre, datos in _FICHAS.items()}


def leer_semilla(nombre: str) -> bytes | None:
    """Solo los nombres de la semilla. Cualquier otro camino no existe."""
    if not nombre or "/" in nombre or "\\" in nombre or nombre.startswith("."):
        return None
    return SEMILLAS.get(nombre)

"""Elige mock o real para cada módulo según SIGO_<MODULO>_IMPL."""

from __future__ import annotations

import importlib
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType

from ..config import config
from . import cag_mock, exportar_mock, importar_mock, vision_mock

RAIZ_REPO = Path(__file__).resolve().parents[3]
CARPETA_ARTURO = RAIZ_REPO / "modulos-arturo"

REAL = {
    "vision": ("sigo_modulos.vision", "extraer_ficha"),
    "importar": ("sigo_modulos.importar", "leer_archivo"),
    "cag": ("sigo_modulos.cag", "preguntar"),
    "exportar": ("sigo_modulos.exportar", "exportar"),
}
MOCK = {"vision": vision_mock, "importar": importar_mock, "cag": cag_mock, "exportar": exportar_mock}


def _cargar_real(nombre: str) -> ModuleType:
    ruta, funcion = REAL[nombre]
    if CARPETA_ARTURO.is_dir() and str(CARPETA_ARTURO) not in sys.path:
        sys.path.append(str(CARPETA_ARTURO))
    try:
        mod = importlib.import_module(ruta)
    except ImportError as exc:
        raise RuntimeError(
            f"SIGO_{nombre.upper()}_IMPL=real pero no se pudo importar {ruta}. "
            f"Instalá modulos-arturo (pip install -e ../modulos-arturo) o volvé a mock. Detalle: {exc}"
        ) from exc
    if not callable(getattr(mod, funcion, None)):
        raise RuntimeError(f"{ruta} no define la función {funcion}() que pide app/modulos/interfaces.py")
    return mod


@dataclass
class Modulos:
    vision: ModuleType
    importar: ModuleType
    cag: ModuleType
    exportar: ModuleType
    impl: dict[str, str]


def cargar() -> Modulos:
    c = config()
    elegido = {"vision": c.sigo_vision_impl, "importar": c.sigo_importar_impl,
               "cag": c.sigo_cag_impl, "exportar": c.sigo_export_impl}
    mods = {n: (_cargar_real(n) if impl == "real" else MOCK[n]) for n, impl in elegido.items()}
    return Modulos(impl=elegido, **mods)


_modulos: Modulos | None = None


def modulos() -> Modulos:
    global _modulos
    if _modulos is None:
        _modulos = cargar()
    return _modulos


def reiniciar() -> None:
    global _modulos
    _modulos = None

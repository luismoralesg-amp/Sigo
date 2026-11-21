"""Deja importable sigo_modulos y fija el modo mock salvo que el test lo cambie."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

VISION_DIR = Path(__file__).resolve().parents[1]
MODULOS_DIR = VISION_DIR.parent

if str(MODULOS_DIR) not in sys.path:
    sys.path.insert(0, str(MODULOS_DIR))


@pytest.fixture(autouse=True)
def _vision_en_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SIGO_VISION_IMPL", "mock")

"""Pruebas de sigo_modulos.vision.extraer_ficha en modo mock, sin red.

Las fotos y los ground truth son inventados. ficha_06 no es una ficha clínica.
"""

from __future__ import annotations

import importlib.util
import inspect
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from sigo_modulos.errores import ErrorModulo
from sigo_modulos.vision import (
    EXTRACCION_EJEMPLO,
    PACIENTE_FIELDS,
    PROMPT_PATH,
    UMBRAL_ALTA,
    _cargar_prompt,
    _sanear_extraccion,
    extraer_ficha,
    extraccion_ilegible,
    proveedor_detectado,
)

VISION_DIR = Path(__file__).resolve().parents[1]
FIXTURES = VISION_DIR / "fixtures"
REPO_DIR = VISION_DIR.parents[1]
FICHAS_VALIDAS = ["ficha_01", "ficha_02", "ficha_03", "ficha_04", "ficha_05"]
CLAVES = [
    "VISION_BASE_URL",
    "VISION_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENAI_API_KEY",
    "XAI_API_KEY",
    "OLLAMA_HOST",
    "OLLAMA_URL",
    "OLLAMA_MODEL",
    "OLLAMA_VISION_MODEL",
]


def _png(stem: str) -> bytes:
    return (FIXTURES / f"{stem}.png").read_bytes()


def _truth(stem: str) -> dict:
    return json.loads((FIXTURES / f"{stem}.truth.json").read_text(encoding="utf-8"))


def _eval():
    spec = importlib.util.spec_from_file_location("sigo_vision_eval", VISION_DIR / "eval.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _limpiar_claves(monkeypatch: pytest.MonkeyPatch) -> None:
    for nombre in CLAVES:
        monkeypatch.delenv(nombre, raising=False)


def _paciente_minimo(**overrides: dict) -> dict:
    paciente = {k: {"valor": None, "confianza": "baja"} for k in PACIENTE_FIELDS}
    paciente.update(overrides)
    return {"paciente": paciente, "consultas": []}


@pytest.mark.parametrize("stem", FICHAS_VALIDAS)
def test_mock_devuelve_el_ground_truth(stem: str) -> None:
    pred = extraer_ficha([_png(stem)])
    assert pred == _truth(stem)
    assert "error" not in pred
    assert "TMP-" not in json.dumps(pred)


def test_mock_ficha_04_sin_dpi_no_genera_tmp() -> None:
    pred = extraer_ficha([_png("ficha_04")])
    assert pred["paciente"]["dpi"] == {"valor": None, "confianza": "baja"}


def test_mock_no_es_ficha_lanza_ilegible() -> None:
    with pytest.raises(ErrorModulo) as excinfo:
        extraer_ficha([_png("ficha_06")])
    exc = excinfo.value
    assert exc.codigo == "ilegible"
    assert exc.extraccion == _truth("ficha_06")
    assert exc.extraccion["consultas"] == []
    assert exc.extraccion["error"] == "no es una ficha clinica"
    for campo in exc.extraccion["paciente"].values():
        assert campo == {"valor": None, "confianza": "baja"}


def test_mock_sin_imagen_es_ilegible() -> None:
    for imagenes in ([], [b""], [b"", b""]):
        with pytest.raises(ErrorModulo) as excinfo:
            extraer_ficha(imagenes)
        assert excinfo.value.codigo == "ilegible"
        assert excinfo.value.extraccion["consultas"] == []
        assert excinfo.value.extraccion["error"]


def test_mock_imagen_desconocida_usa_el_ejemplo_de_phil() -> None:
    pred = extraer_ficha([b"\x89PNG\r\n\x1a\nno-es-una-fixture"])
    assert pred == EXTRACCION_EJEMPLO


def test_mock_primera_fixture_reconocida_gana() -> None:
    assert extraer_ficha([_png("ficha_05"), _png("ficha_01")]) == _truth("ficha_05")
    assert extraer_ficha([b"desconocida", _png("ficha_02")]) == _truth("ficha_02")


def test_mock_no_llama_a_la_red_aunque_haya_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SIGO_VISION_IMPL", "mock")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    def boom(*_a, **_k):
        raise AssertionError("el mock no debe llamar al proveedor")

    monkeypatch.setattr("sigo_modulos.vision._llamar_proveedor", boom)
    assert extraer_ficha([_png("ficha_01")])["paciente"]["nombre"]["valor"] == "Ana Beatriz Cumes Palala"


def test_truths_cumplen_el_esquema_de_extraccion() -> None:
    validar = _eval().validate_extraccion
    for stem in FICHAS_VALIDAS + ["ficha_06"]:
        errores = validar(_truth(stem))
        assert errores == [], stem


def test_firma_y_codigos_del_contrato() -> None:
    firma = inspect.signature(extraer_ficha)
    assert list(firma.parameters) == ["imagenes"]
    interfaces = (REPO_DIR / "backend/app/modulos/interfaces.py").read_text(encoding="utf-8")
    assert '"ilegible": (422, "ilegible")' in interfaces
    assert '"ia_no_disponible": (503, "ia_no_disponible")' in interfaces
    assert ErrorModulo("x").codigo == "ia_no_disponible"


def test_prompt_que_usa_el_modulo_esta_unificado() -> None:
    assert PROMPT_PATH.name == "prompt_vision_ficha.md"
    assert PROMPT_PATH.is_file()
    cargado = _cargar_prompt()
    assert "Qué se unificó" not in cargado
    assert ">= 0.75" in cargado
    assert "umbral_amarillo" not in cargado
    assert 'ni `"media"`' in cargado
    assert '"alta" | "media"' not in cargado
    assert "TMP-" in cargado
    assert "Ninguna" in cargado
    assert "No te quedes solo con la más reciente" in cargado
    assert "dpi_cui" in cargado
    assert "PNC" in cargado and "HTA" in cargado and "Td" in cargado
    assert "día/mes/año" in cargado
    assert "null" in cargado
    for regla in ("no guard", "confirm"):
        assert regla in cargado.casefold()


def test_umbral_float_y_vacio_y_ninguna_y_tmp() -> None:
    assert UMBRAL_ALTA == 0.75
    datos = _paciente_minimo(
        nombre={"valor": "Ana", "confianza": 0.75},
        comunidad={"valor": "Aldea", "confianza": 0.749},
        alergias={"valor": "Ninguna", "confianza": 0.2},
        condiciones_cronicas={"valor": "", "confianza": "alta"},
        dpi={"valor": "TMP-20261121-K7Q4", "confianza": "alta"},
        sexo={"valor": "Femenino", "confianza": "alta"},
    )
    datos["consultas"] = [
        {
            "fecha": {"valor": "2024-01-02", "confianza": "alta"},
            "motivo": {"valor": "Control", "confianza": 1},
            "diagnostico": {"valor": "   ", "confianza": "alta"},
            "tratamiento": {"valor": "Suero", "confianza": "alta"},
            "vacunas": {"valor": "No refiere", "confianza": "baja"},
            "pagina": 0,
        }
    ]
    out = _sanear_extraccion(datos)
    assert out["paciente"]["nombre"] == {"valor": "Ana", "confianza": "alta"}
    assert out["paciente"]["comunidad"]["confianza"] == "baja"
    assert out["paciente"]["alergias"] == {"valor": [], "confianza": "alta"}
    assert out["paciente"]["condiciones_cronicas"] == {"valor": None, "confianza": "baja"}
    assert out["paciente"]["dpi"] == {"valor": None, "confianza": "baja"}
    assert out["paciente"]["sexo"] == {"valor": None, "confianza": "baja"}
    consulta = out["consultas"][0]
    assert consulta["diagnostico"] == {"valor": None, "confianza": "baja"}
    assert consulta["vacunas"] == {"valor": [], "confianza": "alta"}
    assert consulta["motivo"]["confianza"] == "alta"
    assert "TMP-" not in json.dumps(out)


def test_dpi_con_separadores_se_queda_en_13_digitos() -> None:
    datos = _paciente_minimo(dpi={"valor": "9112-2334-45566", "confianza": "alta"})
    out = _sanear_extraccion(datos)
    assert out["paciente"]["dpi"] == {"valor": "9112233445566", "confianza": "alta"}
    corto = _sanear_extraccion(_paciente_minimo(dpi={"valor": "123", "confianza": "alta"}))
    assert corto["paciente"]["dpi"] == {"valor": None, "confianza": "baja"}


def test_forma_plana_v0_se_adapta_a_extraccion() -> None:
    plano = {
        "nombre": "Ana",
        "dpi": "9112233445566",
        "sexo": "F",
        "fecha_consulta": "03/05/2025",
        "motivo": "Tos",
        "diagnostico": None,
        "medicamentos": "Salbutamol",
    }
    out = _sanear_extraccion(plano)
    assert out["paciente"]["nombre"]["valor"] == "Ana"
    assert out["consultas"][0]["tratamiento"]["valor"] == "Salbutamol"
    assert out["consultas"][0]["pagina"] == 0
    assert out["consultas"][0]["diagnostico"]["confianza"] == "baja"


def test_null_no_puede_quedar_en_alta() -> None:
    datos = _paciente_minimo(nombre={"valor": None, "confianza": "alta"})
    out = _sanear_extraccion(datos)
    assert out["paciente"]["nombre"] == {"valor": None, "confianza": "baja"}


def test_real_sin_key_es_ia_no_disponible(monkeypatch: pytest.MonkeyPatch) -> None:
    _limpiar_claves(monkeypatch)
    monkeypatch.setenv("SIGO_VISION_IMPL", "real")
    assert proveedor_detectado() is None
    with pytest.raises(ErrorModulo) as excinfo:
        extraer_ficha([_png("ficha_01")])
    exc = excinfo.value
    assert exc.codigo == "ia_no_disponible"
    assert not hasattr(exc, "extraccion")
    assert "sk-" not in str(exc)


def test_real_elige_ollama_por_host(monkeypatch: pytest.MonkeyPatch) -> None:
    _limpiar_claves(monkeypatch)
    monkeypatch.setenv("OLLAMA_HOST", "http://127.0.0.1:11434")
    monkeypatch.setenv("OLLAMA_VISION_MODEL", "qwen2.5vl")
    assert proveedor_detectado() == "ollama"


def test_real_falla_de_red_no_crashea(monkeypatch: pytest.MonkeyPatch) -> None:
    _limpiar_claves(monkeypatch)
    monkeypatch.setenv("SIGO_VISION_IMPL", "real")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    def offline(*_a, **_k):
        raise urllib.error.URLError("offline")

    monkeypatch.setattr(urllib.request, "urlopen", offline)
    with pytest.raises(ErrorModulo) as excinfo:
        extraer_ficha([_png("ficha_01")])
    assert excinfo.value.codigo == "ia_no_disponible"
    assert "sk-test" not in str(excinfo.value)


def test_real_json_roto_es_ilegible(monkeypatch: pytest.MonkeyPatch) -> None:
    _limpiar_claves(monkeypatch)
    monkeypatch.setenv("SIGO_VISION_IMPL", "real")
    monkeypatch.setenv("XAI_API_KEY", "xai-test")
    monkeypatch.setattr("sigo_modulos.vision._llamar_proveedor", lambda *_a, **_k: "no es json")
    with pytest.raises(ErrorModulo) as excinfo:
        extraer_ficha([b"\xff\xd8\xff"])
    assert excinfo.value.codigo == "ilegible"
    assert excinfo.value.extraccion["consultas"] == []
    for campo in excinfo.value.extraccion["paciente"].values():
        assert campo == {"valor": None, "confianza": "baja"}


def test_real_no_es_ficha_lanza_ilegible_y_usa_el_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    _limpiar_claves(monkeypatch)
    monkeypatch.setenv("SIGO_VISION_IMPL", "real")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    visto: dict[str, str] = {}

    def falso(proveedor: str, prompt: str, paginas: list[bytes]) -> str:
        visto["proveedor"] = proveedor
        visto["prompt"] = prompt
        assert paginas
        return json.dumps(extraccion_ilegible("no es una ficha clinica"))

    monkeypatch.setattr("sigo_modulos.vision._llamar_proveedor", falso)
    with pytest.raises(ErrorModulo) as excinfo:
        extraer_ficha([_png("ficha_06"), _png("ficha_01")])
    assert excinfo.value.codigo == "ilegible"
    assert excinfo.value.extraccion["error"] == "no es una ficha clinica"
    assert excinfo.value.extraccion["consultas"] == []
    assert visto["proveedor"] == "anthropic"
    assert ">= 0.75" in visto["prompt"]
    assert "Ninguna" in visto["prompt"]
    assert "Qué se unificó" not in visto["prompt"]


def test_real_consulta_toda_vacia_queda_en_lista_vacia(monkeypatch: pytest.MonkeyPatch) -> None:
    _limpiar_claves(monkeypatch)
    monkeypatch.setenv("SIGO_VISION_IMPL", "real")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    vacio = {"valor": None, "confianza": "baja"}
    datos = extraccion_ilegible("imagen ilegible")
    datos["consultas"] = [
        {
            "fecha": dict(vacio),
            "motivo": dict(vacio),
            "diagnostico": dict(vacio),
            "tratamiento": dict(vacio),
            "vacunas": dict(vacio),
            "pagina": 0,
        }
    ]
    monkeypatch.setattr("sigo_modulos.vision._llamar_proveedor", lambda *_a, **_k: json.dumps(datos))
    with pytest.raises(ErrorModulo) as excinfo:
        extraer_ficha([b"\x89PNG\r\n\x1a\n"])
    assert excinfo.value.codigo == "ilegible"
    assert excinfo.value.extraccion["consultas"] == []
    assert excinfo.value.extraccion["error"] == "imagen ilegible"


def test_real_respuesta_valida_no_lanza(monkeypatch: pytest.MonkeyPatch) -> None:
    _limpiar_claves(monkeypatch)
    monkeypatch.setenv("SIGO_VISION_IMPL", "real")
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-test")
    cuerpo = _truth("ficha_01")
    monkeypatch.setattr(
        "sigo_modulos.vision._llamar_proveedor",
        lambda *_a, **_k: "```json\n" + json.dumps(cuerpo) + "\n```",
    )
    pred = extraer_ficha([b"\x89PNG\r\n\x1a\nfoto"])
    assert pred == cuerpo


def test_eval_mock_exactitud_y_cero_alucinacion(tmp_path: Path) -> None:
    salida = tmp_path / "eval_resultados.json"
    env = os.environ.copy()
    env["SIGO_VISION_IMPL"] = "mock"
    env["PYTHONPATH"] = str(VISION_DIR.parent) + os.pathsep + env.get("PYTHONPATH", "")
    proc = subprocess.run(
        [sys.executable, str(VISION_DIR / "eval.py"), "--impl", "mock", "--output", str(salida)],
        cwd=str(VISION_DIR),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr + proc.stdout
    resumen = json.loads(salida.read_text(encoding="utf-8"))
    assert resumen["impl"] == "mock"
    assert resumen["esquema_ok"] == 6
    assert resumen["exactitud_micro"] == 1
    assert resumen["tasa_alucinacion_micro"] == 0
    assert resumen["latencia_p50_s"] is not None
    assert resumen["latencia_p95_s"] is not None
    codigos = {fila["ficha"]: fila["codigo"] for fila in resumen["fichas"]}
    assert codigos["ficha_06.png"] == "ilegible"
    for stem in FICHAS_VALIDAS:
        assert codigos[f"{stem}.png"] is None

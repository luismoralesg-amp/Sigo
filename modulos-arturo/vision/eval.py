#!/usr/bin/env python3
"""Evalúa extraer_ficha() contra fixtures inventadas.

Valida el JSON contra Extraccion (contrato Phil), mide exactitud por campo,
tasa de alucinación (valor no nulo cuando el truth es null) y latencia p50/p95.

Llama a sigo_modulos.vision.extraer_ficha. El backend elige la
implementación con SIGO_VISION_IMPL=mock|real (default mock).

No imprime secretos. No confirma ni guarda expedientes.

Uso:
  python eval.py                  # mock si no hay keys; real si las hay
  python eval.py --dry-run        # solo valida fixtures y el prompt
  python eval.py --impl mock
  python eval.py --impl real      # exige API key, Ollama o VISION_BASE_URL
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any

VISION_DIR = Path(__file__).resolve().parent
MODULOS_DIR = VISION_DIR.parent
if str(MODULOS_DIR) not in sys.path:
    sys.path.insert(0, str(MODULOS_DIR))

from sigo_modulos.errores import ErrorModulo  # noqa: E402
from sigo_modulos.vision import (  # noqa: E402
    extraer_ficha,
    impl_activa,
    proveedor_detectado,
)

FIXTURES = VISION_DIR / "fixtures"
PROMPT_PATH = VISION_DIR / "prompt_vision_ficha.md"

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

SECRET_NAME_RE = re.compile(r"KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL", re.I)


def env_set(name: str) -> bool:
    return bool(os.environ.get(name))


def list_keys_safely() -> list[str]:
    """Nombres de variables presentes, sin valores."""
    interesting = [
        "SIGO_VISION_IMPL",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "GOOGLE_GENAI_API_KEY",
        "XAI_API_KEY",
        "GROQ_API_KEY",
        "MISTRAL_API_KEY",
        "TOGETHER_API_KEY",
        "OPENROUTER_API_KEY",
        "VISION_API_KEY",
        "VISION_BASE_URL",
        "OPENAI_BASE_URL",
        "OLLAMA_HOST",
        "OLLAMA_URL",
        "OLLAMA_MODEL",
        "OLLAMA_VISION_MODEL",
        "VISION_MODEL",
        "EVAL_MODEL",
        "VISION_MODE",
    ]
    found = []
    for name in interesting:
        if name in os.environ and os.environ[name]:
            # SIGO_VISION_IMPL y nombres de modelo no son secretos; igual no imprimimos valores
            # salvo el de IMPL, que es mock|real y hace falta para leer el reporte.
            if name == "SIGO_VISION_IMPL":
                found.append(f"{name}={os.environ[name]!s}")
            else:
                found.append(f"{name}=SET(len={len(os.environ[name])})")
        else:
            found.append(f"{name}=UNSET")
    known = set(interesting)
    ignore = {"GIT_CONFIG_KEY_0", "SAND_BOX_AUTH_ID", "SAND_BOX_PERSISTENT_KEYRING"}
    extras = [
        k
        for k in os.environ
        if SECRET_NAME_RE.search(k) and k not in known and k not in ignore and os.environ[k]
    ]
    if extras:
        found.append("otras_secretas_no_vision=" + ",".join(sorted(extras)))
    return found


def norm_txt(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        value = str(value)
    if not isinstance(value, str):
        return None
    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.casefold().replace("—", "-").replace("–", "-")
    text = re.sub(r"\s+", " ", text).strip(" .;,:")
    return text or None


def norm_dpi(value: Any) -> str | None:
    if value is None:
        return None
    digits = re.sub(r"\D", "", str(value))
    return digits or None


def norm_list(value: Any) -> list[str] | None:
    if value is None:
        return None
    if isinstance(value, str):
        parts = [p.strip() for p in re.split(r"[,;/]| y ", value) if p.strip()]
        return sorted({norm_txt(p) for p in parts if norm_txt(p)})
    if isinstance(value, list):
        return sorted({norm_txt(p) for p in value if norm_txt(p)})
    return None


def values_equal(path: str, truth_val: Any, pred_val: Any) -> bool:
    key = path.split(".")[-1]
    if key == "dpi":
        return norm_dpi(truth_val) == norm_dpi(pred_val)
    if key in ARRAY_FIELDS:
        return norm_list(truth_val) == norm_list(pred_val)
    if key in {"fecha", "fecha_nacimiento"}:
        return norm_txt(truth_val) == norm_txt(pred_val)
    return norm_txt(truth_val) == norm_txt(pred_val)


def resolve_path(extraccion: dict, path: str) -> Any:
    if path.startswith("paciente."):
        return (extraccion.get("paciente") or {}).get(path.split(".", 1)[1])
    m = re.fullmatch(r"consultas\[(\d+)\]\.(.+)", path)
    if not m:
        return None
    i, key = int(m.group(1)), m.group(2)
    consultas = extraccion.get("consultas") or []
    if i >= len(consultas) or not isinstance(consultas[i], dict):
        return None
    return consultas[i].get(key)


def validate_extraccion(obj: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(obj, dict):
        return ["la raiz no es un objeto"]
    if "paciente" not in obj:
        errors.append("falta paciente")
    if "consultas" not in obj:
        errors.append("falta consultas")
    paciente = obj.get("paciente")
    if paciente is not None and not isinstance(paciente, dict):
        errors.append("paciente no es un objeto")
        paciente = None
    if isinstance(paciente, dict):
        for k in PACIENTE_FIELDS:
            errors.extend(_check_campo(f"paciente.{k}", paciente.get(k), array=k in ARRAY_FIELDS, sexo=k == "sexo"))
        extra = set(paciente) - set(PACIENTE_FIELDS)
        if extra:
            errors.append(f"paciente tiene campos de mas: {sorted(extra)}")
    consultas = obj.get("consultas")
    if consultas is not None and not isinstance(consultas, list):
        errors.append("consultas no es una lista")
        consultas = None
    if isinstance(consultas, list):
        for i, item in enumerate(consultas):
            if not isinstance(item, dict):
                errors.append(f"consultas[{i}] no es un objeto")
                continue
            for k in CONSULTA_FIELDS:
                errors.extend(_check_campo(f"consultas[{i}].{k}", item.get(k), array=k in ARRAY_FIELDS))
            if "pagina" not in item:
                errors.append(f"consultas[{i}].pagina falta")
            elif not isinstance(item["pagina"], int) or isinstance(item["pagina"], bool) or item["pagina"] < 0:
                errors.append(f"consultas[{i}].pagina debe ser un entero >= 0")
            extra = set(item) - set(CONSULTA_FIELDS) - {"pagina"}
            if extra:
                errors.append(f"consultas[{i}] tiene campos de mas: {sorted(extra)}")
    if "error" in obj and obj["error"] is not None and not isinstance(obj["error"], str):
        errors.append("error debe ser string")
    return errors


def _check_campo(path: str, campo: Any, array: bool = False, sexo: bool = False) -> list[str]:
    if campo is None:
        return [f"{path} falta"]
    if not isinstance(campo, dict):
        return [f"{path} no es un objeto {{valor, confianza}}"]
    errs = []
    if "valor" not in campo:
        errs.append(f"{path}.valor falta")
    if "confianza" not in campo:
        errs.append(f"{path}.confianza falta")
    elif campo["confianza"] not in ("alta", "baja"):
        errs.append(f"{path}.confianza debe ser 'alta' o 'baja', no {campo['confianza']!r}")
    extra = set(campo) - {"valor", "confianza"}
    if extra:
        errs.append(f"{path} tiene atributos de mas: {sorted(extra)}")
    valor = campo.get("valor")
    if sexo:
        if valor not in ("F", "M", None):
            errs.append(f"{path}.valor debe ser 'F', 'M' o null")
    elif array:
        if valor is not None and (not isinstance(valor, list) or any(not isinstance(x, str) for x in valor)):
            errs.append(f"{path}.valor debe ser lista de strings o null")
    else:
        if valor is not None and not isinstance(valor, str):
            errs.append(f"{path}.valor debe ser string o null")
    if valor is None and campo.get("confianza") == "alta":
        errs.append(f"{path}: valor null debe llevar confianza 'baja'")
    return errs


def compare(truth: dict, pred: dict) -> dict:
    n_truth = len(truth.get("consultas") or [])
    n_pred = len(pred.get("consultas") or []) if isinstance(pred.get("consultas"), list) else 0
    paths = [f"paciente.{k}" for k in PACIENTE_FIELDS]
    for i in range(max(n_truth, n_pred)):
        for k in CONSULTA_FIELDS:
            paths.append(f"consultas[{i}].{k}")

    scored = []
    hallu = []
    missed = []
    conf_ok = 0
    conf_total = 0

    for path in paths:
        t_campo = resolve_path(truth, path)
        p_campo = resolve_path(pred, path)
        t_val = t_campo.get("valor") if isinstance(t_campo, dict) else None
        p_val = p_campo.get("valor") if isinstance(p_campo, dict) else None
        t_conf = t_campo.get("confianza") if isinstance(t_campo, dict) else None
        p_conf = p_campo.get("confianza") if isinstance(p_campo, dict) else None
        present = isinstance(p_campo, dict)
        if t_conf in ("alta", "baja") and p_conf in ("alta", "baja"):
            conf_total += 1
            if t_conf == p_conf:
                conf_ok += 1
        if t_val is None:
            hallu.append({"path": path, "hallucinated": present and p_val is not None, "pred": p_val})
        else:
            match = present and values_equal(path, t_val, p_val)
            scored.append({"path": path, "match": bool(match), "truth": t_val, "pred": p_val})
            if p_val is None or not present:
                missed.append(path)

    exactos = sum(1 for s in scored if s["match"])
    return {
        "campos_con_valor_en_truth": len(scored),
        "exactos": exactos,
        "exactitud": (exactos / len(scored)) if scored else None,
        "campos_null_en_truth": len(hallu),
        "alucinaciones": sum(1 for h in hallu if h["hallucinated"]),
        "tasa_alucinacion": (sum(1 for h in hallu if h["hallucinated"]) / len(hallu)) if hallu else None,
        "confianza_acordada": (conf_ok / conf_total) if conf_total else None,
        "consultas_truth": n_truth,
        "consultas_pred": n_pred,
        "detalle_errores": [s for s in scored if not s["match"]],
        "detalle_alucinaciones": [h for h in hallu if h["hallucinated"]],
        "omitidos": missed,
    }


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    xs = sorted(values)
    k = (len(xs) - 1) * p
    f = int(k)
    c = min(f + 1, len(xs) - 1)
    if f == c:
        return xs[f]
    return xs[f] + (xs[c] - xs[f]) * (k - f)


def load_fixtures(folder: Path) -> list[tuple[Path, Path, dict]]:
    items = []
    for truth_path in sorted(folder.glob("ficha_*.truth.json")):
        img = truth_path.with_name(truth_path.name.replace(".truth.json", ".png"))
        if not img.is_file():
            raise SystemExit(f"falta la imagen {img.name} para {truth_path.name}")
        truth = json.loads(truth_path.read_text(encoding="utf-8"))
        items.append((img, truth_path, truth))
    return items


def fmt_pct(x: float | None) -> str:
    if x is None:
        return "n/a"
    return f"{100 * x:.1f}%"


def run(args: argparse.Namespace) -> int:
    prompt_path = Path(args.prompt)
    fixtures_dir = Path(args.fixtures)
    if not prompt_path.is_file():
        print(f"no encuentro el prompt: {prompt_path}", file=sys.stderr)
        return 2
    fixtures = load_fixtures(fixtures_dir)
    if not fixtures:
        print(f"no hay fixtures en {fixtures_dir}", file=sys.stderr)
        return 2

    if args.impl:
        os.environ["SIGO_VISION_IMPL"] = args.impl

    print("== SIGO Visión eval ==")
    print(f"prompt: {prompt_path}")
    print(f"fixtures: {len(fixtures)} en {fixtures_dir}")
    print("función: sigo_modulos.vision.extraer_ficha(imagenes)")
    print("env (nombres y si están, nunca el valor de un secreto):")
    for line in list_keys_safely():
        print(f"  {line}")

    truth_errors = 0
    for img, truth_path, truth in fixtures:
        errs = validate_extraccion(truth)
        if errs:
            truth_errors += 1
            print(f"  truth inválido {truth_path.name}: {errs}")
    if truth_errors:
        print(f"ABORTA: {truth_errors} ground truth no cumplen Extraccion")
        return 2
    print(f"ground truth: {len(fixtures)}/{len(fixtures)} válidos contra Extraccion (Phil)")

    if (not args.impl) and args.auto_real and proveedor_detectado() and (os.environ.get("SIGO_VISION_IMPL") or "mock") == "mock":
        os.environ["SIGO_VISION_IMPL"] = "real"

    impl = impl_activa()
    proveedor = proveedor_detectado()

    if args.dry_run:
        print(f"dry-run: se habría usado SIGO_VISION_IMPL={impl} proveedor={proveedor or 'ninguno'}")
        return 0

    if impl == "real" and not proveedor:
        print(
            "SIGO_VISION_IMPL=real pero no hay API keys de visión ni OLLAMA_HOST/VISION_BASE_URL."
        )
        print(
            "para números de un modelo: exportá OPENAI_API_KEY, ANTHROPIC_API_KEY, "
            "GEMINI_API_KEY/GOOGLE_API_KEY, XAI_API_KEY, o un endpoint local "
            "(OLLAMA_HOST + OLLAMA_VISION_MODEL=qwen2.5vl:7b, o VISION_BASE_URL + VISION_MODEL)."
        )
        print("mientras tanto podés correr el mock: python eval.py --impl mock")
        return 3

    print(f"SIGO_VISION_IMPL={impl}  proveedor={proveedor or 'ninguno (mock determinista)'}")
    if impl == "mock":
        print(
            "aviso: el mock es determinista (hash de fixture -> ground truth; "
            "imagen desconocida -> ejemplo inventado de Phil). Estos números no son de un modelo."
        )

    latencias: list[float] = []
    filas = []
    json_ok = 0
    schema_ok = 0

    for img, truth_path, truth in fixtures:
        t0 = time.perf_counter()
        pred = None
        parse_error = None
        codigo = None
        try:
            pred = extraer_ficha([img.read_bytes()])
        except ErrorModulo as exc:
            codigo = getattr(exc, "codigo", None)
            parse_error = f"ErrorModulo(codigo={codigo}): {exc}"
            # ilegible: la Extraccion (null+"baja", consultas [], error) viene en exc.extraccion
            if codigo == "ilegible" and getattr(exc, "extraccion", None):
                pred = exc.extraccion
        except Exception as exc:  # noqa: BLE001
            parse_error = f"{type(exc).__name__}: {exc}"
        elapsed = time.perf_counter() - t0
        latencias.append(elapsed)

        schema_errs: list[str] = []
        metrics = None
        if pred is not None:
            json_ok += 1
            schema_errs = validate_extraccion(pred)
            if not schema_errs:
                schema_ok += 1
                metrics = compare(truth, pred)
        fila = {
            "ficha": img.name,
            "latencia_s": round(elapsed, 3),
            "json_valido": pred is not None,
            "esquema_ok": bool(pred is not None and not schema_errs),
            "errores_esquema": schema_errs,
            "error": parse_error,
            "codigo": codigo,
            "metricas": metrics,
        }
        filas.append(fila)
        acc = fmt_pct(metrics["exactitud"]) if metrics else "n/a"
        hall = fmt_pct(metrics["tasa_alucinacion"]) if metrics else "n/a"
        extra = ""
        if codigo:
            extra = f"  codigo={codigo}"
        print(
            f"  {img.name}: {elapsed:.2f}s  json={fila['json_valido']}  "
            f"esquema={fila['esquema_ok']}  exactitud={acc}  alucinacion={hall}{extra}"
        )
        if truth.get("error") and (not pred or not pred.get("error")):
            print(f"    miss error: truth={truth.get('error')!r} pred={(pred or {}).get('error')!r}")
        if parse_error:
            print(f"    error: {parse_error}")
        if schema_errs:
            print(f"    esquema: {schema_errs}")
        if metrics and metrics["detalle_errores"]:
            for err in metrics["detalle_errores"][:8]:
                print(f"    miss {err['path']}: truth={err['truth']!r} pred={err['pred']!r}")
        if metrics and metrics["detalle_alucinaciones"]:
            for h in metrics["detalle_alucinaciones"]:
                print(f"    hallu {h['path']}: pred={h['pred']!r}")

    accs = [f["metricas"]["exactitud"] for f in filas if f["metricas"] and f["metricas"]["exactitud"] is not None]
    halls = [
        f["metricas"]["tasa_alucinacion"]
        for f in filas
        if f["metricas"] and f["metricas"]["tasa_alucinacion"] is not None
    ]
    exactos = sum(f["metricas"]["exactos"] for f in filas if f["metricas"])
    total_val = sum(f["metricas"]["campos_con_valor_en_truth"] for f in filas if f["metricas"])
    hallu_n = sum(f["metricas"]["alucinaciones"] for f in filas if f["metricas"])
    hallu_d = sum(f["metricas"]["campos_null_en_truth"] for f in filas if f["metricas"])

    resumen = {
        "impl": impl,
        "proveedor": proveedor,
        "n_fichas": len(filas),
        "json_valido": json_ok,
        "esquema_ok": schema_ok,
        "exactitud_micro": (exactos / total_val) if total_val else None,
        "exactitud_macro": statistics.mean(accs) if accs else None,
        "tasa_alucinacion_micro": (hallu_n / hallu_d) if hallu_d else None,
        "tasa_alucinacion_macro": statistics.mean(halls) if halls else None,
        "latencia_p50_s": percentile(latencias, 0.50),
        "latencia_p95_s": percentile(latencias, 0.95),
        "latencias_s": [round(x, 3) for x in latencias],
        "fichas": filas,
        "aviso": "DATOS INVENTADOS PARA DEMO. Nada de esto queda confirmado ni se guarda en un expediente.",
    }
    out_path = Path(args.output)
    out_path.write_text(json.dumps(resumen, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("-- resumen --")
    print(f"impl={impl}  json válido: {json_ok}/{len(filas)}  esquema ok: {schema_ok}/{len(filas)}")
    print(
        f"exactitud micro: {fmt_pct(resumen['exactitud_micro'])}  "
        f"macro: {fmt_pct(resumen['exactitud_macro'])}"
    )
    print(
        f"alucinación micro: {fmt_pct(resumen['tasa_alucinacion_micro'])}  "
        f"macro: {fmt_pct(resumen['tasa_alucinacion_macro'])}"
    )
    p50, p95 = resumen["latencia_p50_s"], resumen["latencia_p95_s"]
    if p50 is not None and p95 is not None:
        print(f"latencia p50: {p50:.3f}s  p95: {p95:.3f}s")
    print(f"resultado: {out_path}")
    if impl == "mock":
        print("estos números son del mock determinista, no de un modelo de visión.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Eval de extraer_ficha (SIGO Visión)")
    parser.add_argument("--fixtures", default=str(FIXTURES))
    parser.add_argument("--prompt", default=str(PROMPT_PATH))
    parser.add_argument("--output", default=str(VISION_DIR / "eval_resultados.json"))
    parser.add_argument("--impl", choices=["mock", "real"], help="Fuerza SIGO_VISION_IMPL")
    parser.add_argument(
        "--auto-real",
        action="store_true",
        help="Si hay API key o Ollama, usa SIGO_VISION_IMPL=real (si no se pasó --impl)",
    )
    parser.add_argument("--dry-run", action="store_true", help="No llama a extraer_ficha")
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())

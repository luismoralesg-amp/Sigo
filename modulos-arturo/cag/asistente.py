"""Preguntar al CAG: arma el contexto, llama a Ollama y valida las fuentes.

Nunca escribe el expediente. Si una cita no existe, se descarta; si no queda
ninguna fuente válida, la respuesta pasa a "Eso no está en el expediente."
"""

from __future__ import annotations

import copy
import json
import re
from typing import Any

from .expediente import (
    CAMPOS_CONSULTA,
    CAMPOS_PACIENTE,
    MENSAJE_EMERGENCIA,
    MENSAJE_FUERA,
    armar_prefijo,
    clave_cache,
    es_emergencia,
    id_paciente,
    indice_consultas,
    recorte_emergencia,
    serializar,
    tipo_de_acceso,
)
from .ollama_cliente import OllamaCliente, OllamaNoDisponible

# Las pruebas inyectan un cliente falso aquí. No forma parte de la interfaz pública.
_cliente_override: OllamaCliente | None = None

# Palabras que, en acceso de emergencia, salen del recorte visible.
_FUERA_EMERGENCIA = re.compile(
    r"vacun|consulta|tratamient|recet|diagnost|diagnóst|motivo|"
    r"ltima visita|ultima visita|l[ií]nea de tiempo|ficha|"
    r"exportar|versi[oó]n de la consulta|medicamento recet",
    re.IGNORECASE,
)
_DENTRO_EMERGENCIA = re.compile(
    r"alerg|al[eé]rg|penicilin|amoxicilin|ampicilin|cr[oó]nic|"
    r"hipertens|diabetes|asma|padecim|condici[oó]n",
    re.IGNORECASE,
)
_DICE_NO_ESTA = re.compile(
    r"no est[aá] en el expediente|no lo encontr|no aparece|no figur",
    re.IGNORECASE,
)


def _pregunta_fuera_de_emergencia(pregunta: str) -> bool:
    texto = pregunta or ""
    if _DENTRO_EMERGENCIA.search(texto):
        return False
    return bool(_FUERA_EMERGENCIA.search(texto))


def extraer_json(texto: str) -> dict[str, Any]:
    """Acepta JSON puro o envuelto en un fence markdown."""
    if not texto or not str(texto).strip():
        return {"respuesta": MENSAJE_FUERA, "fuentes": []}
    crudo = str(texto).strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", crudo, re.DOTALL | re.IGNORECASE)
    if fence:
        crudo = fence.group(1)
    else:
        inicio = crudo.find("{")
        fin = crudo.rfind("}")
        if inicio != -1 and fin > inicio:
            crudo = crudo[inicio : fin + 1]
    try:
        data = json.loads(crudo)
    except json.JSONDecodeError:
        return {"respuesta": MENSAJE_FUERA, "fuentes": []}
    if not isinstance(data, dict):
        return {"respuesta": MENSAJE_FUERA, "fuentes": []}
    return data


def _fuente_paciente(paciente: dict[str, Any], campo: str) -> dict[str, Any]:
    return {
        "consulta_id": "",
        "version": int(paciente.get("version") or 1),
        "original_url": "",
        "campo": campo,
    }


def _fuente_consulta(consulta: dict[str, Any], campo: str) -> dict[str, Any]:
    return {
        "consulta_id": str(consulta["id"]),
        "version": int(consulta.get("version") or 1),
        "original_url": str(consulta.get("original_url") or ""),
        "campo": campo,
    }


def validar_fuentes(
    fuentes: Any,
    expediente: dict[str, Any],
    tipo_acceso: str | None = None,
) -> tuple[list[dict[str, Any]], bool]:
    """Devuelve (fuentes válidas normalizadas, hubo_inventadas).

    Una cita inventada (consulta_id o campo que no existen) se descarta.
    Si el original_url o la versión no coinciden pero la consulta sí existe,
    se corrigen con los datos reales del expediente (no se inventa otra fuente).
    """
    if es_emergencia(tipo_acceso):
        visible = recorte_emergencia(expediente)
    else:
        visible = expediente
    paciente = visible.get("paciente") or {}
    consultas = indice_consultas(visible)
    validas: list[dict[str, Any]] = []
    hubo_inventadas = False
    if not isinstance(fuentes, list):
        return [], bool(fuentes)

    for raw in fuentes:
        if not isinstance(raw, dict):
            hubo_inventadas = True
            continue
        campo = str(raw.get("campo") or "").strip()
        consulta_id = raw.get("consulta_id")
        consulta_id = "" if consulta_id is None else str(consulta_id).strip()

        if campo in CAMPOS_PACIENTE:
            if consulta_id in {"", "paciente", str(paciente.get("id") or ""), str(paciente.get("dpi") or "")}:
                validas.append(_fuente_paciente(paciente, campo))
                continue
            # Aceptamos un campo de paciente aunque el modelo haya puesto un consulta_id:
            # la fuente real es el paciente, no esa consulta.
            validas.append(_fuente_paciente(paciente, campo))
            continue

        if es_emergencia(tipo_acceso):
            hubo_inventadas = True
            continue

        if campo not in CAMPOS_CONSULTA or not consulta_id or consulta_id not in consultas:
            hubo_inventadas = True
            continue
        validas.append(_fuente_consulta(consultas[consulta_id], campo))

    # únicos, conservando orden
    vistos: set[tuple[str, str, int]] = set()
    unicas: list[dict[str, Any]] = []
    for f in validas:
        k = (f["consulta_id"], f["campo"], f["version"])
        if k in vistos:
            continue
        vistos.add(k)
        unicas.append(f)
    return unicas, hubo_inventadas


def _respuesta_cag(respuesta: str, fuentes: list[dict[str, Any]]) -> dict[str, Any]:
    return {"respuesta": respuesta, "fuentes": fuentes}


def preguntar(expediente: dict[str, Any], pregunta: str) -> dict[str, Any]:
    """Firma oficial: `preguntar(expediente, pregunta) -> {respuesta, fuentes}`.

    El modo emergencia se lee del expediente (marca `tipo_acceso`,
    `emergencia=True` o `acceso.tipo`). Si viene la marca, se recorta a
    alergias y condiciones crónicas. Si el backend ya mandó el expediente
    filtrado, se usa tal cual. No muta el dict recibido.
    """
    original = expediente
    expediente = copy.deepcopy(expediente)
    tipo_acceso = tipo_de_acceso(expediente)

    if es_emergencia(tipo_acceso) and _pregunta_fuera_de_emergencia(pregunta):
        return _respuesta_cag(MENSAJE_EMERGENCIA, [])

    prefijo = armar_prefijo(expediente, tipo_acceso)
    clave = clave_cache(expediente, tipo_acceso)
    propio = _cliente_override is None
    cliente = _cliente_override or OllamaCliente()
    try:
        crudo = cliente.generar(clave, prefijo, pregunta)
    finally:
        if propio:
            cliente.close()

    parsed = extraer_json(crudo)
    respuesta = str(parsed.get("respuesta") or "").strip()
    fuentes_ok, hubo_inventadas = validar_fuentes(parsed.get("fuentes"), expediente, tipo_acceso)

    if es_emergencia(tipo_acceso):
        # Si el modelo se salió del recorte, no devolvemos esas afirmaciones.
        if hubo_inventadas and not fuentes_ok:
            return _respuesta_cag(MENSAJE_EMERGENCIA, [])
        if not fuentes_ok and not _DICE_NO_ESTA.search(respuesta):
            if _pregunta_fuera_de_emergencia(pregunta) or not _DENTRO_EMERGENCIA.search(pregunta or ""):
                if respuesta != MENSAJE_FUERA:
                    return _respuesta_cag(MENSAJE_EMERGENCIA, [])

    if hubo_inventadas and not fuentes_ok:
        return _respuesta_cag(MENSAJE_FUERA, [])
    if not fuentes_ok and not _DICE_NO_ESTA.search(respuesta):
        return _respuesta_cag(MENSAJE_FUERA, [])
    if not respuesta:
        return _respuesta_cag(MENSAJE_FUERA, [])

    # Garantía de solo lectura: el dict original no se toca (deepcopy + nunca se escribe).
    assert original is not expediente
    return _respuesta_cag(respuesta, fuentes_ok)


def precalentar(expediente: dict[str, Any]) -> None:
    """Warm-up del prefijo sistema+expediente para un paciente/modo."""
    expediente = copy.deepcopy(expediente)
    tipo_acceso = tipo_de_acceso(expediente)
    prefijo = armar_prefijo(expediente, tipo_acceso)
    clave = clave_cache(expediente, tipo_acceso)
    propio = _cliente_override is None
    cliente = _cliente_override or OllamaCliente()
    try:
        cliente.precalentar(clave, prefijo)
    finally:
        if propio:
            cliente.close()


# Reexportados para quien importe este módulo.
__all__ = [
    "MENSAJE_EMERGENCIA",
    "MENSAJE_FUERA",
    "OllamaNoDisponible",
    "extraer_json",
    "id_paciente",
    "precalentar",
    "preguntar",
    "serializar",
    "validar_fuentes",
]

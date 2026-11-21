"""Serialización compacta del expediente y recorte para acceso de emergencia.

El texto del prefijo (sistema + expediente) debe ser idéntico en cada pregunta
del mismo paciente y modo, para que Ollama reúse la caché KV.
"""

from __future__ import annotations

import json
from typing import Any

CAMPOS_CONSULTA = (
    "fecha",
    "centro",
    "motivo",
    "diagnostico",
    "tratamiento",
    "vacunas",
    "original_url",
)
CAMPOS_PACIENTE = ("alergias", "condiciones_cronicas")

MENSAJE_EMERGENCIA = "no está disponible en acceso de emergencia"
MENSAJE_FUERA = "Eso no está en el expediente."


def id_paciente(expediente: dict[str, Any]) -> str:
    pac = expediente.get("paciente") or expediente
    return str(pac.get("id") or pac.get("dpi") or "")


def marca_emergencia(expediente: dict[str, Any] | None) -> bool:
    """Detecta la marca de acceso de emergencia en el expediente.

    Acepta las formas que puede mandar el backend:
    `tipo_acceso == "emergencia"`, `emergencia is True`, o
    `acceso.tipo == "emergencia"`.
    """
    if not expediente or not isinstance(expediente, dict):
        return False
    if expediente.get("tipo_acceso") == "emergencia":
        return True
    if expediente.get("emergencia") is True:
        return True
    acceso = expediente.get("acceso")
    if isinstance(acceso, dict) and acceso.get("tipo") == "emergencia":
        return True
    return False


def tipo_de_acceso(expediente: dict[str, Any] | None = None, tipo_acceso: str | None = None) -> str:
    """Resuelve el modo. Un tipo explícito gana (helpers); si no, se lee la marca."""
    if tipo_acceso:
        return "emergencia" if tipo_acceso == "emergencia" else tipo_acceso
    return "emergencia" if marca_emergencia(expediente) else "codigo"


def es_emergencia(tipo_acceso: str | None = None, expediente: dict[str, Any] | None = None) -> bool:
    if tipo_acceso:
        return tipo_acceso == "emergencia"
    return marca_emergencia(expediente)


def recorte_emergencia(expediente: dict[str, Any]) -> dict[str, Any]:
    """Solo alergias y condiciones crónicas (regla de acceso de emergencia).

    Se deja el id del paciente para la clave de caché y para citar `version`.
    No se incluyen consultas, vacunas, tratamientos ni alertas de medicamentos.
    """
    pac = expediente.get("paciente") or {}
    return {
        "paciente": {
            "id": pac.get("id"),
            "version": pac.get("version", 1),
            "alergias": list(pac.get("alergias") or []),
            "condiciones_cronicas": list(pac.get("condiciones_cronicas") or []),
        },
        "alertas": {
            "alergias": list((expediente.get("alertas") or {}).get("alergias") or pac.get("alergias") or []),
            "condiciones_cronicas": list(
                (expediente.get("alertas") or {}).get("condiciones_cronicas")
                or pac.get("condiciones_cronicas")
                or []
            ),
            "medicamentos": [],
        },
        "consultas": [],
        "acceso_vence_en": expediente.get("acceso_vence_en"),
        "tipo_acceso": "emergencia",
    }


def _nombre_centro(centro: Any) -> str:
    if isinstance(centro, dict):
        return str(centro.get("nombre") or centro.get("id") or "")
    return "" if centro is None else str(centro)


def _compactar(valor: Any) -> str:
    if valor is None or valor == [] or valor == "":
        return "—"
    if isinstance(valor, list):
        return ", ".join(str(v) for v in valor) if valor else "—"
    if isinstance(valor, dict):
        return _nombre_centro(valor) or json.dumps(valor, ensure_ascii=False, separators=(",", ":"))
    return str(valor)


def serializar(expediente: dict[str, Any], tipo_acceso: str | None = None) -> str:
    """Bloque compacto, estable, con IDs de consulta y versión."""
    tipo_acceso = tipo_de_acceso(expediente, tipo_acceso)
    if es_emergencia(tipo_acceso):
        expediente = recorte_emergencia(expediente)
    pac = expediente.get("paciente") or {}
    lineas = [
        f"PACIENTE id={pac.get('id') or '—'} version={pac.get('version', 1)}",
        f"ALERGIAS: {_compactar(pac.get('alergias'))}",
        f"CONDICIONES_CRONICAS: {_compactar(pac.get('condiciones_cronicas'))}",
    ]
    if es_emergencia(tipo_acceso):
        lineas.append("CONSULTAS: (no disponibles en acceso de emergencia)")
        return "\n".join(lineas)

    consultas = list(expediente.get("consultas") or [])
    if not consultas:
        lineas.append("CONSULTAS: (ninguna)")
        return "\n".join(lineas)

    lineas.append("CONSULTAS:")
    for c in consultas:
        centro = _nombre_centro(c.get("centro"))
        lineas.append(
            "  "
            + " ".join(
                [
                    f"id={c.get('id')}",
                    f"version={c.get('version', 1)}",
                    f"fecha={_compactar(c.get('fecha'))}",
                    f"centro={centro or '—'}",
                    f"motivo={_compactar(c.get('motivo'))}",
                    f"diagnostico={_compactar(c.get('diagnostico'))}",
                    f"tratamiento={_compactar(c.get('tratamiento'))}",
                    f"vacunas={_compactar(c.get('vacunas'))}",
                    f"original_url={_compactar(c.get('original_url'))}",
                ]
            )
        )
    return "\n".join(lineas)


def armar_prefijo(expediente: dict[str, Any], tipo_acceso: str | None = None) -> str:
    """Prefijo idéntico por (paciente, modo). Va en el mensaje de sistema."""
    tipo_acceso = tipo_de_acceso(expediente, tipo_acceso)
    reglas = [
        "Eres el asistente de solo lectura de SIGO.",
        "Contestás únicamente con lo que está en el expediente que sigue.",
        "No inventás datos. No modificás ni corregís el expediente. Es solo lectura.",
        f'Si un dato no está en el expediente, la respuesta debe ser exactamente "{MENSAJE_FUERA}" y fuentes debe ser [].',
        "Cada afirmación debe citar su fuente.",
        "Respondé SOLO un JSON con esta forma exacta, sin markdown:",
        '{"respuesta":"...","fuentes":[{"consulta_id":"...","version":1,"original_url":"...","campo":"..."}]}',
        "campo debe ser uno de: fecha, centro, motivo, diagnostico, tratamiento, vacunas, alergias, condiciones_cronicas.",
        'Para alergias o condiciones crónicas del paciente (no de una consulta), usá consulta_id "", version igual a la version del paciente y original_url "".',
        "DATOS INVENTADOS PARA EL DEMO. No es un paciente real.",
    ]
    if es_emergencia(tipo_acceso):
        reglas.append(
            'MODO: acceso de emergencia. Solo podés usar alergias y condiciones_cronicas. '
            "Si la pregunta pide cualquier otra cosa (consultas, vacunas, tratamientos, "
            "fechas de visita, medicamentos recetados, diagnósticos, datos de identificación), "
            f'la respuesta debe ser exactamente "{MENSAJE_EMERGENCIA}" y fuentes debe ser [].'
        )
    return "\n".join(reglas) + "\n\nEXPEDIENTE:\n" + serializar(expediente, tipo_acceso)


def indice_consultas(expediente: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(c["id"]): c for c in (expediente.get("consultas") or []) if c.get("id")}


def clave_cache(expediente: dict[str, Any], tipo_acceso: str | None = None) -> str:
    tipo_acceso = tipo_de_acceso(expediente, tipo_acceso)
    return f"{id_paciente(expediente)}|{tipo_acceso}|{serializar(expediente, tipo_acceso)}"

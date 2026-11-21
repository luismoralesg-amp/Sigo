"""Asistente mock: busca palabras de la pregunta en el expediente y cita la consulta.
No usa IA y nunca inventa: si no encuentra nada, lo dice."""

from __future__ import annotations

import re
import unicodedata

CAMPOS = ("motivo", "diagnostico", "tratamiento", "vacunas", "fecha")
VACIAS = {"cual", "cuando", "fue", "su", "la", "el", "de", "que", "es", "en", "los", "las", "un", "una",
          "tiene", "ultima", "ultimo", "a", "le", "se", "por", "con", "del", "al", "hay", "y", "o"}
SINONIMOS = {"vacuna": "vacunas", "vacunas": "vacunas", "medicamento": "tratamiento", "medicina": "tratamiento",
             "tratamiento": "tratamiento", "diagnostico": "diagnostico", "motivo": "motivo"}


def _norm(t: str) -> str:
    return unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()


def preguntar(expediente: dict, pregunta: str) -> dict:
    palabras = [p for p in re.findall(r"[a-z0-9]+", _norm(pregunta)) if p not in VACIAS and len(p) > 2]
    paciente = expediente.get("paciente") or {}
    if any(p.startswith("alerg") for p in palabras):
        alergias = paciente.get("alergias") or []
        texto = ", ".join(alergias) if alergias else "ninguna registrada"
        return {"respuesta": f"Alergias registradas: {texto}.", "fuentes": []}

    campos_pedidos = {SINONIMOS[p] for p in palabras if p in SINONIMOS}
    fuentes = []
    respuesta = None
    for c in expediente.get("consultas") or []:  # de la más reciente a la más antigua
        for campo in (campos_pedidos or CAMPOS):
            valor = c.get(campo)
            texto = ", ".join(valor) if isinstance(valor, list) else str(valor or "")
            if not texto:
                continue
            if campos_pedidos or any(p in _norm(texto) for p in palabras):
                fuentes.append({"consulta_id": c["id"], "version": c["version"],
                                "original_url": c.get("original_url", ""), "campo": campo})
                respuesta = respuesta or f"{campo.capitalize()}: {texto} (consulta del {c.get('fecha') or 's/f'}, {c['centro']['nombre']})."
        if fuentes:
            break
    if not fuentes:
        return {"respuesta": "No lo encontré en el expediente.", "fuentes": []}
    return {"respuesta": respuesta + " [respuesta del modo mock, sin IA]", "fuentes": fuentes}

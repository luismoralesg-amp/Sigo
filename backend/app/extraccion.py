"""Normaliza una extracción al contrato v1.

La confianza numérica 0-1 del borrador v0 queda obsoleta: solo sale "alta" o "baja".
"""

from __future__ import annotations

from .dpi import depurar_cui, es_identificador_temporal, normalizar_cui, validar_cui


def extraccion_ilegible(mensaje: str) -> dict:
    """Todo null, confianza baja, sin consultas. La fila o la ficha no se puede confirmar."""

    def vacio(lista: bool = False) -> dict:
        return {"valor": [] if lista else None, "confianza": "baja"}

    return {
        "error": mensaje or "No se pudo leer la ficha.",
        "paciente": {
            "nombre": vacio(),
            "dpi": vacio(),
            "fecha_nacimiento": vacio(),
            "sexo": vacio(),
            "comunidad": vacio(),
            "alergias": vacio(True),
            "condiciones_cronicas": vacio(True),
        },
        "consultas": [],
    }


def _confianza(valor, declarada) -> str:
    if declarada == "baja":
        return "baja"
    if isinstance(declarada, (int, float)):
        return "alta" if float(declarada) >= 0.8 else "baja"
    if declarada == "alta":
        return "alta"
    if valor is None or valor == "" or valor == []:
        return "baja"
    return "baja"


def normalizar_sexo(campo: dict | None) -> dict:
    campo = campo or {}
    valor = campo.get("valor")
    if isinstance(valor, str) and valor.strip().upper() in {"F", "M"}:
        limpio = valor.strip().upper()
        return {"valor": limpio, "confianza": _confianza(limpio, campo.get("confianza"))}
    return {"valor": None, "confianza": "baja"}


def normalizar_dpi_campo(campo: dict | None) -> dict:
    """Un CUI de 13 dígitos que no pasa el verificador se conserva, con confianza baja.

    No es, por sí solo, una fila ilegible: la enfermera lo revisa.
    """
    campo = campo or {}
    bruto = campo.get("valor")
    if bruto is None or str(bruto).strip() == "":
        return {"valor": None, "confianza": "baja"}
    texto = str(bruto).strip()
    if es_identificador_temporal(texto):
        return {"valor": texto.upper(), "confianza": _confianza(texto, campo.get("confianza"))}
    cui = normalizar_cui(texto)
    if len(cui) != 13:
        digitos = depurar_cui(texto) or None
        return {"valor": digitos, "confianza": "baja"}
    resultado = validar_cui(cui)
    confianza = "alta"
    if (not resultado.valido) or resultado.advertencias or campo.get("confianza") == "baja":
        confianza = "baja"
    declarada = campo.get("confianza")
    if isinstance(declarada, (int, float)) and float(declarada) < 0.8:
        confianza = "baja"
    return {"valor": cui, "confianza": confianza}


def _texto(campo: dict | None) -> dict:
    campo = campo or {}
    valor = campo.get("valor")
    if isinstance(valor, str):
        valor = valor.strip() or None
    elif valor is not None:
        valor = str(valor).strip() or None
    return {"valor": valor, "confianza": _confianza(valor, campo.get("confianza"))}


def _lista(campo: dict | None) -> dict:
    campo = campo or {}
    valor = campo.get("valor")
    if valor is None or valor == "":
        valor = []
    elif not isinstance(valor, list):
        valor = [p.strip() for p in str(valor).replace(";", ",").split(",") if p.strip()]
    else:
        valor = [str(v).strip() for v in valor if str(v).strip()]
    return {"valor": valor, "confianza": _confianza(valor, campo.get("confianza"))}


def normalizar_extraccion(extr: dict | None, *, forzar_pagina_0: bool = False) -> dict:
    if not isinstance(extr, dict):
        return extraccion_ilegible("No se pudo leer la ficha.")
    if extr.get("error"):
        return extraccion_ilegible(str(extr["error"]))
    paciente_in = extr.get("paciente") or {}
    paciente = {
        "nombre": _texto(paciente_in.get("nombre")),
        "dpi": normalizar_dpi_campo(paciente_in.get("dpi")),
        "fecha_nacimiento": _texto(paciente_in.get("fecha_nacimiento")),
        "sexo": normalizar_sexo(paciente_in.get("sexo")),
        "comunidad": _texto(paciente_in.get("comunidad")),
        "alergias": _lista(paciente_in.get("alergias")),
        "condiciones_cronicas": _lista(paciente_in.get("condiciones_cronicas")),
    }
    consultas = []
    for cruda in extr.get("consultas") or []:
        if not isinstance(cruda, dict):
            continue
        pagina = 0 if forzar_pagina_0 or cruda.get("pagina") is None else int(cruda.get("pagina") or 0)
        consultas.append(
            {
                "fecha": _texto(cruda.get("fecha")),
                "motivo": _texto(cruda.get("motivo")),
                "diagnostico": _texto(cruda.get("diagnostico")),
                "tratamiento": _texto(cruda.get("tratamiento")),
                "vacunas": _lista(cruda.get("vacunas")),
                "pagina": pagina,
            }
        )
    return {"paciente": paciente, "consultas": consultas}

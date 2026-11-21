"""Sesión, roles y bloqueo por intentos (S-03).

No hay tokens fijos. dev-paciente, dev-enfermera y dev-medico no abren sesión.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Annotated

from fastapi import Depends, Header

from . import tiempo
from .config import config
from .datos import PERSONAL, almacen
from .errores import MENSAJES, ErrorSigo, error

TOKENS_FIJOS = {"dev-paciente", "dev-enfermera", "dev-medico"}


def usuario_publico(usuario: dict) -> dict:
    return {
        "id": usuario["id"],
        "nombre": usuario["nombre"],
        "rol": usuario["rol"],
        "centro": usuario["centro"],
        "paciente_id": usuario["paciente_id"],
        "debe_cambiar_pin": usuario["debe_cambiar_pin"],
    }


def _materializar_personal(persona: dict) -> dict:
    from .datos import CENTROS

    return {
        "id": persona["id"],
        "nombre": persona["nombre"],
        "rol": persona["rol"],
        "centro": dict(CENTROS[persona["centro_id"]]),
        "paciente_id": None,
        "debe_cambiar_pin": False,
        "centro_id": persona["centro_id"],
    }


def _materializar_paciente(paciente_id: str) -> dict:
    paciente = almacen.paciente(paciente_id)
    if not paciente:
        raise error(401, "sin_sesion", MENSAJES["sin_sesion"])
    meta = almacen.pacientes_meta[paciente_id]
    return {
        "id": paciente["id"],
        "nombre": paciente["nombre"],
        "rol": "paciente",
        "centro": None,
        "paciente_id": paciente["id"],
        "debe_cambiar_pin": bool(meta["debe_cambiar_pin"]),
        "centro_id": None,
    }


def _b64url(data: bytes) -> bytes:
    return base64.urlsafe_b64decode(data + b"=" * (-len(data) % 4))


def _usuario_de_jwt(token: str) -> dict | None:
    secreto = config().supabase_jwt_secret
    if not secreto or token.count(".") != 2:
        return None
    try:
        header_b64, payload_b64, firma_b64 = token.split(".")
        header = json.loads(_b64url(header_b64.encode()))
        if header.get("alg") != "HS256":
            return None
        esperada = hmac.new(
            secreto.encode(),
            f"{header_b64}.{payload_b64}".encode(),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(_b64url(firma_b64.encode()), esperada):
            return None
        claims = json.loads(_b64url(payload_b64.encode()))
        exp = claims.get("exp")
        if exp is not None and float(exp) <= tiempo.ahora().timestamp():
            return None
        correo = claims.get("email")
        persona = next((p for p in PERSONAL.values() if p["correo"] == correo), None)
        if not persona:
            return None
        return _materializar_personal(persona)
    except (ValueError, json.JSONDecodeError, KeyError):
        return None


def usuario_desde_token(token: str) -> dict:
    if not token or token in TOKENS_FIJOS:
        raise error(401, "sin_sesion", MENSAJES["sin_sesion"])
    sesion = almacen.sesion(token)
    if sesion:
        if sesion["rol"] == "paciente":
            return _materializar_paciente(sesion["usuario_id"])
        persona = PERSONAL.get(sesion["usuario_id"])
        if not persona:
            raise error(401, "sin_sesion", MENSAJES["sin_sesion"])
        return _materializar_personal(persona)
    jwt_usuario = _usuario_de_jwt(token)
    if jwt_usuario:
        return jwt_usuario
    raise error(401, "sin_sesion", MENSAJES["sin_sesion"])


def usuario_actual(authorization: Annotated[str | None, Header()] = None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise error(401, "sin_sesion", MENSAJES["sin_sesion"])
    token = authorization.split(" ", 1)[1].strip()
    return usuario_desde_token(token)


UsuarioDep = Annotated[dict, Depends(usuario_actual)]


def exige_rol(usuario: dict, *roles: str) -> None:
    if usuario["rol"] not in roles:
        raise error(403, "rol_no_permitido", MENSAJES["rol_no_permitido"])


def exigir_libre(tipo: str, clave: str) -> None:
    if almacen.bloqueado(tipo, clave):
        raise error(429, "demasiados_intentos", MENSAJES["demasiados_intentos"])


def fallo_pin(clave: str) -> ErrorSigo:
    if almacen.anotar_fallo("pin", clave):
        return error(429, "demasiados_intentos", MENSAJES["demasiados_intentos"])
    return error(401, "pin_incorrecto", MENSAJES["pin_incorrecto"])


def rechazar_si_emergencia(usuario: dict, paciente_id: str) -> None:
    """403 solo_emergencia antes de tocar asistente, versiones o exportación.

    Solo mira la bitácora de accesos. No llama módulos de visión, importación,
    CAG ni exportación.
    """
    if usuario["rol"] != "medico":
        return
    acceso = almacen.acceso_vigente(usuario["id"], paciente_id)
    if acceso and acceso["tipo"] == "emergencia":
        raise error(403, "solo_emergencia", MENSAJES["solo_emergencia"])

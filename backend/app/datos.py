"""Almacén en memoria con datos INVENTADOS para el demo.

Aviso (C-02): hoy el almacén vive en memoria y se reinicia en cada arranque.
Pasar a Supabase (Postgres + Storage) usa backend/supabase/esquema.sql.
Las semillas están en Python (no leen ../contrato), así que backend/ arranca solo (C-03).
"""

from __future__ import annotations

import copy
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Any

from . import tiempo

CENTROS: dict[str, dict[str, Any]] = {
    "c_01": {
        "id": "c_01",
        "nombre": "Puesto de Salud Aldea Chuicacá",
        "tipo": "puesto",
        "municipio": "Totonicapán",
        "departamento": "Totonicapán",
    },
    "c_02": {
        "id": "c_02",
        "nombre": "Hospital Regional de Quetzaltenango",
        "tipo": "hospital",
        "municipio": "Quetzaltenango",
        "departamento": "Quetzaltenango",
    },
}

# Personal de prueba. En producción entran con Supabase Auth; se enlazan por correo.
PERSONAL: dict[str, dict[str, Any]] = {
    "u_01": {"id": "u_01", "nombre": "Ana Tzul", "rol": "enfermera", "centro_id": "c_01", "correo": "ana.tzul@sigo.demo"},
    "u_02": {"id": "u_02", "nombre": "Dr. Mario Xicará", "rol": "medico", "centro_id": "c_02", "correo": "mario.xicara@sigo.demo"},
}

PIN_ROSA = "482193"
# Semilla de 6 dígitos, igual que el PIN de Rosa. El valor anterior (2580) ya no entra.
PIN_MATEO = "258036"
# El ejemplo de Phil (2547896310801) no pasa el dígito verificador: módulo 11 da 3.
# Este CUI es inventado, mismo correlativo y municipio, con el dígito correcto.
DPI_ROSA = "2547896330801"
DPI_MATEO = "TMP-20261121-K7Q4"


def hash_pin(pin: str, sal: bytes | None = None) -> str:
    sal = sal or secrets.token_bytes(16)
    digest = hashlib.scrypt(pin.encode(), salt=sal, n=2**12, r=8, p=1)
    return sal.hex() + ":" + digest.hex()


def verificar_pin(pin: str, guardado: str) -> bool:
    sal_hex, digest_hex = guardado.split(":")
    calculado = hashlib.scrypt(pin.encode(), salt=bytes.fromhex(sal_hex), n=2**12, r=8, p=1)
    return hmac.compare_digest(calculado.hex(), digest_hex)


def _consulta(cid: str, fecha: str, centro_id: str, motivo: str, diagnostico: str, tratamiento: str,
              vacunas: list[str], original: str, editada_en: str) -> dict[str, Any]:
    return {
        "id": cid,
        "version": 1,
        "fecha": fecha,
        "centro": copy.deepcopy(CENTROS[centro_id]),
        "motivo": motivo,
        "diagnostico": diagnostico,
        "tratamiento": tratamiento,
        "vacunas": vacunas,
        "original_url": original,
        "editada_por": "Ana Tzul",
        "editada_en": editada_en,
    }


class Almacen:
    def __init__(self) -> None:
        self.reiniciar()

    def reiniciar(self) -> None:
        self.pacientes: dict[str, list[dict[str, Any]]] = {}  # id -> versiones (la última es la vigente)
        self.pacientes_meta: dict[str, dict[str, Any]] = {}  # id -> pin, telefono, motivo de cambio
        self.consultas: dict[str, list[dict[str, Any]]] = {}  # id -> versiones
        self.consultas_por_paciente: dict[str, list[str]] = {}
        self.versiones_motivo: dict[tuple[str, int], str | None] = {}
        self.fichas: dict[str, dict[str, Any]] = {}
        self.fichas_por_client_id: dict[str, str] = {}
        self.archivos: dict[str, tuple[bytes, str]] = {}
        self.sesiones: dict[str, dict[str, Any]] = {}
        self.codigos: dict[str, dict[str, Any]] = {}
        self.accesos: list[dict[str, Any]] = []
        self.fallos_pin: dict[str, dict[str, Any]] = {}
        self.fallos_canje: dict[str, dict[str, Any]] = {}
        self.bitacora: list[dict[str, Any]] = []  # solo se agrega; no hay forma de editarla ni de borrarla
        self._contador = 100
        self._sembrar()

    # --- ids ---
    def nuevo_id(self, prefijo: str) -> str:
        self._contador += 1
        return f"{prefijo}_{self._contador}"

    # --- semillas ---
    def _sembrar(self) -> None:
        self.crear_paciente(
            {
                "id": "p_12",
                "dpi": DPI_ROSA,
                "nombre": "Rosa Batz Tzoc",
                "fecha_nacimiento": "1984-03-12",
                "sexo": "F",
                "comunidad": "Chuicacá",
                "alergias": ["penicilina"],
                "condiciones_cronicas": [],
            },
            telefono="+502 5555 0101",
            pin=PIN_ROSA,
            debe_cambiar_pin=False,
            centro_id="c_01",
        )
        for c in (
            _consulta("con_001", "2019-05-20", "c_01", "Dolor de garganta", "Faringitis",
                      "Azitromicina (alergia a penicilina)", [], "/api/v1/archivos/semilla/rosa_2019.svg",
                      "2026-11-21T08:30:00-06:00"),
            _consulta("con_002", "2022-11-03", "c_01", "Control de presión", "Presión normal",
                      "Ninguno", ["Influenza"], "/api/v1/archivos/semilla/rosa_2022.svg",
                      "2026-11-21T08:31:00-06:00"),
            _consulta("con_003", "2025-08-14", "c_01", "Control prenatal", "Embarazo 24 semanas",
                      "Sulfato ferroso", ["Td"], "/api/v1/archivos/semilla/rosa_2025.svg",
                      "2026-11-21T08:32:00-06:00"),
        ):
            self._guardar_consulta_nueva("p_12", c)

        # Niño sin DPI: identificador temporal (C-06).
        self.crear_paciente(
            {
                "id": "p_13",
                "dpi": DPI_MATEO,
                "nombre": "Mateo Batz",
                "fecha_nacimiento": "2023-02-10",
                "sexo": "M",
                "comunidad": "Chuicacá",
                "alergias": [],
                "condiciones_cronicas": [],
            },
            telefono="+502 5555 0101",
            pin=PIN_MATEO,
            debe_cambiar_pin=True,
            centro_id="c_01",
        )
        self._guardar_consulta_nueva(
            "p_13",
            _consulta("con_004", "2024-02-10", "c_01", "Vacunación de 12 meses", "Niño sano", "Ninguno",
                      ["SPR"], "/api/v1/archivos/semilla/mateo_2024.svg", "2026-11-21T08:40:00-06:00"),
        )

    # --- pacientes ---
    def crear_paciente(self, datos: dict[str, Any], *, telefono: str | None, pin: str,
                       debe_cambiar_pin: bool = True, centro_id: str | None = None) -> dict[str, Any]:
        pid = datos.get("id") or self.nuevo_id("p")
        paciente = {
            "id": pid,
            "dpi": datos["dpi"],
            "nombre": datos["nombre"],
            "fecha_nacimiento": datos.get("fecha_nacimiento"),
            "sexo": datos.get("sexo"),
            "comunidad": datos.get("comunidad"),
            "alergias": list(datos.get("alergias") or []),
            "condiciones_cronicas": list(datos.get("condiciones_cronicas") or []),
            "version": 1,
        }
        self.pacientes[pid] = [paciente]
        self.pacientes_meta[pid] = {
            "pin_hash": hash_pin(pin),
            "debe_cambiar_pin": debe_cambiar_pin,
            "telefono": telefono,
            # Puesto que dio de alta a la persona. None si vino de una semilla vieja sin centro.
            "centro_id": centro_id,
        }
        self.consultas_por_paciente.setdefault(pid, [])
        return copy.deepcopy(paciente)

    def paciente(self, pid: str) -> dict[str, Any] | None:
        versiones = self.pacientes.get(pid)
        return copy.deepcopy(versiones[-1]) if versiones else None

    def paciente_por_dpi(self, dpi: str) -> dict[str, Any] | None:
        for pid, versiones in self.pacientes.items():
            if versiones[-1]["dpi"] == dpi:
                return copy.deepcopy(versiones[-1])
        return None

    def nueva_version_paciente(self, pid: str, cambios: dict[str, Any]) -> dict[str, Any]:
        actual = copy.deepcopy(self.pacientes[pid][-1])
        actual.update(cambios)
        actual["version"] += 1
        self.pacientes[pid].append(actual)
        return copy.deepcopy(actual)

    # --- consultas ---
    def _guardar_consulta_nueva(self, pid: str, consulta: dict[str, Any]) -> dict[str, Any]:
        self.consultas[consulta["id"]] = [consulta]
        self.consultas_por_paciente.setdefault(pid, []).append(consulta["id"])
        self.versiones_motivo[(consulta["id"], 1)] = None
        return copy.deepcopy(consulta)

    def crear_consulta(self, pid: str, datos: dict[str, Any]) -> dict[str, Any]:
        consulta = {"id": self.nuevo_id("con"), "version": 1, **datos}
        return self._guardar_consulta_nueva(pid, consulta)

    def consulta(self, cid: str) -> dict[str, Any] | None:
        versiones = self.consultas.get(cid)
        return copy.deepcopy(versiones[-1]) if versiones else None

    def paciente_de_consulta(self, cid: str) -> str | None:
        for pid, ids in self.consultas_por_paciente.items():
            if cid in ids:
                return pid
        return None

    def nueva_version_consulta(self, cid: str, cambios: dict[str, Any], motivo: str, editor: str) -> dict[str, Any]:
        actual = copy.deepcopy(self.consultas[cid][-1])
        actual.update(cambios)
        actual["version"] += 1
        actual["editada_por"] = editor
        actual["editada_en"] = tiempo.iso(tiempo.ahora())
        self.consultas[cid].append(actual)
        self.versiones_motivo[(cid, actual["version"])] = motivo
        return copy.deepcopy(actual)

    def versiones_consulta(self, cid: str) -> list[dict[str, Any]]:
        salida = []
        for v in reversed(self.consultas.get(cid, [])):
            datos = {k: copy.deepcopy(val) for k, val in v.items() if k not in ("id", "version", "editada_por", "editada_en")}
            salida.append(
                {
                    "version": v["version"],
                    "datos": datos,
                    "motivo_cambio": self.versiones_motivo.get((cid, v["version"])),
                    "editada_por": v["editada_por"],
                    "editada_en": v["editada_en"],
                }
            )
        return salida

    def consultas_de(self, pid: str) -> list[dict[str, Any]]:
        lista = [self.consulta(cid) for cid in self.consultas_por_paciente.get(pid, [])]
        return sorted((c for c in lista if c), key=lambda c: c.get("fecha") or "", reverse=True)

    # --- sesiones ---
    def crear_sesion(self, usuario: dict[str, Any], vence: datetime) -> str:
        token = secrets.token_urlsafe(32)
        self.sesiones[token] = {"usuario_id": usuario["id"], "rol": usuario["rol"], "vence": vence}
        return token

    def sesion(self, token: str) -> dict[str, Any] | None:
        s = self.sesiones.get(token)
        if not s:
            return None
        if s["vence"] <= tiempo.ahora():
            self.sesiones.pop(token, None)
            return None
        return s

    # --- accesos (bitácora que ve la paciente) ---
    def registrar_acceso(self, *, paciente_id: str, actor: dict[str, Any], tipo: str, motivo: str | None,
                         desde: datetime, hasta: datetime) -> dict[str, Any]:
        centro = CENTROS.get(actor.get("centro_id") or "", {}).get("nombre", "")
        acceso = {
            "id": self.nuevo_id("acc"),
            "paciente_id": paciente_id,
            "actor_id": actor["id"],
            "quien": actor["nombre"],
            "tipo": tipo,
            "motivo": motivo,
            "centro": centro,
            "desde": desde,
            "hasta": hasta,
            "preguntas_hechas": 0,
            "eventos": [],
        }
        self.accesos.append(acceso)
        return acceso

    def acceso_vigente(self, actor_id: str, paciente_id: str, tipos: tuple[str, ...] = ("codigo", "emergencia")) -> dict[str, Any] | None:
        momento = tiempo.ahora()
        vigentes = [
            a for a in self.accesos
            if a["actor_id"] == actor_id and a["paciente_id"] == paciente_id and a["tipo"] in tipos and a["hasta"] > momento
        ]
        if not vigentes:
            return None
        # Si hay código y emergencia a la vez, gana el código (ve más).
        vigentes.sort(key=lambda a: (a["tipo"] == "codigo", a["hasta"]))
        return vigentes[-1]

    def accesos_de(self, pid: str) -> list[dict[str, Any]]:
        lista = [a for a in self.accesos if a["paciente_id"] == pid]
        lista.sort(key=lambda a: a["desde"], reverse=True)
        return [
            {
                "quien": a["quien"],
                "tipo": a["tipo"],
                "motivo": a["motivo"],
                "centro": a["centro"],
                "desde": tiempo.iso(a["desde"]),
                "hasta": tiempo.iso(a["hasta"]),
                "preguntas_hechas": a["preguntas_hechas"],
            }
            for a in lista
        ]

    def dpis(self) -> set[str]:
        return {versiones[-1]["dpi"] for versiones in self.pacientes.values() if versiones}

    def anotar_bitacora(self, evento: dict[str, Any]) -> dict[str, Any]:
        """Append-only. No hay método para corregir ni borrar eventos."""
        registro = {"id": self.nuevo_id("bit"), **evento, "en": tiempo.iso(tiempo.ahora())}
        self.bitacora.append(registro)
        return registro

    def _bolsa_fallos(self, tipo: str) -> dict[str, dict[str, Any]]:
        if tipo == "pin":
            return self.fallos_pin
        if tipo == "canje":
            return self.fallos_canje
        raise ValueError(tipo)

    def bloqueado(self, tipo: str, clave: str) -> bool:
        info = self._bolsa_fallos(tipo).get(clave)
        return bool(info and info.get("hasta") and info["hasta"] > tiempo.ahora())

    def anotar_fallo(self, tipo: str, clave: str) -> bool:
        """Suma un fallo. A los 5, bloquea 15 minutos. Devuelve True si quedó bloqueado."""
        bolsa = self._bolsa_fallos(tipo)
        momento = tiempo.ahora()
        info = bolsa.get(clave)
        if not info or (info.get("hasta") and info["hasta"] <= momento):
            info = {"n": 0, "hasta": None}
        info["n"] += 1
        if info["n"] >= 5:
            info["hasta"] = momento + timedelta(minutes=15)
        bolsa[clave] = info
        return bool(info["hasta"] and info["hasta"] > momento)

    def limpiar_fallos(self, tipo: str, clave: str) -> None:
        self._bolsa_fallos(tipo).pop(clave, None)


almacen = Almacen()

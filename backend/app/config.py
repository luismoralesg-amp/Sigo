"""Configuración leída del entorno (.env) con pydantic-settings (C-02)."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Túnel rápido de Cloudflare: https://<subdominio>.trycloudflare.com
# Anclado para que no matchee un sufijo colado (fullmatch de Starlette).
REGEX_TUNEL = r"^https://[a-zA-Z0-9-]+\.trycloudflare\.com$"
ORIGENES_CORS = "http://localhost:3000,http://127.0.0.1:3000,https://sigo.vercel.app"


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- API ---
    sigo_env: Literal["desarrollo", "demo", "produccion"] = "desarrollo"
    # Lista separada por comas. El frontend (Next.js) sale de localhost:3000 o de Vercel.
    sigo_cors_origins: str = ORIGENES_CORS
    # Desarrollo: regex del túnel. En producción la variable va vacía (sin trycloudflare).
    # Si no está definida, queda el default del túnel. Cadena vacía lo apaga.
    sigo_cors_origin_regex: str = REGEX_TUNEL
    sigo_public_api_url: str = "http://localhost:8000"
    sigo_public_app_url: str = "https://sigo.app"
    # Secreto para firmar URLs de imágenes. Cambialo fuera de desarrollo.
    sigo_secret: str = Field(default="solo-desarrollo-cambiar")
    # POST /api/v1/dev/sesion. Apagado si la variable no está.
    # Aunque el ejemplo diga true, en produccion o demo no enciende:
    # hace falta SIGO_ENV=desarrollo y SIGO_DEV_LOGIN=true.
    sigo_dev_login: bool = False
    # Modo demo: el acceso con código dura 2 minutos en vez de 2 horas.
    sigo_modo_demo: bool = False
    # Si es True, un dígito verificador que no cuadra bloquea; si es False, es advertencia (M-01).
    sigo_dpi_verificador_estricto: bool = False
    # SMS: "ninguno" o "simulado" (escribe en el log). Un proveedor real queda pendiente.
    sigo_sms: Literal["ninguno", "simulado"] = "simulado"

    # --- Implementaciones de los módulos (mock = sin código de Arturo) ---
    sigo_vision_impl: Literal["mock", "real"] = "mock"
    sigo_importar_impl: Literal["mock", "real"] = "mock"
    sigo_cag_impl: Literal["mock", "real"] = "mock"
    sigo_export_impl: Literal["mock", "real"] = "mock"

    # --- Supabase (login del personal) ---
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    # Secreto JWT (HS256, proyectos con clave compartida). Si falta, se usa el JWKS de supabase_url.
    supabase_jwt_secret: str | None = None

    # --- Módulos de Arturo (los lee modulos-arturo, no el backend) ---
    ollama_host: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:7b"
    vision_mode: Literal["local", "cloud"] = "local"

    @field_validator("sigo_cors_origin_regex", mode="before")
    @classmethod
    def _regex_vacio(cls, value: object) -> object:
        # Producción manda la variable vacía: no reponer el túnel.
        if isinstance(value, str) and not value.strip():
            return ""
        return value

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.sigo_cors_origins.split(",") if o.strip()]

    @property
    def dev_login_activo(self) -> bool:
        # Producción (y demo) ignoran SIGO_DEV_LOGIN. Sin la variable, queda apagado.
        return self.sigo_env == "desarrollo" and self.sigo_dev_login


@lru_cache
def config() -> Config:
    return Config()

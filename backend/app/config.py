"""Configuración leída del entorno (.env) con pydantic-settings (C-02)."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- API ---
    sigo_env: Literal["desarrollo", "demo", "produccion"] = "desarrollo"
    sigo_cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    # Regex opcional para previews de Vercel y túneles, p. ej. https://.*\.trycloudflare\.com
    sigo_cors_origin_regex: str | None = None
    sigo_public_api_url: str = "http://localhost:8000"
    sigo_public_app_url: str = "https://sigo.app"
    # Secreto para firmar URLs de imágenes. Cambialo fuera de desarrollo.
    sigo_secret: str = Field(default="solo-desarrollo-cambiar")
    # Login de prueba del personal (POST /api/v1/dev/sesion). Solo funciona si sigo_env=desarrollo.
    sigo_dev_login: bool = True
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

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.sigo_cors_origins.split(",") if o.strip()]

    @property
    def dev_login_activo(self) -> bool:
        return self.sigo_env == "desarrollo" and self.sigo_dev_login


@lru_cache
def config() -> Config:
    return Config()

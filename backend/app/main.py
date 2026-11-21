"""SIGO API v1. Tu historia te sigue."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import config
from .errores import MENSAJES, ErrorSigo
from .rutas import router


def crear_app() -> FastAPI:
    app = FastAPI(
        title="SIGO API",
        version="1.0.0",
        summary="Tu historia te sigue.",
        description=(
            "Contrato v1 de Phil. URL base: /api/v1 "
            "(local: http://localhost:8000/api/v1; el mismo camino detrás del túnel). "
            "18 endpoints más POST /importaciones. "
            "Nada se borra. La IA no guarda sola. "
            "OpenAPI generado: contrato/openapi-v1.json. "
            "formato_no_soportado es un 400 propio (no se reescribe como validacion)."
        ),
        servers=[{"url": "/", "description": "Este proceso. Todas las rutas cuelgan de /api/v1."}],
    )
    cfg = config()
    # Credenciales: el origen permitido se refleja tal cual (nunca "*") para que
    # el navegador acepte Authorization en el preflight.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_origin_regex=cfg.sigo_cors_origin_regex or None,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    @app.exception_handler(ErrorSigo)
    async def error_sigo(_request, exc: ErrorSigo) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    @app.exception_handler(RequestValidationError)
    async def error_validacion(_request, exc: RequestValidationError) -> JSONResponse:
        partes = []
        for item in exc.errors():
            lugar = ".".join(str(x) for x in item.get("loc", []) if x not in {"body", "query"})
            mensaje = item.get("msg", "dato inválido")
            partes.append(f"{lugar}: {mensaje}" if lugar else mensaje)
        texto = "; ".join(partes) or MENSAJES["validacion"]
        return JSONResponse(status_code=400, content={"error": {"codigo": "validacion", "mensaje": texto[:300]}})

    @app.exception_handler(StarletteHTTPException)
    async def error_http(_request, exc: StarletteHTTPException) -> JSONResponse:
        if isinstance(exc.detail, dict) and "error" in exc.detail:
            return JSONResponse(status_code=exc.status_code, content=exc.detail)
        if exc.status_code == 404:
            return JSONResponse(status_code=404, content={"error": {"codigo": "no_existe", "mensaje": MENSAJES["no_existe"]}})
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"codigo": "validacion", "mensaje": str(exc.detail)}},
        )

    app.include_router(router)
    return app


app = crear_app()

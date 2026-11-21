from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
REPO = RAIZ.parent


def test_esquema_es_solo_agregado():
    sql = (RAIZ / "supabase" / "esquema.sql").read_text().lower()
    assert "for update" not in sql
    assert "for delete" not in sql
    assert "security definer" in sql
    assert "canjear_consentimiento" in sql
    assert "sigo_bloquear_mutacion" in sql
    assert "service_role" in sql
    assert "solo en el servidor" in sql
    assert "enable row level security" in sql
    for tabla in ("alergias", "vacunas", "fichas", "bitacora", "consentimientos", "paciente_versiones", "consulta_versiones"):
        assert f"'{tabla}'" in sql
    for tabla in ("alergias", "vacunas", "fichas"):
        assert f"create policy" in sql
        assert f"public.{tabla}" in sql
        assert f"policy {tabla}_lee on public.{tabla}" in sql or f"policy {tabla}_inserta on public.{tabla}" in sql
    assert "bitacora_sin_insert_cliente" in sql
    assert "with check (false)" in sql
    assert "revoke insert on public.bitacora" in sql


def test_requirements_pineados():
    runtime = (RAIZ / "requirements.txt").read_text()
    dev = (RAIZ / "requirements-dev.txt").read_text()
    assert ">=" not in runtime
    assert "pytest" not in runtime.lower()
    for paquete in ("fastapi==", "pydantic-settings==", "python-dotenv==", "pandas==", "ollama==", "openpyxl=="):
        assert paquete in runtime
    assert "pytest==" in dev
    assert "httpx==" in dev


def test_mdbtools_esta_documentado():
    readme = (REPO / "README.md").read_text().lower()
    docker = (RAIZ / "Dockerfile").read_text().lower()
    congruencia = (RAIZ / "CONGRUENCIA.md").read_text()
    assert "mdbtools" in readme
    assert "apt-get" in readme
    assert "mdbtools" in docker
    assert "apt-get install -y --no-install-recommends mdbtools" in docker
    assert "formato_no_soportado" in congruencia
    assert "400" in congruencia


def test_congruencia_y_openapi_listan_el_codigo(cliente):
    from app.main import app

    codigos = app.openapi()["components"]["schemas"]["ErrorCuerpo"]["properties"]["codigo"]["enum"]
    assert "formato_no_soportado" in codigos
    assert "validacion" in codigos

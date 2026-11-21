import sys
from pathlib import Path

# tests/ vive en modulos-arturo/importar/tests.
# El paquete que importa el backend es modulos-arturo/sigo_modulos.
IMPORTAR = Path(__file__).resolve().parents[1]
RAIZ_MODULOS = IMPORTAR.parent
if str(RAIZ_MODULOS) not in sys.path:
    sys.path.insert(0, str(RAIZ_MODULOS))

FIXTURES = IMPORTAR / "fixtures"

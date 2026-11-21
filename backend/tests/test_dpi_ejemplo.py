from app.datos import DPI_ROSA, almacen
from app.dpi import calcular_digito_verificador, validar_cui
from app.modulos.vision_mock import EXTRACCION_EJEMPLO


def test_el_dpi_de_phil_falla_el_verificador():
    assert calcular_digito_verificador("25478963") == 3
    resultado = validar_cui("2547896310801")
    assert resultado.digito_verificador == "1"
    assert any("3" in aviso and "1" in aviso for aviso in resultado.advertencias)


def test_mocks_usan_un_dpi_inventado_valido():
    bueno = validar_cui(DPI_ROSA)
    assert DPI_ROSA == "2547896330801"
    assert DPI_ROSA != "2547896310801"
    assert bueno.valido
    assert bueno.advertencias == []
    assert almacen.paciente("p_12")["dpi"] == DPI_ROSA
    assert EXTRACCION_EJEMPLO["paciente"]["dpi"]["valor"] == DPI_ROSA
    assert EXTRACCION_EJEMPLO["paciente"]["dpi"]["confianza"] == "alta"

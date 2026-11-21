"""Pruebas del CAG con Ollama mockeado, contra la firma oficial.

    from sigo_modulos.cag import preguntar
    preguntar(expediente: dict, pregunta: str) -> {respuesta, fuentes}

Solo datos inventados.
"""

from __future__ import annotations

import copy
import inspect
import json

import pytest

import cag.asistente as cag_impl
from cag.expediente import armar_prefijo, recorte_emergencia, serializar
from cag.fixtures import ROSA
from cag.asistente import extraer_json, validar_fuentes
from sigo_modulos.cag import (
    MENSAJE_FUERA,
    OllamaNoDisponible,
    preguntar,
)


class ClienteFalso:
    def __init__(self, salida: str | dict) -> None:
        self.salida = salida
        self.prefijos: list[str] = []
        self.preguntas: list[str] = []
        self.claves: list[str] = []
        self.precalentados: list[tuple[str, str]] = []

    def generar(self, clave: str, prefijo: str, pregunta: str) -> str:
        self.claves.append(clave)
        self.prefijos.append(prefijo)
        self.preguntas.append(pregunta)
        if callable(self.salida):
            return self.salida(prefijo, pregunta)
        if isinstance(self.salida, dict):
            return json.dumps(self.salida, ensure_ascii=False)
        return str(self.salida)

    def precalentar(self, clave: str, prefijo: str) -> None:
        self.precalentados.append((clave, prefijo))

    def close(self) -> None:
        return None


class ClienteCaido:
    def generar(self, clave: str, prefijo: str, pregunta: str) -> str:
        raise OllamaNoDisponible("Ollama no está disponible en http://localhost:11434")

    def close(self) -> None:
        return None


def _inyectar(monkeypatch: pytest.MonkeyPatch, cliente: object) -> None:
    # Inyectar en el módulo de implementación (cag.asistente), no en la función
    # pública `cag.preguntar` que exporta el paquete.
    monkeypatch.setattr(cag_impl, "_cliente_override", cliente)


FUENTE_AMOX = {
    "consulta_id": "con_003",
    "version": 1,
    "original_url": "https://archivos.sigo.gt/inventados/rosa/con_003.jpg",
    "campo": "tratamiento",
}

# con_001 es la ficha donde el expediente inventado dice que se confirmó la alergia.
FUENTE_ALERGIA = {
    "consulta_id": "con_001",
    "version": 1,
    "original_url": "https://archivos.sigo.gt/inventados/rosa/con_001.jpg",
    "campo": "paciente.alergias",
}


def test_firma_oficial_solo_expediente_y_pregunta() -> None:
    params = list(inspect.signature(preguntar).parameters)
    assert params == ["expediente", "pregunta"]


def test_fuentes_validas_se_conservan(monkeypatch: pytest.MonkeyPatch) -> None:
    _inyectar(
        monkeypatch,
        ClienteFalso(
            {
                "respuesta": "En la consulta del 2 de noviembre de 2024 le recetaron amoxicilina 500 mg.",
                "fuentes": [FUENTE_AMOX],
            }
        ),
    )
    out = preguntar(ROSA, "¿Qué le recetaron en su última consulta?")
    assert out["respuesta"].startswith("En la consulta")
    assert out["fuentes"] == [FUENTE_AMOX]
    assert set(out.keys()) == {"respuesta", "fuentes"}
    assert set(out["fuentes"][0].keys()) == {"consulta_id", "version", "original_url", "campo"}


def test_cita_inventada_se_descarta(monkeypatch: pytest.MonkeyPatch) -> None:
    _inyectar(
        monkeypatch,
        ClienteFalso(
            {
                "respuesta": "Le hicieron una cirugía en 2019, según la consulta con_999.",
                "fuentes": [
                    {
                        "consulta_id": "con_999",
                        "version": 4,
                        "original_url": "https://inventada.invalid/con_999.jpg",
                        "campo": "tratamiento",
                    }
                ],
            }
        ),
    )
    out = preguntar(ROSA, "¿Tuvo alguna cirugía?")
    assert out["fuentes"] == []
    assert out["respuesta"] == MENSAJE_FUERA


def test_cita_inventada_entre_validas_solo_se_descarta_la_falsa(monkeypatch: pytest.MonkeyPatch) -> None:
    _inyectar(
        monkeypatch,
        ClienteFalso(
            {
                "respuesta": "Es alérgica a la penicilina y, según una ficha falsa, a los mariscos.",
                "fuentes": [
                    FUENTE_ALERGIA,
                    {
                        "consulta_id": "con_inexistente",
                        "version": 1,
                        "original_url": "https://inventada.invalid/x.jpg",
                        "campo": "tratamiento",
                    },
                ],
            }
        ),
    )
    out = preguntar(ROSA, "¿A qué es alérgica Rosa?")
    assert out["fuentes"] == [FUENTE_ALERGIA]
    assert "penicilina" in out["respuesta"].lower() or "alérg" in out["respuesta"].lower()


def test_pregunta_fuera_del_expediente(monkeypatch: pytest.MonkeyPatch) -> None:
    _inyectar(monkeypatch, ClienteFalso({"respuesta": MENSAJE_FUERA, "fuentes": []}))
    out = preguntar(ROSA, "¿Cuál es su tipo de sangre?")
    assert out["respuesta"] == MENSAJE_FUERA
    assert out["fuentes"] == []


def test_respuesta_sin_fuentes_se_marca_fuera_del_expediente(monkeypatch: pytest.MonkeyPatch) -> None:
    _inyectar(
        monkeypatch,
        ClienteFalso({"respuesta": "Su tipo de sangre es O positivo.", "fuentes": []}),
    )
    out = preguntar(ROSA, "¿Cuál es su tipo de sangre?")
    assert out["respuesta"] == MENSAJE_FUERA
    assert out["fuentes"] == []


def test_original_url_y_version_se_corrigen_si_la_consulta_existe() -> None:
    fuentes, inventadas = validar_fuentes(
        [
            {
                "consulta_id": "con_003",
                "version": 99,
                "original_url": "https://url-inventada.invalid/x.jpg",
                "campo": "tratamiento",
            }
        ],
        ROSA,
        "codigo",
    )
    assert inventadas is False
    assert fuentes == [FUENTE_AMOX]


def test_marca_de_emergencia_no_mete_consultas_en_el_prefijo(monkeypatch: pytest.MonkeyPatch) -> None:
    """Defensa interna: si la marca llega igual, el prefijo no lleva consultas.

    No es un modo público. El 403 lo pone el backend antes de llamar.
    """
    prefijo_visto: dict[str, str] = {}

    def salida(prefijo: str, pregunta: str) -> str:
        prefijo_visto["texto"] = prefijo
        return json.dumps(
            {
                "respuesta": "Rosa Ajpop es alérgica a la penicilina.",
                "fuentes": [{"consulta_id": "", "version": 1, "original_url": "", "campo": "alergias"}],
            },
            ensure_ascii=False,
        )

    _inyectar(monkeypatch, ClienteFalso(salida))
    expediente = copy.deepcopy(ROSA)
    expediente["tipo_acceso"] = "emergencia"
    out = preguntar(expediente, "¿A qué es alérgica?")
    texto = prefijo_visto["texto"]
    assert "ALERGIAS: penicilina" in texto
    assert "CONDICIONES_CRONICAS: hipertensión" in texto
    assert "con_001" not in texto
    assert "con_003" not in texto
    assert "Amoxicilina" not in texto
    assert "COVID-19" not in texto
    assert "acceso de emergencia" not in texto.lower()
    assert out["fuentes"] == [FUENTE_ALERGIA]
    assert "penicilina" in out["respuesta"].lower()


@pytest.mark.parametrize(
    "marca",
    [
        {"tipo_acceso": "emergencia"},
        {"emergencia": True},
        {"acceso": {"tipo": "emergencia"}},
    ],
)
def test_marca_de_emergencia_descarta_cita_de_consulta(monkeypatch: pytest.MonkeyPatch, marca: dict) -> None:
    cliente = ClienteFalso(
        {
            "respuesta": "La última vacuna fue el COVID-19 (refuerzo) el 2023-09-01.",
            "fuentes": [
                {
                    "consulta_id": "con_002",
                    "version": 1,
                    "original_url": "https://archivos.sigo.gt/inventados/rosa/con_002.jpg",
                    "campo": "vacunas",
                }
            ],
        }
    )
    _inyectar(monkeypatch, cliente)
    expediente = copy.deepcopy(ROSA)
    expediente.update(marca)
    out = preguntar(expediente, "¿Cuándo fue su última vacuna?")
    assert out["respuesta"] == MENSAJE_FUERA
    assert out["fuentes"] == []
    assert cliente.prefijos
    assert "con_002" not in cliente.prefijos[0]
    assert "COVID-19" not in cliente.prefijos[0]


def test_marca_de_emergencia_no_devuelve_el_tratamiento(monkeypatch: pytest.MonkeyPatch) -> None:
    cliente = ClienteFalso(
        {
            "respuesta": "Le recetaron amoxicilina en noviembre de 2024.",
            "fuentes": [FUENTE_AMOX],
        }
    )
    _inyectar(monkeypatch, cliente)
    expediente = copy.deepcopy(ROSA)
    expediente["tipo_acceso"] = "emergencia"
    out = preguntar(expediente, "¿Qué le dieron la última vez que vino?")
    assert out["respuesta"] == MENSAJE_FUERA
    assert out["fuentes"] == []


def test_sin_marca_se_usa_el_expediente_que_llego(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sin marca no hay recorte: si el expediente ya venía sin consultas, se usa tal cual."""
    filtrado = recorte_emergencia(ROSA)
    filtrado["tipo_acceso"] = None
    _inyectar(
        monkeypatch,
        ClienteFalso(
            {
                "respuesta": "La última vacuna fue en 2023.",
                "fuentes": [
                    {
                        "consulta_id": "con_002",
                        "version": 1,
                        "original_url": "https://archivos.sigo.gt/inventados/rosa/con_002.jpg",
                        "campo": "vacunas",
                    }
                ],
            }
        ),
    )
    out = preguntar(filtrado, "¿Cuándo fue su última vacuna?")
    assert out["fuentes"] == []
    assert out["respuesta"] == MENSAJE_FUERA


def test_alergia_cita_la_ultima_ficha_que_la_confirmo(monkeypatch: pytest.MonkeyPatch) -> None:
    expediente = {
        "paciente": {
            "id": "p_20",
            "version": 2,
            "nombre": "Ana Inventada",
            "alergias": [
                {"sustancia": "penicilina", "consulta_id": "f_1"},
                {"sustancia": "penicilina", "consulta_id": "f_2"},
            ],
            "condiciones_cronicas": [],
        },
        "consultas": [
            {
                "id": "f_1",
                "version": 1,
                "fecha": "2020-01-01",
                "editada_en": "2020-01-02T10:00:00-06:00",
                "original_url": "https://archivos.sigo.gt/inventados/f_1.jpg",
                "motivo": "Registro de alergia",
            },
            {
                "id": "f_2",
                "version": 3,
                "fecha": "2024-05-01",
                "editada_en": "2024-05-02T10:00:00-06:00",
                "original_url": "https://archivos.sigo.gt/inventados/f_2.jpg",
                "motivo": "Se confirma la alergia",
            },
        ],
    }
    _inyectar(
        monkeypatch,
        ClienteFalso(
            {
                "respuesta": "Es alérgica a la penicilina.",
                "fuentes": [{"consulta_id": "f_1", "version": 99, "original_url": "", "campo": "alergias"}],
            }
        ),
    )
    out = preguntar(expediente, "¿A qué es alérgica?")
    assert out["fuentes"] == [
        {
            "consulta_id": "f_2",
            "version": 3,
            "original_url": "https://archivos.sigo.gt/inventados/f_2.jpg",
            "campo": "paciente.alergias",
        }
    ]


@pytest.mark.parametrize(
    ("item", "consulta_id"),
    [
        ({"nombre": "asma", "fuente": "importacion", "fila": 4}, "4"),
        ({"nombre": "asma", "fuente": "importado", "fila_id": "imp_12"}, "imp_12"),
    ],
)
def test_condicion_cronica_importada_cita_la_fila(
    monkeypatch: pytest.MonkeyPatch, item: dict, consulta_id: str
) -> None:
    expediente = {
        "paciente": {
            "id": "p_21",
            "version": 1,
            "nombre": "Luis Inventado",
            "alergias": [],
            "condiciones_cronicas": [item],
        },
        "consultas": [],
    }
    _inyectar(
        monkeypatch,
        ClienteFalso(
            {
                "respuesta": "Tiene asma registrada.",
                "fuentes": [
                    {
                        "consulta_id": "no-es-la-fila",
                        "version": 9,
                        "original_url": "https://inventada.invalid/x.jpg",
                        "campo": "condiciones_cronicas",
                    }
                ],
            }
        ),
    )
    out = preguntar(expediente, "¿Tiene alguna condición crónica?")
    assert out["fuentes"] == [
        {
            "consulta_id": consulta_id,
            "version": 1,
            "original_url": None,
            "campo": "paciente.condiciones_cronicas",
        }
    ]


def test_alergia_sin_puntero_usa_la_consulta_mas_reciente(monkeypatch: pytest.MonkeyPatch) -> None:
    """Phil guarda alergias como string[]: no hay ficha de origen en el modelo."""
    expediente = {
        "paciente": {
            "id": "p_22",
            "version": 1,
            "nombre": "Marta Inventada",
            "alergias": ["ibuprofeno"],
            "condiciones_cronicas": [],
        },
        "consultas": [
            {
                "id": "c_vieja",
                "version": 1,
                "fecha": "2019-01-01",
                "editada_en": "2019-01-02T10:00:00-06:00",
                "original_url": "https://archivos.sigo.gt/inventados/vieja.jpg",
            },
            {
                "id": "c_nueva",
                "version": 2,
                "fecha": "2024-06-01",
                "editada_en": "2024-06-02T10:00:00-06:00",
                "original_url": "https://archivos.sigo.gt/inventados/nueva.jpg",
            },
        ],
    }
    _inyectar(
        monkeypatch,
        ClienteFalso(
            {
                "respuesta": "Figura alergia a ibuprofeno.",
                "fuentes": [{"consulta_id": "", "version": 1, "original_url": "", "campo": "paciente.alergias"}],
            }
        ),
    )
    out = preguntar(expediente, "¿A qué es alérgica?")
    assert out["fuentes"] == [
        {
            "consulta_id": "c_nueva",
            "version": 2,
            "original_url": "https://archivos.sigo.gt/inventados/nueva.jpg",
            "campo": "paciente.alergias",
        }
    ]


def test_no_muta_el_expediente(monkeypatch: pytest.MonkeyPatch) -> None:
    original = copy.deepcopy(ROSA)
    _inyectar(monkeypatch, ClienteFalso({"respuesta": MENSAJE_FUERA, "fuentes": []}))
    expediente = copy.deepcopy(ROSA)
    expediente["tipo_acceso"] = "emergencia"
    preguntar(expediente, "¿Tipo de sangre?")
    assert ROSA == original
    assert expediente["consultas"][0]["id"] == "con_003"
    recorte = recorte_emergencia(ROSA)
    recorte["paciente"]["alergias"].append("inventada")
    assert "inventada" not in ROSA["paciente"]["alergias"]


def test_prefijo_es_estable_para_la_misma_clave() -> None:
    a = armar_prefijo(ROSA, "codigo")
    b = armar_prefijo(copy.deepcopy(ROSA), "codigo")
    assert a == b
    assert "con_003" in serializar(ROSA, "codigo")
    assert "con_003" not in serializar(ROSA, "emergencia")
    marcado = copy.deepcopy(ROSA)
    marcado["tipo_acceso"] = "emergencia"
    assert "con_003" not in serializar(marcado)


def test_extraer_json_desde_fence_markdown() -> None:
    texto = """Aquí va:\n```json\n{"respuesta": "ok", "fuentes": []}\n```\n"""
    assert extraer_json(texto) == {"respuesta": "ok", "fuentes": []}


def test_ia_no_disponible_tiene_codigo(monkeypatch: pytest.MonkeyPatch) -> None:
    _inyectar(monkeypatch, ClienteCaido())
    with pytest.raises(OllamaNoDisponible) as ei:
        preguntar(ROSA, "¿A qué es alérgica?")
    assert ei.value.codigo == "ia_no_disponible"
    assert getattr(ei.value, "codigo") == "ia_no_disponible"


def test_ollama_caido_se_mockea_sin_red() -> None:
    """El cliente real, con el transporte de httpx mockeado, no abre la red."""
    import httpx

    from cag.ollama_cliente import OllamaCliente

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    cliente = OllamaCliente(transport=httpx.MockTransport(handler))
    try:
        with pytest.raises(OllamaNoDisponible) as ei:
            cliente.generar("k", "prefijo", "¿A qué es alérgica?")
    finally:
        cliente.close()
    assert ei.value.codigo == "ia_no_disponible"


def test_prefijo_de_sistema_se_repite_identico() -> None:
    """Dos preguntas del mismo expediente mandan el mismo mensaje de sistema (caché KV)."""
    import httpx

    from cag.expediente import armar_prefijo
    from cag.ollama_cliente import OllamaCliente

    vistos: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        vistos.append(json.loads(request.content.decode()))
        return httpx.Response(200, json={"message": {"content": "{}"}})

    prefijo = armar_prefijo(ROSA, "codigo")
    cliente = OllamaCliente(transport=httpx.MockTransport(handler))
    try:
        cliente.generar("k", prefijo, "¿A qué es alérgica?")
        cliente.generar("k", prefijo, "¿Cuándo fue su última vacuna?")
    finally:
        cliente.close()
    assert vistos[0]["messages"][0] == vistos[1]["messages"][0]
    assert vistos[0]["messages"][0]["content"] == prefijo
    assert vistos[0]["keep_alive"] == "24h"
    assert vistos[0]["messages"][1]["content"] != vistos[1]["messages"][1]["content"]

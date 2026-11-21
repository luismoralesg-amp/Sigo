"""Validación del CUI / DPI de Guatemala.

Estructura (RENAP y SAT): 13 dígitos = 8 de correlativo + 1 dígito
verificador + 2 de departamento + 2 de municipio. La SAT también admite
la forma de 12 dígitos, que es el mismo número sin el cero a la izquierda
del correlativo; aquí se rellena con ese cero antes de validar.

Algoritmo del dígito verificador, según SAT, *Reglas y validaciones*
v1.7.9 (mayo de 2024), §5.1.4:

- Las últimas cuatro posiciones (departamento y municipio) NUNCA entran
  al cálculo.
- El dígito verificador es siempre el quinto de derecha a izquierda.
- Se multiplican los 7 u 8 dígitos del correlativo por coeficientes, se
  suman los productos, esa suma se multiplica por 10 y se aplica mod 11.

El anexo numera las posiciones 1..8 de derecha a izquierda, pero no
imprime la tabla de coeficientes. La implementación pública más usada
(y el ejemplo 1234567890101, cuyo dígito verificador es 9) equivale a:

    suma = Σ (dígito_i × (i + 2))  para i = 0..7 (pesos 2..9 de izquierda
           a derecha)
    dígito verificador = suma mod 11

Esa fórmula es algebraicamente idéntica a pesos 9..2 de izquierda a
derecha, con (suma × 10) mod 11, porque cada par de pesos suma 11 y
10 ≡ -1 (mod 11). Lo comprobamos en las pruebas con 10 000 correlativos
aleatorios.

Si el residuo es 10, no hay un dígito 0-9 que cumpla la regla. El anexo
de la SAT no define el mapeo 10 → 0 que usan algunos validadores no
oficiales. En esos casos devolvemos una advertencia (M-01).

Fuentes:
- RENAP, «¿Qué es el DPI y por qué tengo CUI?»: estructura de 13 dígitos.
  https://www.renap.gob.gt/noticias/que-es-el-dpi-y-por-que-tengo-cui
- SAT, *Reglas y validaciones* v1.7.9, §5.1.2 (depuración), §5.1.4
  (dígito verificador) y §5.1.5 (departamento y municipio).
  https://portal.sat.gob.gt/portal/descarga/14852/reglas-y-validaciones/78459/reglas-y-validaciones.pdf
- gt-utils-js (isValidCui), pesos 2..9 y ejemplo 1234567890101:
  https://github.com/rodmarzavala/gt-utils-js
- Gist de Rodrigo Polo (misma fórmula y conteo de municipios):
  https://gist.github.com/rodrigopolo/0de2c44c36accfa1561f530993d6ceab

Lo que no pudimos verificar en una fuente oficial completa:
- La tabla exacta de coeficientes no aparece impresa en el §5.1.4.
- El mapeo 10 → 0 no está en el anexo de la SAT.
- Los conteos de municipios del §5.1.5 pueden haberse desactualizado
  (la SAT advierte que la tabla cambia si se crean municipios). Usamos
  los de la v1.7.9. No seguimos el algoritmo de python-stdnum / rust
  stdnum, que aplica un % 10 y no coincide con la SAT ni con el ejemplo
  público 1234567890101.
"""

from __future__ import annotations

import re
import secrets
from dataclasses import dataclass, field
from datetime import date

# Conteos oficiales de la SAT, Reglas y validaciones v1.7.9, §5.1.5.
MUNICIPIOS_POR_DEPARTAMENTO: dict[str, int] = {
    "01": 17,  # Guatemala
    "02": 8,  # El Progreso
    "03": 16,  # Sacatepéquez
    "04": 16,  # Chimaltenango
    "05": 13,  # Escuintla
    "06": 14,  # Santa Rosa
    "07": 19,  # Sololá
    "08": 8,  # Totonicapán
    "09": 24,  # Quetzaltenango
    "10": 21,  # Suchitepéquez
    "11": 9,  # Retalhuleu
    "12": 30,  # San Marcos
    "13": 32,  # Huehuetenango
    "14": 21,  # Quiché
    "15": 8,  # Baja Verapaz
    "16": 17,  # Alta Verapaz
    "17": 14,  # Petén
    "18": 5,  # Izabal
    "19": 11,  # Zacapa
    "20": 11,  # Chiquimula
    "21": 7,  # Jalapa
    "22": 17,  # Jutiapa
}

NOMBRES_DEPARTAMENTO: dict[str, str] = {
    "01": "Guatemala",
    "02": "El Progreso",
    "03": "Sacatepéquez",
    "04": "Chimaltenango",
    "05": "Escuintla",
    "06": "Santa Rosa",
    "07": "Sololá",
    "08": "Totonicapán",
    "09": "Quetzaltenango",
    "10": "Suchitepéquez",
    "11": "Retalhuleu",
    "12": "San Marcos",
    "13": "Huehuetenango",
    "14": "Quiché",
    "15": "Baja Verapaz",
    "16": "Alta Verapaz",
    "17": "Petén",
    "18": "Izabal",
    "19": "Zacapa",
    "20": "Chiquimula",
    "21": "Jalapa",
    "22": "Jutiapa",
}

PESOS_IZQUIERDA_A_DERECHA: tuple[int, ...] = (2, 3, 4, 5, 6, 7, 8, 9)
PESOS_EQUIVALENTES_SAT: tuple[int, ...] = (9, 8, 7, 6, 5, 4, 3, 2)


@dataclass(frozen=True)
class ResultadoDPI:
    valido: bool
    cui: str | None
    correlativo: str | None = None
    digito_verificador: str | None = None
    departamento: str | None = None
    municipio: str | None = None
    nombre_departamento: str | None = None
    errores: list[str] = field(default_factory=list)
    advertencias: list[str] = field(default_factory=list)


def depurar_cui(valor: str | None) -> str:
    """SAT §5.1.2: se eliminan todos los caracteres que no sean dígitos."""
    if not valor:
        return ""
    return "".join(ch for ch in str(valor) if ch.isdigit())


def normalizar_cui(valor: str | None) -> str:
    """Devuelve 13 dígitos o el depurado original si no se puede normalizar.

    La SAT admite CUI de 12 dígitos (§5.1.4): es el de 13 sin el cero a
    la izquierda del correlativo. Lo rellenamos con ese cero.
    """
    depurado = depurar_cui(valor)
    if len(depurado) == 12:
        return "0" + depurado
    return depurado


def calcular_digito_verificador(correlativo: str) -> int | None:
    """Calcula el dígito verificador de un correlativo de 8 dígitos.

    Devuelve un entero 0-9, o None si el residuo es 10 (no representable).
    """
    if not (isinstance(correlativo, str) and len(correlativo) == 8 and correlativo.isdigit()):
        raise ValueError("El correlativo debe tener exactamente 8 dígitos.")
    residuo = suma_ponderada(correlativo, PESOS_IZQUIERDA_A_DERECHA) % 11
    if residuo == 10:
        return None
    return residuo


def suma_ponderada(correlativo: str, pesos: tuple[int, ...]) -> int:
    return sum(int(d) * w for d, w in zip(correlativo, pesos, strict=True))


def digito_verificador_formula_sat(correlativo: str) -> int | None:
    """Fórmula literal del §5.1.4: (suma × 10) mod 11, con pesos 9..2.

    Es equivalente a calcular_digito_verificador. Si el resultado es 10,
    no hay dígito representable y devolvemos None.
    """
    if not (isinstance(correlativo, str) and len(correlativo) == 8 and correlativo.isdigit()):
        raise ValueError("El correlativo debe tener exactamente 8 dígitos.")
    residuo = (suma_ponderada(correlativo, PESOS_EQUIVALENTES_SAT) * 10) % 11
    if residuo == 10:
        return None
    return residuo


def validar_cui(valor: str | None, *, verificador_estricto: bool = False) -> ResultadoDPI:
    """Valida el CUI / DPI.

    Errores (bloquean): vacío, no son 13 dígitos (o 12 rellenables), departamento fuera de 01-22.
    Advertencias (la enfermera confirma, M-01 y M-02): dígito verificador que no cuadra con la
    tabla pública (la SAT no imprime los coeficientes), residuo 10 y municipio fuera de la tabla
    SAT v1.7.9. Con verificador_estricto=True, el dígito verificador vuelve a ser error.
    """
    depurado = depurar_cui(valor)
    if not depurado:
        return ResultadoDPI(False, None, errores=["El CUI / DPI está vacío."])
    if valor is not None and any(ch.isalpha() for ch in str(valor)):
        return ResultadoDPI(False, None, errores=["El CUI / DPI solo lleva dígitos."])

    cui = normalizar_cui(valor)
    if len(cui) != 13:
        return ResultadoDPI(
            False,
            None,
            errores=[
                f"El CUI / DPI debe tener 13 dígitos (o 12, que se rellenan con un cero). Recibimos {len(depurado)}."
            ],
        )

    correlativo, dv, depto, muni = cui[:8], cui[8], cui[9:11], cui[11:13]
    errores: list[str] = []
    advertencias: list[str] = []

    calculado = calcular_digito_verificador(correlativo)
    if calculado is None:
        advertencias.append(
            "El correlativo da residuo 10; la SAT no define ese caso. La enfermera confirma el DPI con el documento."
        )
    elif str(calculado) != dv:
        mensaje = f"El dígito verificador no cuadra con la tabla pública (se esperaba {calculado} y vino {dv})."
        (errores if verificador_estricto else advertencias).append(mensaje)

    if depto not in MUNICIPIOS_POR_DEPARTAMENTO:
        errores.append(f"Código de departamento inválido: {depto}. Debe estar entre 01 y 22.")
    else:
        max_muni = MUNICIPIOS_POR_DEPARTAMENTO[depto]
        numero_muni = int(muni)
        if numero_muni < 1:
            errores.append(f"Código de municipio inválido: {muni}.")
        elif numero_muni > max_muni:
            advertencias.append(
                f"El municipio {muni} no está en la tabla SAT v1.7.9 de {NOMBRES_DEPARTAMENTO[depto]} "
                f"({max_muni} municipios). Puede ser un municipio nuevo; confirmalo."
            )

    return ResultadoDPI(
        not errores,
        cui,
        correlativo,
        dv,
        depto,
        muni,
        NOMBRES_DEPARTAMENTO.get(depto),
        errores,
        advertencias,
    )


def es_cui_valido(valor: str | None) -> bool:
    return validar_cui(valor).valido


TMP_PATRON = re.compile(r"^TMP-[0-9]{8}-[A-Z0-9]{4}$")
_ALFABETO_TMP = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def es_identificador_temporal(valor: str | None) -> bool:
    """Los niños sin DPI usan un ID temporal con formato TMP-AAAAMMDD-XXXX (M-06)."""
    if not valor:
        return False
    return bool(TMP_PATRON.match(str(valor).strip().upper()))


def generar_identificador_temporal(fecha: date, existentes: set[str] | None = None) -> str:
    """Genera un TMP- único: fecha de registro + 4 caracteres aleatorios."""
    existentes = existentes or set()
    while True:
        sufijo = "".join(secrets.choice(_ALFABETO_TMP) for _ in range(4))
        candidato = f"TMP-{fecha:%Y%m%d}-{sufijo}"
        if candidato not in existentes:
            return candidato

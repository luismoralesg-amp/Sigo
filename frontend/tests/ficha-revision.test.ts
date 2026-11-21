import { test } from "node:test";
import assert from "node:assert/strict";
import { armarConfirmacion, contarConfianzaBaja, esConfianzaBaja, planDeConfirmacion, UMBRAL_CONFIANZA_NUMERICA } from "../lib/ficha-revision";
import type { Extraccion } from "../lib/types";

test("el contrato solo tiene alta o baja, y baja se resalta", () => {
  assert.equal(esConfianzaBaja("baja"), true);
  assert.equal(esConfianzaBaja("alta"), false);
});

test("un puntaje viejo 0-1 usa el corte 0.8, sin inventar un campo", () => {
  assert.equal(UMBRAL_CONFIANZA_NUMERICA, 0.8);
  assert.equal(esConfianzaBaja(0.79), true);
  assert.equal(esConfianzaBaja(0.8), false);
  assert.equal(esConfianzaBaja(1), false);
  assert.equal(esConfianzaBaja(0), true);
});

test("lo que no es alta, baja ni un número se revisa", () => {
  assert.equal(esConfianzaBaja(null), true);
  assert.equal(esConfianzaBaja(undefined), true);
  assert.equal(esConfianzaBaja("media"), true);
  assert.equal(esConfianzaBaja(Number.NaN), true);
});

test("cuenta los campos de baja confianza de la extracción", () => {
  const ex = {
    paciente: {
      nombre: { valor: "Rosa Batz Tzoc", confianza: "alta" },
      dpi: { valor: "2547896330801", confianza: "alta" },
      fecha_nacimiento: { valor: "1984-03-12", confianza: "alta" },
      sexo: { valor: "F", confianza: "alta" },
      comunidad: { valor: "Chuicacá", confianza: "alta" },
      alergias: { valor: ["penicilina"], confianza: "alta" },
      condiciones_cronicas: { valor: [], confianza: "alta" },
    },
    consultas: [
      {
        fecha: { valor: "2025-08-14", confianza: "alta" },
        motivo: { valor: "Control prenatal", confianza: "alta" },
        diagnostico: { valor: "Embarazo 24 semanas", confianza: "baja" },
        tratamiento: { valor: "Sulfato ferroso", confianza: "alta" },
        vacunas: { valor: ["Td"], confianza: "alta" },
        pagina: 0,
      },
    ],
  } satisfies Extraccion;
  assert.equal(contarConfianzaBaja(ex), 1);
  assert.equal(contarConfianzaBaja(null), 0);
});

test("confirmar arma una versión nueva, sin DPI y con consentimiento", () => {
  const cuerpo = armarConfirmacion({
    paciente: {
      nombre: "  Rosa Batz Tzoc ",
      fecha_nacimiento: "1984-03-12",
      sexo: "F",
      comunidad: " Chuicacá ",
      alergias: "penicilina, sulfa",
      condiciones_cronicas: "",
    },
    consultas: [
      {
        fecha: "2025-08-14",
        motivo: "Control prenatal",
        diagnostico: "Embarazo 28 semanas",
        tratamiento: "Sulfato ferroso",
        vacunas: "Td, Influenza",
        pagina: 0,
      },
    ],
  });
  assert.equal(cuerpo.consentimiento, true);
  assert.equal("dpi" in cuerpo.paciente, false);
  assert.equal(cuerpo.paciente.nombre, "Rosa Batz Tzoc");
  assert.deepEqual(cuerpo.paciente.alergias, ["penicilina", "sulfa"]);
  assert.deepEqual(cuerpo.paciente.condiciones_cronicas, []);
  assert.equal(cuerpo.consultas[0].diagnostico, "Embarazo 28 semanas");
  assert.deepEqual(cuerpo.consultas[0].vacunas, ["Td", "Influenza"]);
});

test("corregir un campo no pisa la lectura: confirmar guarda el original y la corrección va aparte", () => {
  const base = {
    paciente: {
      nombre: "Rosa Batz Tzoc",
      fecha_nacimiento: "1984-03-12",
      sexo: "F" as const,
      comunidad: "Chuicacá",
      alergias: ["penicilina"],
      condiciones_cronicas: [] as string[],
    },
    consultas: [
      {
        fecha: "2025-08-14",
        motivo: "Control prenatal",
        diagnostico: "Embarazo 24 semanas",
        tratamiento: "Sulfato ferroso",
        vacunas: ["Td"],
        pagina: 0,
      },
    ],
    consentimiento: true as const,
  };
  const corregido = {
    ...base,
    consultas: [{ ...base.consultas[0], diagnostico: "Embarazo 28 semanas" }],
  };
  const plan = planDeConfirmacion(corregido, base);
  assert.equal(plan.confirmar.consultas[0].diagnostico, "Embarazo 24 semanas");
  assert.deepEqual(plan.consultas[0], { diagnostico: "Embarazo 28 semanas" });
  assert.equal(plan.paciente, null);
});

test("sin cambios, confirmar manda lo revisado y no arma corrección", () => {
  const base = {
    paciente: {
      nombre: "Rosa Batz Tzoc",
      fecha_nacimiento: null,
      sexo: null,
      comunidad: null,
      alergias: [] as string[],
      condiciones_cronicas: [] as string[],
    },
    consultas: [] as [],
    consentimiento: true as const,
  };
  const plan = planDeConfirmacion(base, base);
  assert.equal(plan.confirmar, base);
  assert.equal(plan.paciente, null);
  assert.deepEqual(plan.consultas, []);
});

test("un sexo que no es F o M se confirma como null", () => {
  const cuerpo = armarConfirmacion({
    paciente: {
      nombre: "Ana",
      fecha_nacimiento: "",
      sexo: "X",
      comunidad: "",
      alergias: "",
      condiciones_cronicas: "",
    },
    consultas: [],
  });
  assert.equal(cuerpo.paciente.sexo, null);
  assert.equal(cuerpo.paciente.fecha_nacimiento, null);
  assert.equal(cuerpo.paciente.comunidad, null);
});

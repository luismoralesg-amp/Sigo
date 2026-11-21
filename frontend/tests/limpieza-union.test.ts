import { test } from "node:test";
import assert from "node:assert/strict";
import { aNombrePropio, aOracion, fusionarListas, normalizarFecha, normalizarLista, normalizarSexo, normalizarDPI } from "../lib/limpieza";
import { sugerirMapeo, filaARegistro } from "../lib/mapeo";
import { fusionarPaciente, huellaConsulta, puntuarCoincidencia, similitudNombre } from "../lib/union";
import type { Paciente } from "../lib/tipos";

test("fechas de sistemas viejos", () => {
  assert.equal(normalizarFecha("12/03/15"), "2015-03-12");
  assert.equal(normalizarFecha("12-3-2015"), "2015-03-12");
  assert.equal(normalizarFecha("2015-03-12"), "2015-03-12");
  assert.equal(normalizarFecha("03/25/2016"), "2016-03-25"); // mes/día de Excel en inglés
  assert.equal(normalizarFecha("15/04/68"), "1968-04-15");
  assert.equal(normalizarFecha("10/03/24"), "2024-03-10");
  assert.equal(normalizarFecha("12 mar 2015"), "2015-03-12");
  assert.equal(normalizarFecha("42075"), "2015-03-12"); // serie de Excel
  assert.equal(normalizarFecha("31/02/2015"), null);
  assert.equal(normalizarFecha("N/A"), null);
});

test("mayúsculas, vacíos y listas", () => {
  assert.equal(aNombrePropio("ROSA ELENA TZUL BATZ "), "Rosa Elena Tzul Batz");
  assert.equal(aNombrePropio("maria de la cruz"), "Maria de la Cruz");
  assert.equal(aOracion("DOLOR DE CABEZA"), "Dolor de cabeza");
  assert.equal(normalizarSexo("FEM"), "F");
  assert.equal(normalizarDPI("2456-78901-0801"), "2456789010801");
  assert.equal(normalizarDPI("2456 7890"), "");
  assert.deepEqual(normalizarLista("PNC, sulfas"), ["Penicilina", "Sulfas"]);
  assert.deepEqual(normalizarLista("ninguna"), []);
  assert.deepEqual(normalizarLista("Acetaminofén 500 mg c/8h; Enalapril 10 mg"), ["Acetaminofén 500 mg c/8h", "Enalapril 10 mg"]);
});

test("fusionar alergias sin duplicar", () => {
  assert.deepEqual(fusionarListas(["Penicilina"], ["PENICILINA.", "alergia a penicilina", "Sulfas"]), ["Penicilina", "Sulfas"]);
  assert.deepEqual(fusionarListas(["Hipertensión arterial"], ["HTA", "DM2"]), ["Hipertensión arterial", "Diabetes mellitus tipo 2"]);
});

test("sugerencia de mapeo de columnas", () => {
  const m = sugerirMapeo(["No. DPI", "NOMBRE_PAC", "FEC_NAC", "SEXO", "FECHA CONSULTA", "MOTIVO", "DX", "TX / MEDICAMENTO", "ALERGIAS", "ANT. PATOLOGICOS", "VACUNA", "OBSERVACIONES"]);
  assert.equal(m["No. DPI"], "dpi_cui");
  assert.equal(m["NOMBRE_PAC"], "nombre");
  assert.equal(m["FEC_NAC"], "fecha_nacimiento");
  assert.equal(m["FECHA CONSULTA"], "fecha");
  assert.equal(m["DX"], "diagnostico");
  assert.equal(m["TX / MEDICAMENTO"], "medicamentos");
  assert.equal(m["ALERGIAS"], "alergias");
  assert.equal(m["ANT. PATOLOGICOS"], "condiciones_cronicas");
  assert.equal(m["VACUNA"], "vacunas");
  assert.equal(m["OBSERVACIONES"], "");
});

test("fila desordenada a registro limpio", () => {
  const { registro, valida } = filaARegistro(
    { "No. DPI": "2456 78901 0801", NOMBRE_PAC: "TZUL BATZ ROSA ELENA", FEC_NAC: "15/04/68", "FECHA CONSULTA": "03/25/2016", DX: "HTA", ALERGIAS: "PNC" },
    { "No. DPI": "dpi_cui", NOMBRE_PAC: "nombre", FEC_NAC: "fecha_nacimiento", "FECHA CONSULTA": "fecha", DX: "diagnostico", ALERGIAS: "alergias" }
  );
  assert.ok(valida);
  assert.equal(registro.dpi_cui, "2456789010801");
  assert.equal(registro.fecha, "2016-03-25");
  assert.deepEqual(registro.alergias, ["Penicilina"]);
});

const rosa: Paciente = { id: "1", dpi_cui: "2456789010801", nombre: "Rosa Elena Tzul Batz", fecha_nacimiento: "1968-04-15", sexo: "F", comunidad: "Aldea Chuicacá", alergias: ["Penicilina"], condiciones_cronicas: [] };

test("unión: duplicados y coincidencias", () => {
  // misma alergia escrita distinto no cambia nada; condición nueva sí
  assert.deepEqual(fusionarPaciente(rosa, { alergias: ["PNC"], condiciones_cronicas: ["HTA"] }), { condiciones_cronicas: ["Hipertensión arterial"] });
  // nombre en otro orden y sin tilde + misma fecha → coincidencia fuerte
  assert.ok(similitudNombre("TZUL BATZ ROSA ELENA", rosa.nombre) > 0.99);
  assert.ok(puntuarCoincidencia(rosa, "Rosa Tzul", "1968-04-15") >= 65);
  assert.ok(puntuarCoincidencia(rosa, "Juana Tzoc", "1990-01-01") < 45);
  // la misma consulta importada dos veces tiene la misma huella
  assert.equal(
    huellaConsulta({ paciente_id: "1", fecha: "2016-03-25", motivo: "DOLOR DE CABEZA" }),
    huellaConsulta({ paciente_id: "1", fecha: "2016-03-25", motivo: "Dolor de cabeza." })
  );
});

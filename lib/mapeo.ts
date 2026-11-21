import type { RegistroClinico } from "./tipos";
import { aNombrePropio, aOracion, clave, limpiarTexto, normalizarDPI, normalizarFecha, normalizarLista, normalizarSexo } from "./limpieza";

export type CampoDestino = keyof RegistroClinico;

export const CAMPOS: Array<{ id: CampoDestino; etiqueta: string; grupo: "paciente" | "consulta"; requerido?: boolean }> = [
  { id: "dpi_cui", etiqueta: "DPI / CUI", grupo: "paciente" },
  { id: "nombre", etiqueta: "Nombre completo", grupo: "paciente", requerido: true },
  { id: "fecha_nacimiento", etiqueta: "Fecha de nacimiento", grupo: "paciente" },
  { id: "sexo", etiqueta: "Sexo", grupo: "paciente" },
  { id: "comunidad", etiqueta: "Comunidad", grupo: "paciente" },
  { id: "alergias", etiqueta: "Alergias", grupo: "paciente" },
  { id: "condiciones_cronicas", etiqueta: "Condiciones crónicas", grupo: "paciente" },
  { id: "fecha", etiqueta: "Fecha de consulta", grupo: "consulta", requerido: true },
  { id: "motivo", etiqueta: "Motivo", grupo: "consulta" },
  { id: "diagnostico", etiqueta: "Diagnóstico", grupo: "consulta" },
  { id: "tratamiento", etiqueta: "Tratamiento", grupo: "consulta" },
  { id: "medicamentos", etiqueta: "Medicamentos", grupo: "consulta" },
  { id: "vacunas", etiqueta: "Vacunas", grupo: "consulta" },
];

const SINONIMOS: Record<CampoDestino, string[]> = {
  dpi_cui: ["dpi", "cui", "no dpi", "num dpi", "numero dpi", "documento", "cedula", "dpi cui", "no documento", "identificacion"],
  nombre: ["nombre", "nombres", "paciente", "nombre paciente", "nombre pac", "nom pac", "nombre completo", "apellidos y nombres"],
  fecha_nacimiento: ["fecha nacimiento", "fec nac", "f nac", "fnac", "nacimiento", "fecha nac", "f nacimiento"],
  sexo: ["sexo", "genero", "sx"],
  comunidad: ["comunidad", "aldea", "direccion", "residencia", "lugar", "caserio", "procedencia"],
  alergias: ["alergias", "alergia", "alergico a", "alerg"],
  condiciones_cronicas: ["antecedentes", "cronicos", "enfermedades cronicas", "condiciones", "ant patologicos", "antecedentes patologicos", "enf cronica"],
  fecha: ["fecha", "fecha consulta", "fec consulta", "fecha atencion", "f consulta", "fecha visita", "fec cons"],
  motivo: ["motivo", "motivo consulta", "mot consulta", "consulta por", "queja", "sintomas"],
  diagnostico: ["diagnostico", "dx", "diag", "impresion clinica", "ic"],
  tratamiento: ["tratamiento", "tx", "plan", "indicaciones", "conducta"],
  medicamentos: ["medicamentos", "medicamento", "tx medicamento", "medicinas", "farmacos", "receta", "tx medicamentos"],
  vacunas: ["vacunas", "vacuna", "inmunizaciones", "vac", "biologico"],
};

function puntaje(encabezado: string, campo: CampoDestino): number {
  const h = clave(encabezado);
  let mejor = 0;
  for (const s of SINONIMOS[campo]) {
    if (h === s) return 100;
    if (h.replace(/ /g, "") === s.replace(/ /g, "")) mejor = Math.max(mejor, 95);
    else if (h.startsWith(s + " ") || h.endsWith(" " + s)) mejor = Math.max(mejor, 70 + s.length);
    else if (h.includes(s) && s.length >= 3) mejor = Math.max(mejor, 50 + s.length);
  }
  return mejor;
}

/** Sugiere a qué campo va cada columna. Cada campo se usa una sola vez (el mejor puntaje gana). */
export function sugerirMapeo(encabezados: string[]): Record<string, CampoDestino | ""> {
  const pares: Array<{ col: string; campo: CampoDestino; p: number }> = [];
  for (const col of encabezados) for (const { id } of CAMPOS) {
    const p = puntaje(col, id);
    if (p >= 55) pares.push({ col, campo: id, p });
  }
  pares.sort((a, b) => b.p - a.p);
  const resultado: Record<string, CampoDestino | ""> = Object.fromEntries(encabezados.map((e) => [e, ""]));
  const usados = new Set<CampoDestino>();
  const asignadas = new Set<string>();
  for (const { col, campo } of pares) {
    if (usados.has(campo) || asignadas.has(col)) continue;
    resultado[col] = campo;
    usados.add(campo);
    asignadas.add(col);
  }
  return resultado;
}

export interface FilaLimpia {
  registro: RegistroClinico;
  problemas: string[];
  valida: boolean;
}

/** Aplica el mapeo y la limpieza a una fila del sistema antiguo. */
export function filaARegistro(fila: Record<string, unknown>, mapeo: Record<string, CampoDestino | "">): FilaLimpia {
  const crudo: Partial<Record<CampoDestino, unknown[]>> = {};
  for (const [col, campo] of Object.entries(mapeo)) {
    if (!campo) continue;
    (crudo[campo] ??= []).push(fila[col]);
  }
  const uno = (c: CampoDestino) => (crudo[c] ?? []).find((v) => limpiarTexto(v) !== "" || v instanceof Date);
  const todos = (c: CampoDestino) => (crudo[c] ?? []).flat();

  const registro: RegistroClinico = {
    dpi_cui: normalizarDPI(uno("dpi_cui")),
    nombre: aNombrePropio(uno("nombre")),
    fecha_nacimiento: normalizarFecha(uno("fecha_nacimiento")) ?? "",
    sexo: normalizarSexo(uno("sexo")),
    comunidad: aNombrePropio(uno("comunidad")),
    alergias: normalizarLista(todos("alergias")),
    condiciones_cronicas: normalizarLista(todos("condiciones_cronicas")),
    fecha: normalizarFecha(uno("fecha")) ?? "",
    motivo: aOracion(uno("motivo")),
    diagnostico: aOracion(uno("diagnostico")),
    tratamiento: aOracion(uno("tratamiento")),
    medicamentos: normalizarLista(todos("medicamentos")),
    vacunas: normalizarLista(todos("vacunas")),
  };

  const problemas: string[] = [];
  if (!registro.nombre) problemas.push("Sin nombre");
  if (!registro.fecha) problemas.push("Fecha de consulta ilegible");
  if (!registro.dpi_cui && limpiarTexto(uno("dpi_cui"))) problemas.push("DPI incompleto");
  if (!registro.dpi_cui && !registro.fecha_nacimiento) problemas.push("Sin DPI ni fecha de nacimiento");
  const valida = Boolean(registro.nombre && registro.fecha);
  return { registro, problemas, valida };
}

/** Clave de paciente para contar pacientes distintos en la vista previa. */
export function clavePaciente(r: RegistroClinico): string {
  return r.dpi_cui || `${clave(r.nombre)}|${r.fecha_nacimiento}`;
}

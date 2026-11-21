/**
 * Revisión de una ficha antes de confirmar.
 *
 * Confianza. El contrato v1 (CampoTexto, CampoLista, CampoSexo) solo trae
 * `confianza: "alta" | "baja"`. No hay puntaje ni umbral. Se resalta "baja".
 *
 * Si un módulo viejo colara un número 0–1 (el borrador v0, que el API ya no
 * emite), se trata como baja cuando es menor que 0.8. Es el mismo corte del
 * normalizador interno del backend (`extraccion.py`); el contrato no lo publica
 * y la pantalla no muestra el número. Cualquier otro valor se revisa: no se da
 * por bueno un campo que no entendemos.
 *
 * Confirmar. POST /fichas/{id}/confirmar guarda lo revisado como versión nueva.
 * El cuerpo no lleva el DPI (no se corrige) y `consentimiento` es true.
 */
import type { Extraccion } from "@/lib/types";
import type { ConfirmarFicha } from "@/lib/api/cliente";

/** Inclusive por arriba: 0.8 y más se lee como confianza alta. */
export const UMBRAL_CONFIANZA_NUMERICA = 0.8;

export function esConfianzaBaja(confianza: unknown): boolean {
  if (confianza === "baja") return true;
  if (confianza === "alta") return false;
  if (typeof confianza === "number" && Number.isFinite(confianza)) {
    return confianza < UMBRAL_CONFIANZA_NUMERICA;
  }
  return true;
}

export function textoDeCampo(valor: string | string[] | null | undefined): string {
  if (Array.isArray(valor)) return valor.join(", ");
  return valor ?? "";
}

export function contarConfianzaBaja(ex: Extraccion | null | undefined): number {
  if (!ex) return 0;
  const p = ex.paciente;
  const campos = [
    p.nombre,
    p.dpi,
    p.fecha_nacimiento,
    p.sexo,
    p.comunidad,
    p.alergias,
    p.condiciones_cronicas,
    ...ex.consultas.flatMap((c) => [c.fecha, c.motivo, c.diagnostico, c.tratamiento, c.vacunas]),
  ];
  return campos.filter((c) => esConfianzaBaja(c.confianza)).length;
}

const aLista = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export type CamposConfirmables = {
  paciente: {
    nombre: string;
    fecha_nacimiento: string;
    sexo: string;
    comunidad: string;
    alergias: string;
    condiciones_cronicas: string;
  };
  consultas: Array<{
    fecha: string;
    motivo: string;
    diagnostico: string;
    tratamiento: string;
    vacunas: string;
    pagina: number;
  }>;
};

export type CorreccionPlanPaciente = {
  nombre?: string;
  fecha_nacimiento?: string | null;
  sexo?: "F" | "M" | null;
  comunidad?: string | null;
  alergias?: string[];
  condiciones_cronicas?: string[];
};

export type CorreccionPlanConsulta = {
  fecha?: string | null;
  motivo?: string | null;
  diagnostico?: string | null;
  tratamiento?: string | null;
  vacunas?: string[];
};

/**
 * Si la enfermera cambió algo, confirmar guarda la lectura original (versión 1)
 * y la corrección va después por POST .../versiones. Así no se pisa lo leído.
 * Si no cambió nada, un solo confirmar basta.
 */
export function planDeConfirmacion(actual: ConfirmarFicha, original: ConfirmarFicha): {
  confirmar: ConfirmarFicha;
  paciente: CorreccionPlanPaciente | null;
  consultas: Array<CorreccionPlanConsulta | null>;
} {
  const paciente = diffPaciente(actual.paciente, original.paciente);
  const consultas = actual.consultas.map((c, i) => diffConsulta(c, original.consultas[i]));
  const hayCorreccion = Boolean(paciente) || consultas.some(Boolean);
  return { confirmar: hayCorreccion ? original : actual, paciente, consultas };
}

function diffPaciente(actual: ConfirmarFicha["paciente"], original: ConfirmarFicha["paciente"] | undefined): CorreccionPlanPaciente | null {
  if (!original) return null;
  const out: CorreccionPlanPaciente = {};
  if (actual.nombre !== original.nombre) out.nombre = actual.nombre;
  if (actual.fecha_nacimiento !== original.fecha_nacimiento) out.fecha_nacimiento = actual.fecha_nacimiento;
  if (actual.sexo !== original.sexo) out.sexo = actual.sexo;
  if (actual.comunidad !== original.comunidad) out.comunidad = actual.comunidad;
  if (!mismaLista(actual.alergias, original.alergias)) out.alergias = actual.alergias;
  if (!mismaLista(actual.condiciones_cronicas, original.condiciones_cronicas)) out.condiciones_cronicas = actual.condiciones_cronicas;
  return Object.keys(out).length ? out : null;
}

function diffConsulta(
  actual: ConfirmarFicha["consultas"][number] | undefined,
  original: ConfirmarFicha["consultas"][number] | undefined
): CorreccionPlanConsulta | null {
  if (!actual || !original) return null;
  const out: CorreccionPlanConsulta = {};
  if (actual.fecha !== original.fecha) out.fecha = actual.fecha;
  if (actual.motivo !== original.motivo) out.motivo = actual.motivo;
  if (actual.diagnostico !== original.diagnostico) out.diagnostico = actual.diagnostico;
  if (actual.tratamiento !== original.tratamiento) out.tratamiento = actual.tratamiento;
  if (!mismaLista(actual.vacunas, original.vacunas)) out.vacunas = actual.vacunas;
  return Object.keys(out).length ? out : null;
}

function mismaLista(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Cuerpo de POST /fichas/{id}/confirmar. Sin DPI: el contrato no lo corrige. */
export function armarConfirmacion(datos: CamposConfirmables): ConfirmarFicha {
  const sexo = datos.paciente.sexo === "F" || datos.paciente.sexo === "M" ? datos.paciente.sexo : null;
  return {
    paciente: {
      nombre: datos.paciente.nombre.trim(),
      fecha_nacimiento: datos.paciente.fecha_nacimiento || null,
      sexo,
      comunidad: datos.paciente.comunidad.trim() || null,
      alergias: aLista(datos.paciente.alergias),
      condiciones_cronicas: aLista(datos.paciente.condiciones_cronicas),
    },
    consultas: datos.consultas.map((c) => ({
      fecha: c.fecha || null,
      motivo: c.motivo || null,
      diagnostico: c.diagnostico || null,
      tratamiento: c.tratamiento || null,
      vacunas: aLista(c.vacunas),
      pagina: c.pagina,
    })),
    consentimiento: true,
  };
}

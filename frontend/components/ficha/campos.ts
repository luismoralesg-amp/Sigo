import type { LecturaFicha } from "@/lib/ia";
import type { Confianza } from "@/lib/tipos";

export type TipoCampo = "texto" | "dpi" | "fecha" | "sexo" | "largo" | "lista";

export interface DefCampo {
  clave: string;
  grupo: "paciente" | "consulta";
  etiqueta: string;
  tipo: TipoCampo;
  alertaClinica?: boolean;
}

export const DEFINICION: DefCampo[] = [
  { clave: "nombre", grupo: "paciente", etiqueta: "Nombre completo", tipo: "texto" },
  { clave: "dpi_cui", grupo: "paciente", etiqueta: "DPI / CUI", tipo: "dpi" },
  { clave: "fecha_nacimiento", grupo: "paciente", etiqueta: "Fecha de nacimiento", tipo: "fecha" },
  { clave: "sexo", grupo: "paciente", etiqueta: "Sexo", tipo: "sexo" },
  { clave: "comunidad", grupo: "paciente", etiqueta: "Comunidad", tipo: "texto" },
  { clave: "alergias", grupo: "paciente", etiqueta: "Alergias", tipo: "lista", alertaClinica: true },
  { clave: "condiciones_cronicas", grupo: "paciente", etiqueta: "Condiciones crónicas", tipo: "lista" },
  { clave: "fecha", grupo: "consulta", etiqueta: "Fecha de la consulta", tipo: "fecha" },
  { clave: "motivo", grupo: "consulta", etiqueta: "Motivo de consulta", tipo: "largo" },
  { clave: "diagnostico", grupo: "consulta", etiqueta: "Diagnóstico", tipo: "largo" },
  { clave: "tratamiento", grupo: "consulta", etiqueta: "Tratamiento", tipo: "largo" },
  { clave: "medicamentos", grupo: "consulta", etiqueta: "Medicamentos", tipo: "lista" },
  { clave: "vacunas", grupo: "consulta", etiqueta: "Vacunas", tipo: "lista" },
];

export interface EstadoCampo {
  def: DefCampo;
  valor: string; // las listas van una por línea
  confianza: Confianza;
  revisado: boolean;
  editado: boolean;
}

export const necesitaRevision = (c: Pick<EstadoCampo, "confianza">) => c.confianza !== "alta";

const ORDEN: Record<Confianza, number> = { baja: 0, media: 1, alta: 2 };

/** Convierte la lectura en campos editables; los dudosos van primero. */
export function aCampos(l: LecturaFicha): EstadoCampo[] {
  const campos = DEFINICION.map((def) => {
    const fuente = (l[def.grupo] as Record<string, { valor: string | string[]; confianza: Confianza }>)[def.clave];
    const valor = Array.isArray(fuente.valor) ? fuente.valor.join("\n") : fuente.valor;
    return { def, valor, confianza: fuente.confianza, revisado: fuente.confianza === "alta", editado: false };
  });
  return campos
    .map((c, i) => ({ c, i }))
    .sort((a, b) => ORDEN[a.c.confianza] - ORDEN[b.c.confianza] || a.i - b.i)
    .map(({ c }) => c);
}

export function valorDe(campos: EstadoCampo[], clave: string): string {
  return campos.find((c) => c.def.clave === clave)?.valor ?? "";
}

export function listaDe(campos: EstadoCampo[], clave: string): string[] {
  return valorDe(campos, clave).split("\n").map((s) => s.trim()).filter(Boolean);
}

/**
 * Limpieza de datos que vienen de papel o de sistemas antiguos:
 * fechas dd/mm/aa, MAYÚSCULAS, celdas vacías, listas separadas de mil formas.
 * Funciones puras: se usan igual en el navegador (vista previa) y en el servidor.
 */

const VACIOS = new Set(["", "-", "--", "—", ".", "n/a", "na", "n.a.", "s/d", "sd", "no", "ninguno", "ninguna", "ningun", "ningún", "null", "none", "nan", "0", "x", "?", "no refiere", "niega", "sin dato", "sin datos", "nr"]);

export function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Clave para comparar textos: sin tildes, minúsculas, sin puntuación ni espacios dobles. */
export function clave(t: string | null | undefined): string {
  return sinTildes((t ?? "").toLowerCase())
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function esVacio(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return VACIOS.has(String(v).trim().toLowerCase());
}

export function limpiarTexto(v: unknown): string {
  if (esVacio(v)) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "o", "a", "en", "con", "por", "para", "x", "c/", "mg", "ml", "g"]);

/** "ROSA ELENA TZUL BATZ" → "Rosa Elena Tzul Batz". Respeta textos que ya vienen bien escritos. */
export function aNombrePropio(v: unknown): string {
  const t = limpiarTexto(v);
  if (!t) return "";
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
  const enMayusculas = letras.length > 0 && letras === letras.toUpperCase();
  const enMinusculas = letras.length > 0 && letras === letras.toLowerCase();
  if (!enMayusculas && !enMinusculas) return t;
  return t
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Para textos clínicos: solo baja las MAYÚSCULAS sostenidas a oración ("DOLOR DE CABEZA" → "Dolor de cabeza"). */
export function aOracion(v: unknown): string {
  const t = limpiarTexto(v);
  if (!t) return "";
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
  if (letras.length < 4 || letras !== letras.toUpperCase()) return t;
  const bajo = t.toLowerCase();
  return bajo.charAt(0).toUpperCase() + bajo.slice(1);
}

const AÑO_ACTUAL_2D = new Date().getFullYear() % 100;

function año4(a: number): number {
  if (a >= 100) return a;
  return a > AÑO_ACTUAL_2D ? 1900 + a : 2000 + a;
}

function iso(a: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 1900 || a > 2100) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCMonth() !== m - 1) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const MESES_TXT: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
};

/**
 * Convierte fechas de sistemas viejos a ISO (aaaa-mm-dd).
 * Acepta: 12/03/15, 12-3-2015, 2015-03-12, 12.03.2015, "12 mar 2015", números de serie de Excel.
 * Prioriza el orden guatemalteco día/mes; si el mes no es posible, intenta mes/día (Excel en inglés).
 */
export function normalizarFecha(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  const t = limpiarTexto(v).toLowerCase();
  if (!t) return null;

  // número de serie de Excel (días desde 1899-12-30)
  if (/^\d{4,5}(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (n > 7000 && n < 80000) {
      const f = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
      return iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
    }
  }

  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = t.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})$/);
  if (m) {
    const a = año4(+m[3]);
    return iso(a, +m[2], +m[1]) ?? iso(a, +m[1], +m[2]);
  }

  m = t.match(/^(\d{1,2})[\s/-]*(?:de\s+)?([a-z]{3})[a-z]*\.?[\s/-]*(?:de\s+)?(\d{2,4})$/);
  if (m && MESES_TXT[m[2]]) return iso(año4(+m[3]), MESES_TXT[m[2]], +m[1]);

  // aaaammdd
  m = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  return null;
}

export function normalizarSexo(v: unknown): "F" | "M" | "" {
  const t = clave(String(v ?? ""));
  if (!t) return "";
  if (["f", "fem", "femenino", "mujer", "femenina", "m f"].includes(t) || t.startsWith("fem")) return "F";
  if (["m", "masc", "masculino", "hombre", "h", "varon"].includes(t) || t.startsWith("masc")) return "M";
  return "";
}

export function normalizarDPI(v: unknown): string {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 13 ? d : "";
}

/** "PENICILINA; sulfas / Aspirina" → ["PENICILINA","sulfas","Aspirina"] */
export function separarLista(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(separarLista);
  const t = limpiarTexto(v);
  if (!t) return [];
  return t
    .split(/\s*[,;|+\n]\s*|\s+y\s+|\s+\/\s+|(?<=[a-záéíóúñ]{3})\/(?=[a-záéíóúñ]{3})/i)
    .map((p) => p.replace(/^[-•*.\s]+|[.\s]+$/g, "").trim())
    .filter((p) => p && !esVacio(p));
}

const SINONIMOS: Array<[RegExp, string]> = [
  [/^(alergi[ac]o?a? (a )?)?(la )?(penicilina|pnc|penicil\w*|peni)$/, "Penicilina"],
  [/^(amoxicilina|amoxi)$/, "Amoxicilina"],
  [/^(sulfas?|sulfa\w*|sulfonamidas?)$/, "Sulfas"],
  [/^(asa|aspirina|acido acetilsalicilico)$/, "Aspirina"],
  [/^(hta|hipertension( arterial)?|presion alta)$/, "Hipertensión arterial"],
  [/^(dm ?2?|dmt2|diabetes( mellitus)?( tipo 2| tipo ii)?|azucar alta)$/, "Diabetes mellitus tipo 2"],
  [/^(asma( bronquial)?)$/, "Asma"],
  [/^(epilepsia|convulsiones)$/, "Epilepsia"],
];

/** Lleva cada elemento a una forma canónica para no duplicar "PNC" y "Penicilina". */
export function canonico(item: string): string {
  const k = clave(item);
  for (const [re, nombre] of SINONIMOS) if (re.test(k)) return nombre;
  return aOracion(item);
}

export function normalizarLista(v: unknown): string[] {
  return fusionarListas([], separarLista(v));
}

/** Une listas sin duplicar (comparando sin tildes ni mayúsculas). */
export function fusionarListas(actual: string[] | null | undefined, nuevos: string[] | null | undefined): string[] {
  const salida: string[] = [];
  const vistos = new Set<string>();
  for (const item of [...(actual ?? []), ...(nuevos ?? [])]) {
    const c = canonico(item);
    const k = clave(c);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    salida.push(c);
  }
  return salida;
}

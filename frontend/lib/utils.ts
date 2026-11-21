import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ZONA_GT = "America/Guatemala";

/** Solo dígitos del DPI/CUI. */
export function soloDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Formato XXXX XXXXX XXXX (también parcial, mientras se escribe). */
export function formatearDPI(v: string | null | undefined): string {
  const d = soloDigitos(v).slice(0, 13);
  const partes = [d.slice(0, 4), d.slice(4, 9), d.slice(9, 13)].filter(Boolean);
  return partes.join(" ");
}

export function dpiValido(v: string | null | undefined): boolean {
  return soloDigitos(v).length === 13;
}

export function edad(fechaNacimiento: string | null | undefined, hoy = new Date()): number | null {
  if (!fechaNacimiento) return null;
  const n = new Date(fechaNacimiento + "T12:00:00");
  if (Number.isNaN(n.getTime())) return null;
  let e = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) e--;
  return e;
}

/** "3 años", "8 meses" (para niños pequeños). */
export function edadTexto(fechaNacimiento: string | null | undefined): string | null {
  if (!fechaNacimiento) return null;
  const e = edad(fechaNacimiento);
  if (e === null) return null;
  if (e >= 2) return `${e} años`;
  const n = new Date(fechaNacimiento + "T12:00:00");
  const hoy = new Date();
  const meses = (hoy.getFullYear() - n.getFullYear()) * 12 + (hoy.getMonth() - n.getMonth()) - (hoy.getDate() < n.getDate() ? 1 : 0);
  return meses === 1 ? "1 mes" : `${meses} meses`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** 2024-03-12 → "12 mar 2024" */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return iso;
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** Fecha y hora de la bitácora: "hoy 10:42", "ayer 08:15", "12 mar 2024 · 10:42". */
export function momentoBitacora(isoTs: string, ahora = new Date()): string {
  const f = new Date(isoTs);
  const dia = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_GT, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const hora = new Intl.DateTimeFormat("es-GT", { timeZone: ZONA_GT, hour: "2-digit", minute: "2-digit", hour12: false }).format(f);
  const hoyStr = dia(ahora);
  const ayer = new Date(ahora.getTime() - 86400000);
  const fStr = dia(f);
  if (fStr === hoyStr) return `hoy ${hora}`;
  if (fStr === dia(ayer)) return `ayer ${hora}`;
  return `${fechaCorta(fStr)} · ${hora}`;
}

/** Inicio del día de hoy en Guatemala, en ISO UTC. */
export function inicioDeHoyGT(ahora = new Date()): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_GT, year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
  return new Date(`${ymd}T00:00:00-06:00`).toISOString();
}

export function primerNombre(nombre: string | null | undefined): string {
  const n = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "el paciente";
}

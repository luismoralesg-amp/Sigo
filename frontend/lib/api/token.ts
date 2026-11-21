/**
 * Dónde vive el token Bearer.
 * - Paciente: el que da POST /auth/paciente, en localStorage para que la PWA la recuerde.
 * - Personal: el token de POST /dev/sesion (origen "dev"). Con NEXT_PUBLIC_SIGO_AUTH=supabase, el access_token de Supabase.
 * Todo envuelto en try/catch: en modo privado o sin almacenamiento, la sesión vive solo en memoria.
 */

export type TipoSesion = "personal" | "paciente";
export type OrigenSesion = "dev" | "supabase";

const CLAVE = "sigo:sesion";
let enMemoria: { token: string; tipo: TipoSesion; origen?: OrigenSesion } | null = null;

export function leerSesion(): { token: string; tipo: TipoSesion; origen?: OrigenSesion } | null {
  if (enMemoria) return enMemoria;
  try {
    const crudo = localStorage.getItem(CLAVE);
    enMemoria = crudo ? JSON.parse(crudo) : null;
  } catch {
    enMemoria = null;
  }
  return enMemoria;
}

export function leerToken(): string | null {
  return leerSesion()?.token ?? null;
}

export function guardarSesion(token: string, tipo: TipoSesion, origen?: OrigenSesion) {
  enMemoria = origen ? { token, tipo, origen } : { token, tipo };
  try {
    localStorage.setItem(CLAVE, JSON.stringify(enMemoria));
  } catch {
    /* solo en memoria */
  }
}

export function borrarSesion() {
  enMemoria = null;
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* nada que borrar */
  }
}

/** Pantalla de entrada que corresponde a quien perdió la sesión. */
export function rutaDeEntrada(tipo: TipoSesion | null | undefined): string {
  return tipo === "paciente" ? "/mi/entrar" : "/login";
}

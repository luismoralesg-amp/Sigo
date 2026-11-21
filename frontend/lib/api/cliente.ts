/**
 * Cliente del API de Sigo: las 20 rutas de docs/contrato-v3.md, "Contrato de API" (rutas por id).
 * - Base: `${NEXT_PUBLIC_API_URL}/api/v1`.
 * - Siempre `Authorization: Bearer <token>`. El rol y el centro los saca el backend del token; aquí nunca se mandan.
 * - Errores: lanza ErrorApi con { status, codigo, mensaje } del contrato.
 * - Advertencias (p. ej. dpi_dudoso) no son errores: vienen dentro de la respuesta 201 y la pantalla las pinta en amarillo.
 * - Mientras el backend no esté, las peticiones van al servidor simulado (lib/api/mock), que parte de contrato/mocks/*.json
 *   y devuelve objetos Response con la misma forma. Se activa con NEXT_PUBLIC_SIGO_MOCKS=1 o si no hay NEXT_PUBLIC_API_URL.
 */
import type { Acceso, CodigoTemporal, Consulta, Expediente, Ficha, Fuente, Identificador, Paciente, ResultadoImportacion, Usuario, Version } from "@/lib/types";
import { ErrorApi, leerError } from "./errores";
import { leerToken } from "./token";

const URL_API = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const USA_MOCKS = process.env.NEXT_PUBLIC_SIGO_MOCKS === "1" || !URL_API;
export const BASE = `${URL_API}/api/v1`;
/** Modo demo del contrato: el acceso por código dura 2 minutos en vez de 2 horas. NEXT_PUBLIC_SIGO_MODO_DEMO=0 lo apaga. */
export const MODO_DEMO = process.env.NEXT_PUBLIC_SIGO_MODO_DEMO !== "0";
export const DURACION_ACCESO_TEXTO = MODO_DEMO ? "2 minutos (modo demo)" : "2 horas";

/** DPI de 13 dígitos o TMP-AAAAMMDD-XXXX. */
export const PATRON_IDENTIFICADOR = /^([0-9]{13}|TMP-[0-9]{8}-[A-Z0-9]{4})$/;

export function esIdentificador(v: string): boolean {
  return PATRON_IDENTIFICADOR.test(v);
}

/** Limpia lo que se escribe: quita espacios y guiones del DPI; respeta el formato TMP-. */
export function normalizarIdentificador(v: string): string {
  const t = v.trim().toUpperCase();
  if (t.startsWith("TMP")) {
    const s = t.replace(/[^A-Z0-9]/g, "");
    return s.length === 15 ? `TMP-${s.slice(3, 11)}-${s.slice(11)}` : t;
  }
  return t.replace(/\D/g, "");
}

export interface Peticion {
  metodo: "GET" | "POST" | "PUT";
  ruta: string; // sin /api/v1, con query si la hay
  json?: unknown;
  form?: FormData;
  token: string | null;
}

async function enviar(p: Peticion): Promise<Response> {
  if (USA_MOCKS) {
    const { responder } = await import("./mock/servidor");
    return responder(p);
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (p.token) headers.Authorization = `Bearer ${p.token}`;
  if (p.json !== undefined) headers["Content-Type"] = "application/json";
  return fetch(BASE + p.ruta, {
    method: p.metodo,
    headers,
    body: p.form ?? (p.json !== undefined ? JSON.stringify(p.json) : undefined),
  });
}

async function pedir(metodo: Peticion["metodo"], ruta: string, cuerpo?: { json?: unknown; form?: FormData }): Promise<Response> {
  let r: Response;
  try {
    r = await enviar({ metodo, ruta, token: leerToken(), ...cuerpo });
  } catch {
    // fetch solo lanza si la petición no llegó: sin señal, DNS, CORS.
    throw new ErrorApi(0, "sin_senal");
  }
  if (!r.ok) throw await leerError(r);
  return r;
}

async function json<T>(metodo: Peticion["metodo"], ruta: string, cuerpo?: { json?: unknown; form?: FormData }): Promise<T> {
  const r = await pedir(metodo, ruta, cuerpo);
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

const seg = (v: string) => encodeURIComponent(v);

// ---------------------------------------------------------------- cuerpos y respuestas

export type DatosNuevoPaciente = {
  dpi: Identificador | null; // null = niño o ficha vieja sin DPI; el backend genera el TMP-
  nombre: string;
  fecha_nacimiento: string | null;
  sexo: "F" | "M" | null;
  comunidad: string | null;
  telefono: string | null;
};
export type Advertencia = "dpi_dudoso";
export type PacienteCreado = { paciente: Paciente; pin_inicial: string; advertencias: Advertencia[] };

export type ConsultaConfirmada = {
  fecha: string | null;
  motivo: string | null;
  diagnostico: string | null;
  tratamiento: string | null;
  vacunas: string[];
  pagina: number;
};
/** Body de POST /fichas/{id}/confirmar: el paciente completo salvo el dpi, que no se corrige desde la app. */
export type ConfirmarFicha = {
  paciente: Pick<Paciente, "nombre" | "fecha_nacimiento" | "sexo" | "comunidad" | "alergias" | "condiciones_cronicas">;
  consultas: ConsultaConfirmada[];
  consentimiento: boolean;
};

export type CorreccionConsulta = Partial<Pick<Consulta, "fecha" | "motivo" | "diagnostico" | "tratamiento" | "vacunas">> & { motivo_cambio: string };
export type CorreccionPaciente = Partial<Pick<Paciente, "nombre" | "fecha_nacimiento" | "sexo" | "comunidad" | "alergias" | "condiciones_cronicas">> & { motivo_cambio: string };

export const FORMATOS_EXPORTAR = ["pdf", "docx", "xlsx", "txt", "md", "html", "json"] as const;
export type FormatoExportar = (typeof FORMATOS_EXPORTAR)[number];

export type AccesoAbierto = { paciente_id: string; acceso_vence_en: string };
export type AccesoEmergencia = AccesoAbierto & { tipo_acceso: "emergencia" };

// ---------------------------------------------------------------- las 20 rutas

export const api = {
  // Entrar
  /** 1. GET /me */
  me: () => json<Usuario>("GET", "/me"),
  /** 2. POST /auth/paciente (público) */
  entrarPaciente: (datos: { dpi: Identificador; pin: string }) =>
    json<{ token: string; vence_en: string; paciente_id: string }>("POST", "/auth/paciente", { json: datos }),
  /** 3. PUT /me/pin → 204 */
  cambiarPin: (datos: { pin_actual: string; pin_nuevo: string }) => json<void>("PUT", "/me/pin", { json: datos }),

  // Enfermera
  /** 4. GET /pacientes/buscar?dpi= → lista (vacía si no existe; nunca 404) */
  buscarPacientes: (dpi: Identificador) => json<{ pacientes: Paciente[] }>("GET", `/pacientes/buscar?dpi=${seg(dpi)}`),
  /** 5. POST /pacientes → 201 */
  crearPaciente: (datos: DatosNuevoPaciente) => json<PacienteCreado>("POST", "/pacientes", { json: datos }),
  /** 6. POST /pacientes/{id}/fichas (multipart) → 202 en procesando, o 200/201 con la ficha */
  subirFicha: (pacienteId: string, datos: { client_id: string; imagenes: Blob[]; capturada_en: string }) => {
    const form = new FormData();
    form.append("client_id", datos.client_id);
    datos.imagenes.forEach((img, i) => form.append("imagenes", img, `pagina-${i}.jpg`));
    form.append("capturada_en", datos.capturada_en);
    return json<Ficha>("POST", `/pacientes/${seg(pacienteId)}/fichas`, { form });
  },
  /** 7. GET /fichas/{id} */
  obtenerFicha: (id: string) => json<Ficha>("GET", `/fichas/${seg(id)}`),
  /** 8. GET /fichas?estado=lista&importacion_id= */
  fichasPorRevisar: (importacionId?: string) =>
    json<{ fichas: Ficha[] }>("GET", `/fichas?estado=lista${importacionId ? `&importacion_id=${seg(importacionId)}` : ""}`),
  /** 9. POST /fichas/{id}/confirmar → 201 */
  confirmarFicha: (id: string, datos: ConfirmarFicha) =>
    json<{ consultas_creadas: number; version: number }>("POST", `/fichas/${seg(id)}/confirmar`, { json: datos }),
  /** 10. POST /consultas/{id}/versiones → 201 con la Consulta en su nueva versión */
  corregirConsulta: (id: string, datos: CorreccionConsulta) => json<Consulta>("POST", `/consultas/${seg(id)}/versiones`, { json: datos }),
  /** 11. POST /pacientes/{id}/versiones → 201 con el Paciente en su nueva versión */
  corregirPaciente: (pacienteId: string, datos: CorreccionPaciente) =>
    json<Paciente>("POST", `/pacientes/${seg(pacienteId)}/versiones`, { json: datos }),

  // Expediente
  /** 12. GET /pacientes/{id}/expediente */
  expediente: (pacienteId: string) => json<Expediente>("GET", `/pacientes/${seg(pacienteId)}/expediente`),
  /** 13. GET /consultas/{id}/versiones */
  versionesConsulta: (id: string) => json<{ versiones: Version[] }>("GET", `/consultas/${seg(id)}/versiones`),

  // Paciente
  /** 14. GET /pacientes/{id}/exportar?formato= → archivo (solo la paciente) */
  exportar: async (pacienteId: string, formato: FormatoExportar) => {
    const r = await pedir("GET", `/pacientes/${seg(pacienteId)}/exportar?formato=${formato}`);
    const disposicion = r.headers.get("Content-Disposition") ?? "";
    const nombre = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposicion)?.[1] ?? `historial.${formato}`;
    return { archivo: await r.blob(), nombre: decodeURIComponent(nombre) };
  },
  /** 15. POST /pacientes/{id}/codigos → 201 */
  generarCodigo: (pacienteId: string, datos: { enviar_sms: boolean }) =>
    json<CodigoTemporal>("POST", `/pacientes/${seg(pacienteId)}/codigos`, { json: datos }),
  /** 18. GET /pacientes/{id}/accesos */
  accesos: (pacienteId: string) => json<{ accesos: Acceso[] }>("GET", `/pacientes/${seg(pacienteId)}/accesos`),

  // Médico
  /** 16. POST /codigos/canjear */
  canjearCodigo: (codigo: string) => json<AccesoAbierto>("POST", "/codigos/canjear", { json: { codigo } }),
  /** 17. POST /pacientes/{id}/preguntar */
  preguntar: (pacienteId: string, pregunta: string) =>
    json<{ respuesta: string; fuentes: Fuente[] }>("POST", `/pacientes/${seg(pacienteId)}/preguntar`, { json: { pregunta } }),
  /** 19. POST /emergencia */
  emergencia: (datos: { dpi: Identificador; motivo: string }) => json<AccesoEmergencia>("POST", "/emergencia", { json: datos }),

  // Importar
  /** 20. POST /importaciones (multipart) → 201 */
  importar: (archivo: File) => {
    const form = new FormData();
    form.append("archivo", archivo, archivo.name);
    return json<ResultadoImportacion>("POST", "/importaciones", { form });
  },
};

/** Código como lo escribe la gente → "K7P4-Q2XM". */
export function normalizarCodigo(v: string): string {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

/** Saca el código de lo que trae un QR (URL o texto). Alfabeto sin 0, O, 1 ni I. */
export function codigoDesdeQR(texto: string): string | null {
  const m = /([A-HJ-NP-Z2-9]{4})-?([A-HJ-NP-Z2-9]{4})\s*$/i.exec(texto.trim());
  return m ? `${m[1]}-${m[2]}`.toUpperCase() : null;
}

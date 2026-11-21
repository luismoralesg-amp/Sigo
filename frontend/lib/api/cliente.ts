/**
 * Cliente del API de Sigo: las 20 rutas de docs/contrato-v2.md, "Contrato de API".
 * - Base: `${NEXT_PUBLIC_API_URL}/api/v1`.
 * - Siempre `Authorization: Bearer <token>`. El rol y el centro los saca el backend del token; aquí nunca se mandan.
 * - Errores: lanza ErrorApi con { status, codigo, mensaje } del contrato.
 * - Mientras el backend no esté listo, las peticiones van a un servidor simulado (lib/api/mock) que devuelve
 *   objetos Response con la misma forma. Se activa con NEXT_PUBLIC_SIGO_MOCKS=1 o si no hay NEXT_PUBLIC_API_URL.
 */
import type { Acceso, Consentimiento, Consulta, Expediente, Ficha, Fuente, Identificador, Importacion, Paciente, Usuario, Version } from "@/lib/types";
import { ErrorApi, leerError } from "./errores";
import { leerToken } from "./token";

const URL_API = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const USA_MOCKS = process.env.NEXT_PUBLIC_SIGO_MOCKS === "1" || !URL_API;
export const BASE = `${URL_API}/api/v1`;
/** Modo demo del contrato: el acceso por código dura 2 minutos en vez de 2 horas. NEXT_PUBLIC_SIGO_MODO_DEMO=0 lo apaga. */
export const MODO_DEMO = process.env.NEXT_PUBLIC_SIGO_MODO_DEMO !== "0";
export const DURACION_ACCESO_TEXTO = MODO_DEMO ? "2 minutos (modo demo)" : "2 horas";

/** `{dpi}` del contrato: DPI de 13 dígitos o TMP-AAAAMMDD-XXXX. */
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
  ruta: string; // sin /api/v1
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
  dpi: Identificador | null; // null = niño sin DPI; el backend genera el TMP-
  nombre: string;
  fecha_nacimiento: string | null;
  sexo: "F" | "M" | null;
  comunidad: string | null;
  telefono: string | null;
};
export type PacienteCreado = { paciente: Paciente; pin_inicial: string; advertencias: string[] };

export type ConsultaConfirmada = {
  fecha: string | null;
  motivo: string | null;
  diagnostico: string | null;
  tratamiento: string | null;
  vacunas: string[];
  pagina: number;
};
export type ConfirmarFicha = {
  paciente: { alergias: string[]; condiciones_cronicas: string[] };
  consultas: ConsultaConfirmada[];
  consentimiento: boolean;
};

export type CorreccionConsulta = Partial<Pick<Consulta, "fecha" | "motivo" | "diagnostico" | "tratamiento" | "vacunas">> & { motivo_cambio: string };
export type CorreccionPaciente = Partial<Pick<Paciente, "nombre" | "fecha_nacimiento" | "sexo" | "comunidad" | "alergias" | "condiciones_cronicas">> & { motivo_cambio: string };

export const FORMATOS_EXPORTAR = ["pdf", "docx", "xlsx", "txt", "md", "html", "json"] as const;
export type FormatoExportar = (typeof FORMATOS_EXPORTAR)[number];

export type AccesoActivado = { dpi: Identificador; acceso_vence_en: string };
export type AccesoEmergencia = AccesoActivado & { tipo_acceso: "emergencia" };

export type ResultadoImportacion = {
  fichas: Array<{ id: string; dpi: Identificador; nombre: string }>;
  filas_con_error: Array<{ fila: number; motivo: string }>;
};

// ---------------------------------------------------------------- las 20 rutas

export const api = {
  // Entrar
  /** 1. GET /me */
  me: () => json<Usuario>("GET", "/me"),
  /** 2. POST /auth/paciente (público) */
  entrarPaciente: (datos: { dpi: Identificador; pin: string }) =>
    json<{ token: string; vence_en: string; dpi: Identificador }>("POST", "/auth/paciente", { json: datos }),
  /** 3. PUT /me/pin → 204 */
  cambiarPin: (datos: { pin_actual: string; pin_nuevo: string }) => json<void>("PUT", "/me/pin", { json: datos }),

  // Enfermera
  /** 4. GET /pacientes/{dpi} */
  buscarPaciente: (dpi: Identificador) => json<Paciente>("GET", `/pacientes/${seg(dpi)}`),
  /** 5. POST /pacientes → 201 */
  crearPaciente: (datos: DatosNuevoPaciente) => json<PacienteCreado>("POST", "/pacientes", { json: datos }),
  /** 6. POST /fichas/foto (multipart) → 202 en procesando, o 200/201 con la ficha lista */
  subirFoto: (datos: { dpi: Identificador; client_id: string; imagenes: Blob[]; capturada_en: string }) => {
    const form = new FormData();
    form.append("dpi", datos.dpi);
    form.append("client_id", datos.client_id);
    datos.imagenes.forEach((img, i) => form.append("imagenes", img, `pagina-${i}.jpg`));
    form.append("capturada_en", datos.capturada_en);
    return json<Ficha>("POST", "/fichas/foto", { form });
  },
  /** 7. GET /fichas/{id} */
  obtenerFicha: (id: string) => json<Ficha>("GET", `/fichas/${seg(id)}`),
  /** 8. POST /fichas/{id}/confirmar → 201 */
  confirmarFicha: (id: string, datos: ConfirmarFicha) =>
    json<{ consultas_creadas: number; version: number }>("POST", `/fichas/${seg(id)}/confirmar`, { json: datos }),
  /** 9. POST /consultas/{id}/versiones → 201 con la Consulta en su nueva versión */
  corregirConsulta: (id: string, datos: CorreccionConsulta) => json<Consulta>("POST", `/consultas/${seg(id)}/versiones`, { json: datos }),
  /** 10. POST /pacientes/{dpi}/versiones → 201 con el Paciente en su nueva versión */
  corregirPaciente: (dpi: Identificador, datos: CorreccionPaciente) => json<Paciente>("POST", `/pacientes/${seg(dpi)}/versiones`, { json: datos }),

  // Expediente
  /** 11. GET /pacientes/{dpi}/expediente */
  expediente: (dpi: Identificador) => json<Expediente>("GET", `/pacientes/${seg(dpi)}/expediente`),
  /** 12. GET /consultas/{id}/versiones */
  versionesConsulta: (id: string) => json<{ versiones: Version[] }>("GET", `/consultas/${seg(id)}/versiones`),

  // Paciente
  /** 13. GET /pacientes/{dpi}/exportar?formato= → archivo */
  exportar: async (dpi: Identificador, formato: FormatoExportar) => {
    const r = await pedir("GET", `/pacientes/${seg(dpi)}/exportar?formato=${formato}`);
    const disposicion = r.headers.get("Content-Disposition") ?? "";
    const nombre = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposicion)?.[1] ?? `historial-${dpi}.${formato}`;
    return { archivo: await r.blob(), nombre: decodeURIComponent(nombre) };
  },
  /** 14. POST /pacientes/{dpi}/consentimientos → 201 */
  generarCodigo: (dpi: Identificador, datos: { enviar_sms: boolean }) =>
    json<Consentimiento>("POST", `/pacientes/${seg(dpi)}/consentimientos`, { json: datos }),
  /** 17. GET /pacientes/{dpi}/accesos */
  accesos: (dpi: Identificador) => json<{ accesos: Acceso[] }>("GET", `/pacientes/${seg(dpi)}/accesos`),

  // Médico
  /** 15. POST /consentimientos/activar */
  activarCodigo: (codigo: string) => json<AccesoActivado>("POST", "/consentimientos/activar", { json: { codigo } }),
  /** 16. POST /pacientes/{dpi}/preguntar */
  preguntar: (dpi: Identificador, pregunta: string) =>
    json<{ respuesta: string; fuentes: Fuente[] }>("POST", `/pacientes/${seg(dpi)}/preguntar`, { json: { pregunta } }),
  /** 18. POST /emergencia */
  emergencia: (datos: { dpi: Identificador; motivo: string }) => json<AccesoEmergencia>("POST", "/emergencia", { json: datos }),

  // Importar
  /** 19. POST /importar (multipart) → 201 */
  importar: (archivo: File) => {
    const form = new FormData();
    form.append("archivo", archivo, archivo.name);
    return json<Importacion>("POST", "/importar", { form });
  },
  /** 20. POST /importar/{id}/confirmar */
  confirmarImportacion: (id: string, mapeo: Record<string, string | null>) =>
    json<ResultadoImportacion>("POST", `/importar/${seg(id)}/confirmar`, { json: { mapeo } }),
};

/** Código de consentimiento como lo escribe la gente → "K7P4-Q2XM". */
export function normalizarCodigo(v: string): string {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

/** Saca el código de lo que trae un QR (URL o texto). */
export function codigoDesdeQR(texto: string): string | null {
  const m = /([A-HJ-NP-Z2-9]{4})-?([A-HJ-NP-Z2-9]{4})\s*$/i.exec(texto.trim());
  return m ? `${m[1]}-${m[2]}`.toUpperCase() : null;
}

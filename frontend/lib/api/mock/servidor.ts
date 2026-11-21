/**
 * Servidor simulado del contrato v2. Responde a las mismas 20 rutas con objetos Response, así el cliente
 * no distingue entre esto y el backend real. Aplica las reglas del contrato que el frontend tiene que
 * poder dibujar: roles, 403 acceso_vencido, códigos de un solo uso, 429 tras 5 intentos, emergencia
 * solo con alertas, bitácora y versiones.
 *
 * El estado se guarda en localStorage (sigo:mock:v2) para que sobreviva a recargas en el demo.
 * Las horas se calculan desde ahora, no se copian del documento, para que las cuentas regresivas funcionen.
 */
import type { Acceso, Consentimiento, Consulta, Expediente, Extraccion, Ficha, Fuente, Importacion, Paciente, Usuario, Version } from "@/lib/types";
import { ERRORES, type CodigoError } from "../errores";
import type { Peticion } from "../cliente";
import { MODO_DEMO, PATRON_IDENTIFICADOR } from "../cliente";
import {
  BITACORA_SEMILLA,
  CONSULTAS_SEMILLA,
  CUENTAS_DEMO,
  EXTRACCION_EJEMPLO,
  FOTO_RESPALDO,
  PACIENTES_SEMILLA,
  USUARIO_ENFERMERA,
  USUARIO_MEDICO,
  type RegistroConsulta,
  type RegistroPaciente,
} from "./datos";
import { exportarDOCX, exportarHTML, exportarJSON, exportarMarkdown, exportarPDF, exportarTexto, exportarXLSX } from "./archivos";
import { fechaCorta, isoGuatemala } from "@/lib/utils";

// ---------------------------------------------------------------- tiempos del contrato

const MIN = 60_000;
const DURACION_ACCESO_CODIGO = MODO_DEMO ? 2 * MIN : 120 * MIN;
const DURACION_ACTIVACION_CODIGO = 10 * MIN;
const DURACION_EMERGENCIA = 60 * MIN;
const BLOQUEO = 15 * MIN;
const MAX_INTENTOS = 5;
const SEGUNDOS_PROCESANDO = 4;

const isoGT = isoGuatemala;
const ms = (iso: string) => new Date(iso).getTime();

// ---------------------------------------------------------------- estado

type Intentos = { n: number; bloqueado_hasta: number | null };

type FichaGuardada = Ficha & { lista_en: number };

type Estado = {
  pacientes: Record<string, RegistroPaciente & { intentos: Intentos }>;
  consultas: RegistroConsulta[];
  fichas: Record<string, FichaGuardada>;
  consentimientos: Record<string, { dpi: string; vence_en: string; usado_por: string | null }>;
  /** Accesos del médico demo, por paciente. `desde` identifica su fila en la bitácora del paciente. */
  accesos_medico: Record<string, { tipo: "codigo" | "emergencia"; vence: number; desde: string }>;
  bitacora: Record<string, Acceso[]>;
  intentos_codigo: Intentos;
  secuencia: number;
};

const CLAVE = "sigo:mock:v2";
let estado: Estado | null = null;
/** Lo que no cabe en localStorage: fotos y archivos subidos (URLs blob:) y las filas de una importación. */
const memoria = { importaciones: new Map<string, { archivo: string; url: string; filas: Record<string, string>[] }>() };

function semilla(): Estado {
  return {
    pacientes: Object.fromEntries(PACIENTES_SEMILLA.map((p) => [p.paciente.dpi, { ...structuredClone(p), intentos: { n: 0, bloqueado_hasta: null } }])),
    consultas: structuredClone(CONSULTAS_SEMILLA),
    fichas: {
      f_88: {
        id: "f_88",
        dpi: "2547896310801",
        origen: "foto",
        client_id: "7c1e2b9a-4f6d-4e1a-9c3b-1d2e3f4a5b6c",
        estado: "confirmada",
        originales: ["/demo/ficha-rosa-2025.jpg"],
        extraccion: structuredClone(EXTRACCION_EJEMPLO),
        error: null,
        creada_en: "2026-11-21T10:42:00-06:00",
        lista_en: 0,
      },
    },
    consentimientos: {},
    accesos_medico: {},
    bitacora: structuredClone(BITACORA_SEMILLA),
    intentos_codigo: { n: 0, bloqueado_hasta: null },
    secuencia: 100,
  };
}

function cargar(): Estado {
  if (estado) return estado;
  try {
    const crudo = localStorage.getItem(CLAVE);
    estado = crudo ? (JSON.parse(crudo) as Estado) : semilla();
  } catch {
    estado = semilla();
  }
  return estado;
}

function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado));
  } catch {
    /* sin almacenamiento: el estado vive en memoria */
  }
}

/** Vuelve a los datos semilla (lo usa el botón de reinicio del demo). */
export function reiniciarMock() {
  estado = semilla();
  guardar();
}

const nuevoId = (prefijo: string) => {
  const e = cargar();
  e.secuencia += 1;
  return `${prefijo}_${e.secuencia}`;
};

// ---------------------------------------------------------------- respuestas

function resp(status: number, cuerpo?: unknown, headers: Record<string, string> = {}): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(cuerpo ?? null), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function error(codigo: CodigoError, mensaje?: string): Response {
  return resp(ERRORES[codigo].status, { error: { codigo, mensaje: mensaje ?? ERRORES[codigo].mensaje } });
}

class Corte extends Error {
  constructor(public respuesta: Response) {
    super("corte");
  }
}
const cortar = (codigo: CodigoError, mensaje?: string): never => {
  throw new Corte(error(codigo, mensaje));
};

// ---------------------------------------------------------------- sesión

type Quien = { usuario: Usuario };

function quien(token: string | null): Quien {
  if (!token) cortar("sin_sesion");
  const cuenta = CUENTAS_DEMO.find((c) => c.token === token);
  if (cuenta) return { usuario: cuenta.usuario };
  const m = /^mock-paciente\.(.+)$/.exec(token!);
  if (m) {
    const r = cargar().pacientes[m[1]];
    if (r) return { usuario: { id: `u_p_${r.paciente.dpi}`, nombre: r.paciente.nombre, rol: "paciente", centro: null, dpi: r.paciente.dpi, debe_cambiar_pin: r.debe_cambiar_pin } };
  }
  return cortar("sin_sesion");
}

function exigirRol(q: Quien, ...roles: Usuario["rol"][]) {
  if (!roles.includes(q.usuario.rol)) cortar("rol_no_permitido", "Tu rol no puede hacer esto.");
}

function registro(dpi: string) {
  if (!PATRON_IDENTIFICADOR.test(dpi)) cortar("identificador_invalido");
  const r = cargar().pacientes[dpi];
  if (!r) cortar("no_existe", "Ese paciente no está registrado.");
  return r!;
}

/** Regla 5: la enfermera solo ve pacientes con alguna consulta en su centro o que ella creó. */
function enfermeraPuedeVer(q: Quien, dpi: string): boolean {
  const r = cargar().pacientes[dpi];
  if (!r) return false;
  if (r.creado_por === q.usuario.id) return true;
  return cargar().consultas.some((c) => c.dpi === dpi && c.versiones.at(-1)!.datos.centro.id === q.usuario.centro?.id);
}

/** Acceso del médico vigente para ese paciente, o corta con acceso_vencido. */
function accesoMedico(dpi: string) {
  const a = cargar().accesos_medico[dpi];
  if (!a || a.vence <= Date.now()) cortar("acceso_vencido", "El acceso a este expediente ya venció. Pide un código nuevo a la paciente.");
  return a!;
}

/** Quién puede leer el expediente de `dpi`, según el contrato. Devuelve el acceso del médico si aplica. */
function puedeLeer(q: Quien, dpi: string) {
  registro(dpi);
  switch (q.usuario.rol) {
    case "paciente":
      if (q.usuario.dpi !== dpi) cortar("rol_no_permitido", "Solo puedes ver tu propio historial.");
      return null;
    case "enfermera":
      if (!enfermeraPuedeVer(q, dpi)) cortar("rol_no_permitido", "Este paciente no tiene consultas en tu centro.");
      return null;
    case "medico":
      return accesoMedico(dpi);
  }
}

function intentar(i: Intentos): void {
  if (i.bloqueado_hasta && i.bloqueado_hasta > Date.now()) cortar("demasiados_intentos", "Demasiados intentos. Espera 15 minutos.");
  if (i.bloqueado_hasta && i.bloqueado_hasta <= Date.now()) {
    i.n = 0;
    i.bloqueado_hasta = null;
  }
}
function fallo(i: Intentos) {
  i.n += 1;
  if (i.n >= MAX_INTENTOS) i.bloqueado_hasta = Date.now() + BLOQUEO;
  guardar();
}

// ---------------------------------------------------------------- expediente

function consultaVigente(r: RegistroConsulta): Consulta {
  const v = r.versiones.at(-1)!;
  return { id: r.id, version: v.version, ...v.datos, editada_por: v.editada_por, editada_en: v.editada_en };
}

function consultasDe(dpi: string): Consulta[] {
  return cargar()
    .consultas.filter((c) => c.dpi === dpi)
    .map(consultaVigente)
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
}

/** Medicamentos actuales: tratamientos de consultas de los últimos 90 días. */
function medicamentos(consultas: Consulta[]): string[] {
  const limite = Date.now() - 90 * 24 * 60 * MIN;
  return consultas.filter((c) => c.fecha && c.tratamiento && new Date(c.fecha + "T12:00:00-06:00").getTime() >= limite).map((c) => c.tratamiento!);
}

function expediente(dpi: string, tipo: Expediente["tipo_acceso"], vence: number | null): Expediente {
  const p = cargar().pacientes[dpi].paciente;
  const consultas = consultasDe(dpi);
  return {
    paciente: structuredClone(p),
    alertas: { alergias: [...p.alergias], condiciones_cronicas: [...p.condiciones_cronicas], medicamentos: medicamentos(consultas) },
    consultas: tipo === "emergencia" ? [] : consultas,
    tipo_acceso: tipo,
    acceso_vence_en: vence ? isoGT(vence) : null,
  };
}

/** Regla 8: la bitácora la escribe el backend. Lecturas seguidas de la misma enfermera se agrupan (10 min). */
function anotarLecturaEnfermera(q: Quien, dpi: string) {
  const b = (cargar().bitacora[dpi] ??= []);
  const ultima = b[0];
  const ahora = Date.now();
  if (ultima && ultima.tipo === "enfermera" && ultima.quien === q.usuario.nombre && ahora - ms(ultima.hasta) < 10 * MIN) {
    ultima.hasta = isoGT(ahora);
  } else {
    b.unshift({ quien: q.usuario.nombre, centro: q.usuario.centro?.nombre ?? "", tipo: "enfermera", motivo: null, desde: isoGT(ahora), hasta: isoGT(ahora), preguntas_hechas: 0 });
  }
}

function abrirAccesoMedico(q: Quien, dpi: string, tipo: "codigo" | "emergencia", motivo: string | null) {
  const e = cargar();
  const ahora = Date.now();
  const vence = ahora + (tipo === "emergencia" ? DURACION_EMERGENCIA : DURACION_ACCESO_CODIGO);
  const desde = isoGT(ahora);
  (e.bitacora[dpi] ??= []).unshift({ quien: q.usuario.nombre, centro: q.usuario.centro?.nombre ?? "", tipo, motivo, desde, hasta: isoGT(vence), preguntas_hechas: 0 });
  e.accesos_medico[dpi] = { tipo, vence, desde };
  guardar();
  return vence;
}

// ---------------------------------------------------------------- utilidades

const ALFABETO_CODIGO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin 0, O, 1 ni I
function codigoAleatorio(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const s = Array.from(bytes, (b) => ALFABETO_CODIGO[b % ALFABETO_CODIGO.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function tmpNuevo(): string {
  const hoy = isoGT().slice(0, 10).replace(/-/g, "");
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const alfa = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `TMP-${hoy}-${Array.from(bytes, (b) => alfa[b % alfa.length]).join("")}`;
}

function pinNuevo(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

/** Igual que backend/app/dpi.py: pesos 2..9 sobre el correlativo, mod 11, y departamento/municipio de la SAT. */
const MUNICIPIOS: Record<string, number> = { "01": 17, "02": 8, "03": 16, "04": 16, "05": 13, "06": 14, "07": 19, "08": 8, "09": 24, "10": 21, "11": 9, "12": 30, "13": 32, "14": 21, "15": 8, "16": 17, "17": 14, "18": 5, "19": 11, "20": 11, "21": 7, "22": 17 };
export function dpiDudoso(dpi: string): boolean {
  if (!/^\d{13}$/.test(dpi)) return false;
  const suma = [...dpi.slice(0, 8)].reduce((s, d, i) => s + Number(d) * (i + 2), 0);
  const verificador = suma % 11;
  const depto = dpi.slice(9, 11);
  const muni = Number(dpi.slice(11, 13));
  return verificador === 10 || verificador !== Number(dpi[8]) || !MUNICIPIOS[depto] || muni < 1 || muni > MUNICIPIOS[depto];
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
const fechaValida = (v: unknown) => v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));

// ---------------------------------------------------------------- rutas

type Manejador = (p: Peticion, m: RegExpExecArray) => Response | Promise<Response>;
const RUTAS: Array<[Peticion["metodo"], RegExp, Manejador]> = [];
const ruta = (metodo: Peticion["metodo"], patron: string, fn: Manejador) =>
  RUTAS.push([metodo, new RegExp("^" + patron.replace(/\{(\w+)\}/g, "([^/?]+)") + "(?:\\?.*)?$"), fn]);

// 1. GET /me
ruta("GET", "/me", (p) => resp(200, quien(p.token).usuario));

// 2. POST /auth/paciente
ruta("POST", "/auth/paciente", (p) => {
  const { dpi, pin } = (p.json ?? {}) as { dpi?: string; pin?: string };
  if (!dpi || !PATRON_IDENTIFICADOR.test(dpi)) return error("identificador_invalido");
  const r = cargar().pacientes[dpi];
  // Sin registro también cuenta como intento, para no revelar qué DPI existen.
  const intentos = r?.intentos ?? { n: 0, bloqueado_hasta: null };
  intentar(intentos);
  if (!r || r.pin !== pin) {
    fallo(intentos);
    return error("pin_incorrecto", "DPI o PIN incorrectos.");
  }
  intentos.n = 0;
  guardar();
  return resp(200, { token: `mock-paciente.${dpi}`, vence_en: isoGT(Date.now() + 120 * MIN), dpi });
});

// 3. PUT /me/pin
ruta("PUT", "/me/pin", (p) => {
  const q = quien(p.token);
  exigirRol(q, "paciente");
  const { pin_actual, pin_nuevo } = (p.json ?? {}) as { pin_actual?: string; pin_nuevo?: string };
  const r = cargar().pacientes[q.usuario.dpi!];
  intentar(r.intentos);
  if (r.pin !== pin_actual) {
    fallo(r.intentos);
    return error("pin_incorrecto", "El PIN actual no es correcto.");
  }
  if (!/^\d{6}$/.test(pin_nuevo ?? "")) return error("validacion", "El PIN nuevo debe tener 6 dígitos.");
  if (pin_nuevo === pin_actual) return error("validacion", "El PIN nuevo tiene que ser distinto al actual.");
  r.pin = pin_nuevo!;
  r.debe_cambiar_pin = false;
  r.intentos = { n: 0, bloqueado_hasta: null };
  guardar();
  return resp(204);
});

// 4. GET /pacientes/{dpi}
ruta("GET", "/pacientes/{dpi}", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const dpi = decodeURIComponent(m[1]);
  const r = registro(dpi);
  if (!enfermeraPuedeVer(q, dpi)) return error("rol_no_permitido", "Este paciente no tiene consultas en tu centro.");
  return resp(200, r.paciente);
});

// 5. POST /pacientes
ruta("POST", "/pacientes", (p) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const b = (p.json ?? {}) as Record<string, unknown>;
  const nombre = texto(b.nombre);
  if (!nombre) return error("validacion", "Escribe el nombre completo.");
  if (!fechaValida(b.fecha_nacimiento ?? null)) return error("validacion", "La fecha de nacimiento debe ser AAAA-MM-DD.");
  let dpi = b.dpi === null || b.dpi === undefined ? null : String(b.dpi);
  if (dpi !== null && !/^\d{13}$/.test(dpi)) return error("identificador_invalido", "El DPI debe tener 13 dígitos.");
  const e = cargar();
  if (dpi && e.pacientes[dpi]) return error("dpi_ya_existe", "Ese DPI ya está registrado. Abrimos su expediente.");
  dpi ??= tmpNuevo();
  const paciente: Paciente = {
    dpi,
    nombre,
    fecha_nacimiento: (b.fecha_nacimiento as string | null) ?? null,
    sexo: b.sexo === "F" || b.sexo === "M" ? b.sexo : null,
    comunidad: texto(b.comunidad),
    alergias: [],
    condiciones_cronicas: [],
    version: 1,
  };
  const pin = pinNuevo();
  e.pacientes[dpi] = { paciente, telefono: texto(b.telefono), pin, debe_cambiar_pin: true, creado_por: q.usuario.id, intentos: { n: 0, bloqueado_hasta: null } };
  e.bitacora[dpi] = [];
  guardar();
  return resp(201, { paciente, pin_inicial: pin, advertencias: dpiDudoso(dpi) ? ["dpi_dudoso"] : [] });
});

// 6. POST /fichas/foto
ruta("POST", "/fichas/foto", (p) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const f = p.form;
  const dpi = String(f?.get("dpi") ?? "");
  const clientId = String(f?.get("client_id") ?? "");
  const imagenes = (f?.getAll("imagenes") ?? []).filter((x): x is File => x instanceof Blob);
  registro(dpi);
  if (!enfermeraPuedeVer(q, dpi)) return error("rol_no_permitido");
  if (!clientId) return error("validacion", "Falta el client_id de la foto.");
  if (!imagenes.length) return error("validacion", "Agrega al menos una foto.");
  if (imagenes.some((i) => i.size > 5 * 1024 * 1024)) return error("archivo_muy_grande", "Una foto pasa de 5 MB. Vuelve a comprimirla.");
  const e = cargar();
  // Regla 10: un client_id repetido devuelve la ficha que ya existe.
  const existente = Object.values(e.fichas).find((x) => x.client_id === clientId);
  if (existente) return resp(200, vistaFicha(existente));
  const ahora = Date.now();
  const ficha: FichaGuardada = {
    id: nuevoId("f"),
    dpi,
    origen: "foto",
    client_id: clientId,
    estado: "procesando",
    originales: imagenes.map((i) => {
      const u = URL.createObjectURL(i);
      vivas.add(u);
      return u;
    }),
    extraccion: null,
    error: null,
    creada_en: isoGT(ahora),
    lista_en: ahora + SEGUNDOS_PROCESANDO * 1000,
  };
  e.fichas[ficha.id] = ficha;
  guardar();
  return resp(202, vistaFicha(ficha));
});

function vistaFicha(f: FichaGuardada): Ficha {
  if (f.estado === "procesando" && Date.now() >= f.lista_en) {
    f.estado = "lista";
    f.extraccion = structuredClone(EXTRACCION_EJEMPLO);
    // Una consulta por página fotografiada, como haría la IA.
    f.extraccion.consultas = f.extraccion.consultas.map((c, i) => ({ ...c, pagina: Math.min(i, f.originales.length - 1) }));
    guardar();
  }
  const ficha: Ficha = { id: f.id, dpi: f.dpi, origen: f.origen, client_id: f.client_id, estado: f.estado, originales: f.originales, extraccion: f.extraccion, error: f.error, creada_en: f.creada_en };
  // Las URLs blob: no sobreviven a una recarga; en el demo se cambian por la foto de ejemplo.
  return { ...ficha, originales: ficha.originales.map((u) => (u.startsWith("blob:") && !vivas.has(u) ? FOTO_RESPALDO : u)) };
}
/** URLs blob: creadas en esta carga de la página. */
const vivas = new Set<string>();

// 7. GET /fichas/{id}
ruta("GET", "/fichas/{id}", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const f = cargar().fichas[decodeURIComponent(m[1])];
  if (!f) return error("no_existe", "Esa ficha no existe.");
  if (!enfermeraPuedeVer(q, f.dpi)) return error("rol_no_permitido");
  return resp(200, vistaFicha(f));
});

// 8. POST /fichas/{id}/confirmar
ruta("POST", "/fichas/{id}/confirmar", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const e = cargar();
  const f = e.fichas[decodeURIComponent(m[1])];
  if (!f) return error("no_existe", "Esa ficha no existe.");
  const vista = vistaFicha(f);
  if (f.estado === "confirmada") return error("ficha_ya_confirmada", "Esta ficha ya se confirmó.");
  if (f.estado !== "lista") return error("validacion", "La ficha todavía se está leyendo.");
  const b = (p.json ?? {}) as { paciente?: { alergias?: unknown; condiciones_cronicas?: unknown }; consultas?: unknown[]; consentimiento?: unknown };
  if (b.consentimiento !== true) return error("sin_consentimiento", "Marca que la paciente dio su consentimiento.");
  const consultas = Array.isArray(b.consultas) ? (b.consultas as Record<string, unknown>[]) : [];
  for (const c of consultas) if (!fechaValida(c.fecha ?? null)) return error("validacion", "Hay una fecha que no es AAAA-MM-DD.");

  const ahora = isoGT();
  for (const c of consultas) {
    const pagina = Number(c.pagina ?? 0);
    e.consultas.push({
      id: nuevoId("con"),
      dpi: f.dpi,
      versiones: [
        {
          version: 1,
          datos: {
            fecha: (c.fecha as string | null) ?? null,
            centro: q.usuario.centro!,
            motivo: texto(c.motivo),
            diagnostico: texto(c.diagnostico),
            tratamiento: texto(c.tratamiento),
            vacunas: lista(c.vacunas),
            original_url: vista.originales[pagina] ?? vista.originales[0] ?? FOTO_RESPALDO,
          },
          motivo_cambio: null,
          editada_por: q.usuario.nombre,
          editada_en: ahora,
        },
      ],
    });
  }
  // Alergias y condiciones del paciente: se unen, y si cambian sube la versión (nada se borra).
  const pac = e.pacientes[f.dpi].paciente;
  const alergias = [...new Set([...pac.alergias, ...lista(b.paciente?.alergias)])];
  const condiciones = [...new Set([...pac.condiciones_cronicas, ...lista(b.paciente?.condiciones_cronicas)])];
  if (alergias.length !== pac.alergias.length || condiciones.length !== pac.condiciones_cronicas.length) {
    pac.alergias = alergias;
    pac.condiciones_cronicas = condiciones;
    pac.version += 1;
  }
  f.estado = "confirmada";
  guardar();
  return resp(201, { consultas_creadas: consultas.length, version: 1 });
});

// 9. POST /consultas/{id}/versiones
ruta("POST", "/consultas/{id}/versiones", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const r = cargar().consultas.find((c) => c.id === decodeURIComponent(m[1]));
  if (!r) return error("no_existe", "Esa consulta no existe.");
  if (!enfermeraPuedeVer(q, r.dpi)) return error("rol_no_permitido");
  const b = (p.json ?? {}) as Record<string, unknown>;
  const motivo = texto(b.motivo_cambio);
  if (!motivo) return error("motivo_requerido", "Escribe por qué corriges este dato.");
  if ("fecha" in b && !fechaValida(b.fecha)) return error("validacion", "La fecha debe ser AAAA-MM-DD.");
  const anterior = r.versiones.at(-1)!;
  const datos = { ...anterior.datos };
  if ("fecha" in b) datos.fecha = (b.fecha as string | null) ?? null;
  if ("motivo" in b) datos.motivo = texto(b.motivo);
  if ("diagnostico" in b) datos.diagnostico = texto(b.diagnostico);
  if ("tratamiento" in b) datos.tratamiento = texto(b.tratamiento);
  if ("vacunas" in b) datos.vacunas = lista(b.vacunas);
  r.versiones.push({ version: anterior.version + 1, datos, motivo_cambio: motivo, editada_por: q.usuario.nombre, editada_en: isoGT() });
  guardar();
  return resp(201, consultaVigente(r));
});

// 10. POST /pacientes/{dpi}/versiones
ruta("POST", "/pacientes/{dpi}/versiones", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const dpi = decodeURIComponent(m[1]);
  const r = registro(dpi);
  if (!enfermeraPuedeVer(q, dpi)) return error("rol_no_permitido");
  const b = (p.json ?? {}) as Record<string, unknown>;
  if ("dpi" in b) return error("validacion", "El DPI no se corrige desde la app.");
  if (!texto(b.motivo_cambio)) return error("motivo_requerido", "Escribe por qué corriges este dato.");
  const pac = r.paciente;
  if ("nombre" in b) {
    const n = texto(b.nombre);
    if (!n) return error("validacion", "El nombre no puede quedar vacío.");
    pac.nombre = n;
  }
  if ("fecha_nacimiento" in b) {
    if (!fechaValida(b.fecha_nacimiento)) return error("validacion", "La fecha debe ser AAAA-MM-DD.");
    pac.fecha_nacimiento = (b.fecha_nacimiento as string | null) ?? null;
  }
  if ("sexo" in b) pac.sexo = b.sexo === "F" || b.sexo === "M" ? b.sexo : null;
  if ("comunidad" in b) pac.comunidad = texto(b.comunidad);
  if ("alergias" in b) pac.alergias = lista(b.alergias);
  if ("condiciones_cronicas" in b) pac.condiciones_cronicas = lista(b.condiciones_cronicas);
  pac.version += 1;
  guardar();
  return resp(201, pac);
});

// 11. GET /pacientes/{dpi}/expediente
ruta("GET", "/pacientes/{dpi}/expediente", (p, m) => {
  const q = quien(p.token);
  const dpi = decodeURIComponent(m[1]);
  const acceso = puedeLeer(q, dpi);
  if (q.usuario.rol === "enfermera") {
    anotarLecturaEnfermera(q, dpi);
    guardar();
  }
  return resp(200, expediente(dpi, acceso?.tipo ?? null, acceso?.vence ?? null));
});

// 12. GET /consultas/{id}/versiones
ruta("GET", "/consultas/{id}/versiones", (p, m) => {
  const q = quien(p.token);
  const r = cargar().consultas.find((c) => c.id === decodeURIComponent(m[1]));
  if (!r) return error("no_existe", "Esa consulta no existe.");
  const acceso = puedeLeer(q, r.dpi);
  if (acceso?.tipo === "emergencia") return error("solo_emergencia");
  return resp(200, { versiones: [...r.versiones].reverse() });
});

// 13. GET /pacientes/{dpi}/exportar?formato=
ruta("GET", "/pacientes/{dpi}/exportar", async (p, m) => {
  const q = quien(p.token);
  const dpi = decodeURIComponent(m[1]);
  if (q.usuario.rol === "medico") {
    const a = accesoMedico(dpi);
    return a.tipo === "emergencia" ? error("solo_emergencia") : error("rol_no_permitido", "Las descargas son de la paciente.");
  }
  puedeLeer(q, dpi);
  const formato = new URLSearchParams(p.ruta.split("?")[1] ?? "").get("formato") ?? "pdf";
  const exp = expediente(dpi, null, null);
  const archivos: Record<string, () => Blob | Promise<Blob>> = {
    pdf: () => exportarPDF(exp),
    docx: () => exportarDOCX(exp),
    xlsx: () => exportarXLSX(exp),
    txt: () => new Blob([exportarTexto(exp)], { type: "text/plain;charset=utf-8" }),
    md: () => new Blob([exportarMarkdown(exp)], { type: "text/markdown;charset=utf-8" }),
    html: () => new Blob([exportarHTML(exp)], { type: "text/html;charset=utf-8" }),
    json: () => new Blob([exportarJSON(exp)], { type: "application/json" }),
  };
  if (!archivos[formato]) return error("validacion", "Formato no disponible.");
  const blob = await archivos[formato]();
  const nombre = `historial-${dpi}.${formato}`;
  return new Response(blob, { status: 200, headers: { "Content-Type": blob.type, "Content-Disposition": `attachment; filename="${nombre}"` } });
});

// 14. POST /pacientes/{dpi}/consentimientos
ruta("POST", "/pacientes/{dpi}/consentimientos", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "paciente", "enfermera");
  const dpi = decodeURIComponent(m[1]);
  puedeLeer(q, dpi);
  // Si lo pide la enfermera a pedido de la paciente, queda en la bitácora.
  if (q.usuario.rol === "enfermera") anotarLecturaEnfermera(q, dpi);
  const e = cargar();
  let codigo = codigoAleatorio();
  while (e.consentimientos[codigo]) codigo = codigoAleatorio();
  const vence = isoGT(Date.now() + DURACION_ACTIVACION_CODIGO);
  e.consentimientos[codigo] = { dpi, vence_en: vence, usado_por: null };
  const enviar = (p.json as { enviar_sms?: boolean } | undefined)?.enviar_sms === true;
  guardar();
  const c: Consentimiento = { codigo, qr: `https://sigo.app/c/${codigo}`, vence_en: vence, enviado_por_sms: enviar && Boolean(e.pacientes[dpi].telefono) };
  return resp(201, c);
});

// 15. POST /consentimientos/activar
ruta("POST", "/consentimientos/activar", (p) => {
  const q = quien(p.token);
  exigirRol(q, "medico");
  const e = cargar();
  intentar(e.intentos_codigo);
  const codigo = String((p.json as { codigo?: string } | undefined)?.codigo ?? "").toUpperCase();
  const c = e.consentimientos[codigo];
  if (!c) {
    fallo(e.intentos_codigo);
    return error("no_existe", "No encontramos ese código. Revísalo con la paciente.");
  }
  if (c.usado_por) return error("codigo_ya_usado", c.usado_por === q.usuario.id ? "Ya activaste este código." : "Este código ya se usó.");
  if (ms(c.vence_en) < Date.now()) return error("codigo_vencido", "Este código ya venció. Pide uno nuevo a la paciente.");
  c.usado_por = q.usuario.id;
  e.intentos_codigo = { n: 0, bloqueado_hasta: null };
  const vence = abrirAccesoMedico(q, c.dpi, "codigo", null);
  return resp(200, { dpi: c.dpi, acceso_vence_en: isoGT(vence) });
});

// 16. POST /pacientes/{dpi}/preguntar
ruta("POST", "/pacientes/{dpi}/preguntar", async (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "medico");
  const dpi = decodeURIComponent(m[1]);
  registro(dpi);
  const a = accesoMedico(dpi);
  if (a.tipo === "emergencia") return error("solo_emergencia");
  const pregunta = texto((p.json as { pregunta?: string } | undefined)?.pregunta);
  if (!pregunta) return error("validacion", "Escribe una pregunta.");
  await new Promise((r) => setTimeout(r, 900));
  const fila = cargar().bitacora[dpi]?.find((x) => x.tipo === a.tipo && x.desde === a.desde);
  if (fila) fila.preguntas_hechas += 1;
  guardar();
  return resp(200, responder_pregunta(dpi, pregunta));
});

function responder_pregunta(dpi: string, pregunta: string): { respuesta: string; fuentes: Fuente[] } {
  const consultas = consultasDe(dpi);
  const pac = cargar().pacientes[dpi].paciente;
  const pq = pregunta.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const fuente = (c: Consulta, campo: string): Fuente => ({ consulta_id: c.id, version: c.version, original_url: c.original_url, campo });
  const donde = (c: Consulta) => `${fechaCorta(c.fecha)}, ${c.centro.nombre}`;

  if (pq.includes("vacun")) {
    const c = consultas.find((x) => x.vacunas.length);
    if (c) return { respuesta: `La última vacuna registrada es ${c.vacunas.join(", ")} (${donde(c)}).`, fuentes: [fuente(c, "vacunas")] };
  }
  if (pq.includes("alerg")) {
    const origen = cargar().consultas.find((c) => c.id === "con-002" && c.dpi === dpi);
    if (pac.alergias.length && origen)
      return { respuesta: `Alergia registrada: ${pac.alergias.join(", ")}.`, fuentes: [fuente(consultaVigente(origen), "alergias")] };
  }
  if (pq.includes("tratamiento") || pq.includes("medicamento") || pq.includes("toma")) {
    const c = consultas.find((x) => x.tratamiento);
    if (c) return { respuesta: `El tratamiento más reciente es: ${c.tratamiento} (${donde(c)}).`, fuentes: [fuente(c, "tratamiento")] };
  }
  if (pq.includes("diagnost") || pq.includes("ultima consulta") || pq.includes("ultima vez")) {
    const c = consultas[0];
    if (c) return { respuesta: `La consulta más reciente fue el ${fechaCorta(c.fecha)}: ${c.motivo ?? "sin motivo escrito"}. Diagnóstico: ${c.diagnostico ?? "no registrado"}.`, fuentes: [fuente(c, "diagnostico")] };
  }
  // Búsqueda por palabras en los campos de cada consulta.
  const palabras = pq.split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 5);
  for (const c of consultas) {
    for (const campo of ["motivo", "diagnostico", "tratamiento"] as const) {
      const v = (c[campo] ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (palabras.some((w) => v.includes(w))) return { respuesta: `Encontré esto el ${fechaCorta(c.fecha)}: ${c[campo]}.`, fuentes: [fuente(c, campo)] };
    }
  }
  return { respuesta: "No lo encontré en el expediente.", fuentes: [] };
}

// 17. GET /pacientes/{dpi}/accesos
ruta("GET", "/pacientes/{dpi}/accesos", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "paciente");
  const dpi = decodeURIComponent(m[1]);
  puedeLeer(q, dpi);
  return resp(200, { accesos: cargar().bitacora[dpi] ?? [] });
});

// 18. POST /emergencia
ruta("POST", "/emergencia", (p) => {
  const q = quien(p.token);
  exigirRol(q, "medico");
  const b = (p.json ?? {}) as { dpi?: string; motivo?: string };
  const motivo = texto(b.motivo);
  if (!motivo || motivo.length < 10) return error("motivo_requerido", "Escribe el motivo de la emergencia, con al menos 10 caracteres.");
  const dpi = String(b.dpi ?? "");
  registro(dpi);
  const vence = abrirAccesoMedico(q, dpi, "emergencia", motivo);
  return resp(200, { dpi, acceso_vence_en: isoGT(vence), tipo_acceso: "emergencia" });
});

// 19. POST /importar
const A_CONTRATO: Record<string, string | null> = {
  dpi_cui: "dpi",
  nombre: "nombre",
  fecha_nacimiento: "fecha_nacimiento",
  sexo: "sexo",
  comunidad: "comunidad",
  alergias: "alergias",
  condiciones_cronicas: "condiciones_cronicas",
  fecha: "consultas.fecha",
  motivo: "consultas.motivo",
  diagnostico: "consultas.diagnostico",
  tratamiento: "consultas.tratamiento",
  medicamentos: "consultas.tratamiento",
  vacunas: "consultas.vacunas",
};

ruta("POST", "/importar", async (p) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const archivo = p.form?.get("archivo");
  if (!(archivo instanceof File)) return error("validacion", "Elige un archivo.");
  if (archivo.size > 20 * 1024 * 1024) return error("archivo_muy_grande", "El archivo pasa de 20 MB. Divide el archivo.");
  const ext = archivo.name.split(".").pop()?.toLowerCase();
  if (ext === "accdb" || ext === "mdb")
    return error("ilegible", "En el demo sin backend no se puede leer Access. Exporta la tabla a Excel o CSV.");
  if (!["xlsx", "xls", "csv"].includes(ext ?? "")) return error("validacion", "Sube un archivo .xlsx, .csv o .accdb.");

  const XLSX = await import("xlsx");
  const libro = ext === "csv" ? XLSX.read(await archivo.text(), { type: "string", raw: true }) : XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const encabezados = ((XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false })[0] as unknown[]) ?? []).map((h) => String(h ?? "").trim()).filter(Boolean);
  const filas = XLSX.utils.sheet_to_json<Record<string, string>>(hoja, { defval: "", raw: false });
  if (!encabezados.length || !filas.length) return error("ilegible", "No encontramos filas en el archivo. Revisa el archivo.");

  const { sugerirMapeo } = await import("@/lib/mapeo");
  const viejo = sugerirMapeo(encabezados);
  const usados = new Set<string>();
  const mapeo: Record<string, string | null> = {};
  for (const col of encabezados) {
    const destino = viejo[col] ? A_CONTRATO[viejo[col]] ?? null : null;
    mapeo[col] = destino && !usados.has(destino) ? destino : null;
    if (destino) usados.add(destino);
  }
  const id = nuevoId("imp");
  const url = URL.createObjectURL(archivo);
  vivas.add(url);
  memoria.importaciones.set(id, { archivo: archivo.name, url, filas });
  const importacion: Importacion = {
    id,
    archivo: archivo.name,
    filas: filas.length,
    columnas: encabezados,
    mapeo_sugerido: mapeo,
    muestra: filas.slice(0, 5).map((f) => Object.fromEntries(encabezados.map((h) => [h, String(f[h] ?? "")]))),
  };
  return resp(201, importacion);
});

// 20. POST /importar/{id}/confirmar
const A_VIEJO: Record<string, string> = Object.fromEntries(Object.entries(A_CONTRATO).filter(([k]) => k !== "medicamentos").map(([k, v]) => [v!, k]));

ruta("POST", "/importar/{id}/confirmar", async (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const imp = memoria.importaciones.get(decodeURIComponent(m[1]));
  if (!imp) return error("no_existe", "Esa importación ya no existe. Sube el archivo otra vez.");
  const mapeo = ((p.json as { mapeo?: Record<string, string | null> } | undefined)?.mapeo ?? {}) as Record<string, string | null>;
  if (!Object.values(mapeo).includes("dpi")) return error("validacion", "Indica qué columna trae el DPI.");
  if (!Object.values(mapeo).includes("nombre")) return error("validacion", "Indica qué columna trae el nombre.");
  const { filaARegistro } = await import("@/lib/mapeo");
  const mapeoViejo = Object.fromEntries(Object.entries(mapeo).map(([col, campo]) => [col, (campo && A_VIEJO[campo]) || ""])) as Parameters<typeof filaARegistro>[1];

  const e = cargar();
  const grupos = new Map<string, Array<{ fila: number; r: ReturnType<typeof filaARegistro>["registro"] }>>();
  const filas_con_error: Array<{ fila: number; motivo: string }> = [];
  imp.filas.forEach((cruda, i) => {
    const fila = i + 2; // la fila 1 es el encabezado
    const { registro: r } = filaARegistro(cruda, mapeoViejo);
    if (!r.dpi_cui) return filas_con_error.push({ fila, motivo: "DPI inválido" });
    if (!r.nombre) return filas_con_error.push({ fila, motivo: "Sin nombre" });
    if (!grupos.has(r.dpi_cui)) grupos.set(r.dpi_cui, []);
    grupos.get(r.dpi_cui)!.push({ fila, r });
  });

  const campo = <T,>(v: T | null | undefined, vacio = (x: T) => !x): { valor: T | null; confianza: "alta" | "baja" } =>
    v === null || v === undefined || vacio(v) ? { valor: null, confianza: "baja" } : { valor: v, confianza: "alta" };

  const fichas: Array<{ id: string; dpi: string; nombre: string }> = [];
  for (const [dpi, filas] of grupos) {
    const r0 = filas[0].r;
    if (!e.pacientes[dpi]) {
      // Si un DPI del archivo no existe, se crea el paciente.
      e.pacientes[dpi] = {
        paciente: { dpi, nombre: r0.nombre, fecha_nacimiento: r0.fecha_nacimiento || null, sexo: r0.sexo === "F" || r0.sexo === "M" ? r0.sexo : null, comunidad: r0.comunidad || null, alergias: [], condiciones_cronicas: [], version: 1 },
        telefono: null,
        pin: pinNuevo(),
        debe_cambiar_pin: true,
        creado_por: q.usuario.id,
        intentos: { n: 0, bloqueado_hasta: null },
      };
      e.bitacora[dpi] = [];
    }
    const extraccion: Extraccion = {
      paciente: {
        nombre: campo(r0.nombre),
        dpi: campo(dpi),
        fecha_nacimiento: campo(r0.fecha_nacimiento),
        sexo: campo(r0.sexo === "F" || r0.sexo === "M" ? (r0.sexo as "F" | "M") : null),
        comunidad: campo(r0.comunidad),
        alergias: { valor: [...new Set(filas.flatMap((f) => f.r.alergias))], confianza: "alta" },
        condiciones_cronicas: { valor: [...new Set(filas.flatMap((f) => f.r.condiciones_cronicas))], confianza: "alta" },
      },
      consultas: filas.map(({ fila, r }) => ({
        fecha: campo(r.fecha),
        motivo: campo(r.motivo),
        diagnostico: campo(r.diagnostico),
        tratamiento: campo([r.tratamiento, ...r.medicamentos].filter(Boolean).join(". ")),
        vacunas: { valor: r.vacunas, confianza: "alta" },
        pagina: fila - 2,
      })),
    };
    const ficha: FichaGuardada = {
      id: nuevoId("f"),
      dpi,
      origen: "importacion",
      client_id: null,
      estado: "lista",
      originales: [imp.url],
      extraccion,
      error: null,
      creada_en: isoGT(),
      lista_en: 0,
    };
    e.fichas[ficha.id] = ficha;
    fichas.push({ id: ficha.id, dpi, nombre: e.pacientes[dpi].paciente.nombre });
  }
  guardar();
  return resp(200, { fichas, filas_con_error });
});

// ---------------------------------------------------------------- entrada

/** Atiende una petición como lo haría el backend. Agrega una latencia corta para que se vean los estados de carga. */
export async function responder(p: Peticion): Promise<Response> {
  await new Promise((r) => setTimeout(r, 180 + Math.random() * 320));
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("sin señal");
  const camino = p.ruta;
  for (const [metodo, patron, fn] of RUTAS) {
    const m = patron.exec(camino);
    if (m && metodo === p.metodo) {
      try {
        return await fn(p, m);
      } catch (e) {
        if (e instanceof Corte) return e.respuesta;
        console.error("[mock]", e);
        return resp(500, { error: { codigo: "validacion", mensaje: "El servidor simulado falló. Intenta de nuevo." } });
      }
    }
  }
  return error("no_existe", `Ruta simulada no encontrada: ${p.metodo} ${camino}`);
}

export function usuarioDemoPorCorreo(correo: string) {
  return CUENTAS_DEMO.find((c) => c.correo === correo.trim().toLowerCase()) ?? null;
}

export { USUARIO_ENFERMERA, USUARIO_MEDICO };
export type { Version };

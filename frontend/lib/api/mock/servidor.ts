/**
 * Servidor simulado del contrato v3 (rutas por id). Responde a las 20 rutas con objetos Response, así el cliente
 * no distingue entre esto y el backend real. Parte de contrato/mocks/*.json (ver datos.ts) y aplica las reglas
 * que el frontend tiene que poder dibujar: roles, 403 acceso_vencido, códigos de un solo uso, 429 tras 5 intentos,
 * emergencia solo con alergias y condiciones crónicas, bitácora y versiones.
 *
 * El estado se guarda en localStorage (sigo:mock:v3) para que sobreviva a recargas en el demo.
 * Las horas se calculan desde ahora, no se copian del documento, para que las cuentas regresivas funcionen.
 */
import type { Acceso, CodigoTemporal, Consulta, Expediente, Extraccion, Ficha, Fuente, Paciente, ResultadoImportacion, Usuario } from "@/lib/types";
import { ERRORES, type CodigoError } from "../errores";
import type { Peticion } from "../cliente";
import { MODO_DEMO, PATRON_IDENTIFICADOR } from "../cliente";
import {
  BITACORA_SEMILLA,
  CONSULTAS_SEMILLA,
  CUENTAS_DEMO,
  EXTRACCION_EJEMPLO,
  FICHA_SEMILLA,
  FOTO_RESPALDO,
  PACIENTES_SEMILLA,
  type RegistroConsulta,
  type RegistroPaciente,
} from "./datos";
import { exportarDOCX, exportarHTML, exportarJSON, exportarMarkdown, exportarPDF, exportarTexto, exportarXLSX } from "./archivos";
import { fechaCorta, isoGuatemala } from "@/lib/utils";

// ---------------------------------------------------------------- tiempos del contrato

const MIN = 60_000;
const DURACION_ACCESO_CODIGO = MODO_DEMO ? 2 * MIN : 120 * MIN;
const DURACION_CANJE_CODIGO = 10 * MIN;
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
  pacientes: Record<string, RegistroPaciente & { intentos: Intentos }>; // por id
  consultas: RegistroConsulta[];
  fichas: Record<string, FichaGuardada>;
  codigos: Record<string, { paciente_id: string; vence_en: string; usado_por: string | null }>;
  /** Accesos del médico demo, por paciente. `desde` identifica su fila en la bitácora. */
  accesos_medico: Record<string, { tipo: "codigo" | "emergencia"; vence: number; desde: string }>;
  bitacora: Record<string, Acceso[]>;
  intentos_pin: Record<string, Intentos>; // por DPI, también para DPI que no existen
  intentos_codigo: Intentos;
  secuencia: number;
};

const CLAVE = "sigo:mock:v3";
let estado: Estado | null = null;
/** URLs blob: creadas en esta carga de la página (las de cargas anteriores ya no sirven). */
const vivas = new Set<string>();

function semilla(): Estado {
  return {
    pacientes: Object.fromEntries(PACIENTES_SEMILLA.map((p) => [p.paciente.id, { ...structuredClone(p), intentos: { n: 0, bloqueado_hasta: null } }])),
    consultas: structuredClone(CONSULTAS_SEMILLA),
    fichas: { [FICHA_SEMILLA.id]: { ...structuredClone(FICHA_SEMILLA), lista_en: 0 } },
    codigos: {},
    accesos_medico: {},
    bitacora: structuredClone(BITACORA_SEMILLA),
    intentos_pin: {},
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

/** Vuelve a los datos semilla. */
export function reiniciarMock() {
  estado = semilla();
  guardar();
}

const nuevoId = (prefijo: string) => {
  const e = cargar();
  e.secuencia += 1;
  return `${prefijo}_${e.secuencia}`;
};

const urlLocal = (b: Blob) => {
  const u = URL.createObjectURL(b);
  vivas.add(u);
  return u;
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

// ---------------------------------------------------------------- sesión y permisos

type Quien = { usuario: Usuario };

function quien(token: string | null): Quien {
  if (!token) return cortar("sin_sesion");
  const cuenta = CUENTAS_DEMO.find((c) => c.token === token);
  if (cuenta) return { usuario: cuenta.usuario };
  const m = /^mock-paciente\.(.+)$/.exec(token);
  const r = m ? cargar().pacientes[m[1]] : null;
  if (r) return { usuario: { id: `u_${r.paciente.id}`, nombre: r.paciente.nombre, rol: "paciente", centro: null, paciente_id: r.paciente.id, debe_cambiar_pin: r.debe_cambiar_pin } };
  return cortar("sin_sesion");
}

function exigirRol(q: Quien, ...roles: Usuario["rol"][]) {
  if (!roles.includes(q.usuario.rol)) cortar("rol_no_permitido", "Tu rol no puede hacer esto.");
}

function registro(id: string) {
  const r = cargar().pacientes[id];
  if (!r) return cortar("no_existe", "Ese paciente no existe.");
  return r;
}

const porDpi = (dpi: string) => Object.values(cargar().pacientes).find((r) => r.paciente.dpi === dpi) ?? null;

/** Regla 5: la enfermera solo ve pacientes con alguna consulta en su centro o que ella creó. */
function enfermeraPuedeVer(q: Quien, pacienteId: string): boolean {
  const r = cargar().pacientes[pacienteId];
  if (!r) return false;
  if (r.creado_por === q.usuario.id) return true;
  return cargar().consultas.some((c) => c.paciente_id === pacienteId && c.versiones.at(-1)!.datos.centro.id === q.usuario.centro?.id);
}

function exigirCentro(q: Quien, pacienteId: string) {
  if (!enfermeraPuedeVer(q, pacienteId)) cortar("rol_no_permitido", "Este paciente no tiene consultas en tu centro.");
}

/** Acceso del médico vigente para ese paciente, o corta con acceso_vencido. */
function accesoMedico(pacienteId: string) {
  const a = cargar().accesos_medico[pacienteId];
  if (!a || a.vence <= Date.now()) return cortar("acceso_vencido", "El acceso a este expediente ya venció. Pide un código nuevo a la paciente.");
  return a;
}

/** Quién puede leer el expediente, según el contrato. Devuelve el acceso del médico si aplica. */
function puedeLeer(q: Quien, pacienteId: string) {
  registro(pacienteId);
  switch (q.usuario.rol) {
    case "paciente":
      if (q.usuario.paciente_id !== pacienteId) cortar("rol_no_permitido", "Solo puedes ver tu propio historial.");
      return null;
    case "enfermera":
      exigirCentro(q, pacienteId);
      return null;
    case "medico":
      return accesoMedico(pacienteId);
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

// ---------------------------------------------------------------- expediente y bitácora

function consultaVigente(r: RegistroConsulta): Consulta {
  const v = r.versiones.at(-1)!;
  return { id: r.id, version: v.version, ...v.datos, editada_por: v.editada_por, editada_en: v.editada_en };
}

function consultasDe(pacienteId: string): Consulta[] {
  return cargar()
    .consultas.filter((c) => c.paciente_id === pacienteId)
    .map(consultaVigente)
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
}

/** Medicamentos actuales: tratamientos de consultas de los últimos 90 días. */
function medicamentos(consultas: Consulta[]): string[] {
  const limite = Date.now() - 90 * 24 * 60 * MIN;
  return consultas.filter((c) => c.fecha && c.tratamiento && new Date(c.fecha + "T12:00:00-06:00").getTime() >= limite).map((c) => c.tratamiento!);
}

function expediente(pacienteId: string, tipo: Expediente["tipo_acceso"], vence: number | null): Expediente {
  const p = cargar().pacientes[pacienteId].paciente;
  const consultas = consultasDe(pacienteId);
  const emergencia = tipo === "emergencia";
  return {
    paciente: structuredClone(p),
    // Emergencia: solo alergias y condiciones crónicas; medicamentos llega vacío.
    alertas: { alergias: [...p.alergias], condiciones_cronicas: [...p.condiciones_cronicas], medicamentos: emergencia ? [] : medicamentos(consultas) },
    consultas: emergencia ? [] : consultas,
    tipo_acceso: tipo,
    acceso_vence_en: vence ? isoGT(vence) : null,
  };
}

/** Regla 8: la bitácora la escribe el backend. Lecturas seguidas de la misma enfermera se agrupan (10 min). */
function anotarEnfermera(q: Quien, pacienteId: string) {
  const b = (cargar().bitacora[pacienteId] ??= []);
  const ultima = b[0];
  const ahora = Date.now();
  if (ultima && ultima.tipo === "enfermera" && ultima.quien === q.usuario.nombre && ahora - ms(ultima.hasta) < 10 * MIN) {
    ultima.hasta = isoGT(ahora);
  } else {
    b.unshift({ quien: q.usuario.nombre, centro: q.usuario.centro?.nombre ?? "", tipo: "enfermera", motivo: null, desde: isoGT(ahora), hasta: isoGT(ahora), preguntas_hechas: 0 });
  }
}

function abrirAccesoMedico(q: Quien, pacienteId: string, tipo: "codigo" | "emergencia", motivo: string | null) {
  const e = cargar();
  const ahora = Date.now();
  const vence = ahora + (tipo === "emergencia" ? DURACION_EMERGENCIA : DURACION_ACCESO_CODIGO);
  const desde = isoGT(ahora);
  (e.bitacora[pacienteId] ??= []).unshift({ quien: q.usuario.nombre, centro: q.usuario.centro?.nombre ?? "", tipo, motivo, desde, hasta: isoGT(vence), preguntas_hechas: 0 });
  e.accesos_medico[pacienteId] = { tipo, vence, desde };
  guardar();
  return vence;
}

// ---------------------------------------------------------------- utilidades

const ALFABETO_CODIGO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin 0, O, 1 ni I
const aleatorio = (n: number, alfabeto: string) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => alfabeto[b % alfabeto.length]).join("");
const codigoAleatorio = () => {
  const s = aleatorio(8, ALFABETO_CODIGO);
  return `${s.slice(0, 4)}-${s.slice(4)}`;
};
const tmpNuevo = () => `TMP-${isoGT().slice(0, 10).replace(/-/g, "")}-${aleatorio(4, ALFABETO_CODIGO)}`;
const pinNuevo = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");

/** Fórmula pública mod 11 (pesos 2..9 sobre el correlativo) y departamento/municipio. Solo advierte, nunca bloquea. */
const MUNICIPIOS: Record<string, number> = { "01": 17, "02": 8, "03": 16, "04": 16, "05": 13, "06": 14, "07": 19, "08": 8, "09": 24, "10": 21, "11": 9, "12": 30, "13": 32, "14": 21, "15": 8, "16": 17, "17": 14, "18": 5, "19": 11, "20": 11, "21": 7, "22": 17 };
export function dpiDudoso(dpi: string): boolean {
  if (!/^\d{13}$/.test(dpi)) return false; // un TMP- nunca lleva advertencia
  const suma = [...dpi.slice(0, 8)].reduce((s, d, i) => s + Number(d) * (i + 2), 0);
  const verificador = suma % 11;
  const depto = dpi.slice(9, 11);
  const muni = Number(dpi.slice(11, 13));
  return verificador === 10 || verificador !== Number(dpi[8]) || !MUNICIPIOS[depto] || muni < 1 || muni > MUNICIPIOS[depto];
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
const fechaValida = (v: unknown) => v === null || v === undefined || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));
const sexo = (v: unknown): "F" | "M" | null => (v === "F" || v === "M" ? v : null);
const query = (ruta: string) => new URLSearchParams(ruta.split("?")[1] ?? "");

function nuevoPaciente(q: Quien, datos: Omit<Paciente, "id" | "version" | "alergias" | "condiciones_cronicas">, telefono: string | null) {
  const e = cargar();
  const paciente: Paciente = { id: nuevoId("p"), ...datos, alergias: [], condiciones_cronicas: [], version: 1 };
  const pin = pinNuevo();
  e.pacientes[paciente.id] = { paciente, telefono, pin, debe_cambiar_pin: true, creado_por: q.usuario.id, intentos: { n: 0, bloqueado_hasta: null } };
  e.bitacora[paciente.id] = [];
  return { paciente, pin };
}

// ---------------------------------------------------------------- rutas

type Manejador = (p: Peticion, m: RegExpExecArray) => Response | Promise<Response>;
const RUTAS: Array<[Peticion["metodo"], RegExp, Manejador]> = [];
const ruta = (metodo: Peticion["metodo"], patron: string, fn: Manejador) =>
  RUTAS.push([metodo, new RegExp("^" + patron.replace(/\{(\w+)\}/g, "([^/?]+)") + "(?:\\?.*)?$"), fn]);
const param = (m: RegExpExecArray) => decodeURIComponent(m[1]);

// 1. GET /me
ruta("GET", "/me", (p) => resp(200, quien(p.token).usuario));

// 2. POST /auth/paciente
ruta("POST", "/auth/paciente", (p) => {
  const { dpi, pin } = (p.json ?? {}) as { dpi?: string; pin?: string };
  if (!dpi || !PATRON_IDENTIFICADOR.test(dpi)) return error("identificador_invalido");
  const e = cargar();
  // Cuenta intentos por DPI aunque no exista, para no revelar qué DPI están registrados.
  const intentos = (e.intentos_pin[dpi] ??= { n: 0, bloqueado_hasta: null });
  intentar(intentos);
  const r = porDpi(dpi);
  if (!r || r.pin !== pin) {
    fallo(intentos);
    return error("pin_incorrecto", "DPI o PIN incorrectos.");
  }
  intentos.n = 0;
  guardar();
  return resp(200, { token: `mock-paciente.${r.paciente.id}`, vence_en: isoGT(Date.now() + 120 * MIN), paciente_id: r.paciente.id });
});

// 3. PUT /me/pin
ruta("PUT", "/me/pin", (p) => {
  const q = quien(p.token);
  exigirRol(q, "paciente");
  const { pin_actual, pin_nuevo } = (p.json ?? {}) as { pin_actual?: string; pin_nuevo?: string };
  const r = registro(q.usuario.paciente_id!);
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

// 4. GET /pacientes/buscar?dpi=  → lista; vacía si no existe (nunca 404)
ruta("GET", "/pacientes/buscar", (p) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const dpi = query(p.ruta).get("dpi") ?? "";
  if (!PATRON_IDENTIFICADOR.test(dpi)) return error("identificador_invalido");
  const r = porDpi(dpi);
  if (!r) return resp(200, { pacientes: [] });
  exigirCentro(q, r.paciente.id);
  return resp(200, { pacientes: [r.paciente] });
});

// 5. POST /pacientes
ruta("POST", "/pacientes", (p) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const b = (p.json ?? {}) as Record<string, unknown>;
  const nombre = texto(b.nombre);
  if (!nombre) return error("validacion", "Escribe el nombre completo.");
  if (!fechaValida(b.fecha_nacimiento)) return error("validacion", "La fecha de nacimiento debe ser AAAA-MM-DD.");
  const dpi = b.dpi === null || b.dpi === undefined ? null : String(b.dpi);
  if (dpi !== null && !/^\d{13}$/.test(dpi)) return error("identificador_invalido", "El DPI debe tener 13 dígitos.");
  if (dpi && porDpi(dpi)) return error("dpi_ya_existe", "Ese DPI ya está registrado. Abrimos su expediente.");
  const { paciente, pin } = nuevoPaciente(
    q,
    { dpi: dpi ?? tmpNuevo(), nombre, fecha_nacimiento: (b.fecha_nacimiento as string | null) ?? null, sexo: sexo(b.sexo), comunidad: texto(b.comunidad) },
    texto(b.telefono)
  );
  guardar();
  return resp(201, { paciente, pin_inicial: pin, advertencias: dpi && dpiDudoso(dpi) ? ["dpi_dudoso"] : [] });
});

// 6. POST /pacientes/{id}/fichas
ruta("POST", "/pacientes/{id}/fichas", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const pacienteId = param(m);
  registro(pacienteId);
  exigirCentro(q, pacienteId);
  const f = p.form;
  const clientId = String(f?.get("client_id") ?? "");
  const imagenes = (f?.getAll("imagenes") ?? []).filter((x): x is File => x instanceof Blob);
  if (!clientId) return error("validacion", "Falta el client_id de la foto.");
  if (!imagenes.length) return error("validacion", "Agrega al menos una foto.");
  if (imagenes.some((i) => i.size > 5 * 1024 * 1024)) return error("archivo_muy_grande", "Una foto pasa de 5 MB. Vuelve a comprimirla.");
  const e = cargar();
  // Regla 10: un client_id repetido devuelve la ficha que ya existe, con 200.
  const existente = Object.values(e.fichas).find((x) => x.client_id === clientId);
  if (existente) return resp(200, vistaFicha(existente));
  const ahora = Date.now();
  const ficha: FichaGuardada = {
    id: nuevoId("f"),
    paciente_id: pacienteId,
    origen: "foto",
    importacion_id: null,
    client_id: clientId,
    estado: "procesando",
    originales: imagenes.map(urlLocal),
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
    const ex = structuredClone(EXTRACCION_EJEMPLO);
    ex.consultas = ex.consultas.map((c, i) => ({ ...c, pagina: Math.min(i, f.originales.length - 1) }));
    f.extraccion = ex;
    guardar();
  }
  return {
    id: f.id,
    paciente_id: f.paciente_id,
    origen: f.origen,
    importacion_id: f.importacion_id,
    client_id: f.client_id,
    estado: f.estado,
    // Las URLs blob: no sobreviven a una recarga; en el demo se cambian por la foto de ejemplo.
    originales: f.originales.map((u) => (u.startsWith("blob:") && !vivas.has(u) ? FOTO_RESPALDO : u)),
    extraccion: f.extraccion,
    error: f.error,
    creada_en: f.creada_en,
  };
}

// 8. GET /fichas?estado=lista&importacion_id=
ruta("GET", "/fichas", (p) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const qs = query(p.ruta);
  const estadoBuscado = qs.get("estado");
  const imp = qs.get("importacion_id");
  const fichas = Object.values(cargar().fichas)
    .map(vistaFicha)
    .filter((f) => (!estadoBuscado || f.estado === estadoBuscado) && (!imp || f.importacion_id === imp) && enfermeraPuedeVer(q, f.paciente_id))
    .sort((a, b) => b.creada_en.localeCompare(a.creada_en));
  return resp(200, { fichas });
});

// 7. GET /fichas/{id}
ruta("GET", "/fichas/{id}", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const f = cargar().fichas[param(m)];
  if (!f) return error("no_existe", "Esa ficha no existe.");
  exigirCentro(q, f.paciente_id);
  return resp(200, vistaFicha(f));
});

// 9. POST /fichas/{id}/confirmar  (paciente completo salvo el dpi)
ruta("POST", "/fichas/{id}/confirmar", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const e = cargar();
  const f = e.fichas[param(m)];
  if (!f) return error("no_existe", "Esa ficha no existe.");
  exigirCentro(q, f.paciente_id);
  const vista = vistaFicha(f);
  if (f.estado === "confirmada") return error("ficha_ya_confirmada", "Esta ficha ya se confirmó.");
  if (f.estado !== "lista") return error("validacion", "La ficha todavía no está lista para confirmar.");
  const b = (p.json ?? {}) as { paciente?: Record<string, unknown>; consultas?: unknown[]; consentimiento?: unknown };
  if (b.consentimiento !== true) return error("sin_consentimiento", "Marca que la paciente dio su consentimiento.");
  const bp = b.paciente ?? {};
  if ("dpi" in bp) return error("validacion", "El DPI no se corrige desde la app.");
  if (!texto(bp.nombre)) return error("validacion", "El nombre no puede quedar vacío.");
  if (!fechaValida(bp.fecha_nacimiento)) return error("validacion", "La fecha de nacimiento debe ser AAAA-MM-DD.");
  const consultas = Array.isArray(b.consultas) ? (b.consultas as Record<string, unknown>[]) : [];
  for (const c of consultas) if (!fechaValida(c.fecha)) return error("validacion", "Hay una fecha de consulta que no es AAAA-MM-DD.");

  const ahora = isoGT();
  for (const c of consultas) {
    const pagina = Number(c.pagina ?? 0);
    e.consultas.push({
      id: nuevoId("con"),
      paciente_id: f.paciente_id,
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
            original_url: vista.originales[f.origen === "foto" ? pagina : 0] ?? vista.originales[0] ?? FOTO_RESPALDO,
          },
          motivo_cambio: null,
          editada_por: q.usuario.nombre,
          editada_en: ahora,
        },
      ],
    });
  }
  // Datos del paciente: si cambian, sube la versión (nada se borra).
  const pac = e.pacientes[f.paciente_id].paciente;
  const nuevo: Paciente = {
    ...pac,
    nombre: texto(bp.nombre)!,
    fecha_nacimiento: (bp.fecha_nacimiento as string | null) ?? null,
    sexo: sexo(bp.sexo),
    comunidad: texto(bp.comunidad),
    alergias: lista(bp.alergias),
    condiciones_cronicas: lista(bp.condiciones_cronicas),
  };
  if (JSON.stringify({ ...nuevo, version: 0 }) !== JSON.stringify({ ...pac, version: 0 })) {
    e.pacientes[f.paciente_id].paciente = { ...nuevo, version: pac.version + 1 };
  }
  f.estado = "confirmada";
  guardar();
  return resp(201, { consultas_creadas: consultas.length, version: 1 });
});

// 10. POST /consultas/{id}/versiones
ruta("POST", "/consultas/{id}/versiones", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const r = cargar().consultas.find((c) => c.id === param(m));
  if (!r) return error("no_existe", "Esa consulta no existe.");
  exigirCentro(q, r.paciente_id);
  const b = (p.json ?? {}) as Record<string, unknown>;
  const motivo = texto(b.motivo_cambio);
  if (!motivo) return error("motivo_requerido", "Escribe por qué corriges este dato.");
  if (!fechaValida(b.fecha)) return error("validacion", "La fecha debe ser AAAA-MM-DD.");
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

// 13. GET /consultas/{id}/versiones
ruta("GET", "/consultas/{id}/versiones", (p, m) => {
  const q = quien(p.token);
  const r = cargar().consultas.find((c) => c.id === param(m));
  if (!r) return error("no_existe", "Esa consulta no existe.");
  const acceso = puedeLeer(q, r.paciente_id);
  if (acceso?.tipo === "emergencia") return error("solo_emergencia");
  return resp(200, { versiones: [...r.versiones].reverse() });
});

// 11. POST /pacientes/{id}/versiones
ruta("POST", "/pacientes/{id}/versiones", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const r = registro(param(m));
  exigirCentro(q, r.paciente.id);
  const b = (p.json ?? {}) as Record<string, unknown>;
  if ("dpi" in b) return error("validacion", "El DPI no se corrige desde la app.");
  if (!texto(b.motivo_cambio)) return error("motivo_requerido", "Escribe por qué corriges este dato.");
  if (!fechaValida(b.fecha_nacimiento)) return error("validacion", "La fecha debe ser AAAA-MM-DD.");
  const pac = { ...r.paciente };
  if ("nombre" in b) {
    const n = texto(b.nombre);
    if (!n) return error("validacion", "El nombre no puede quedar vacío.");
    pac.nombre = n;
  }
  if ("fecha_nacimiento" in b) pac.fecha_nacimiento = (b.fecha_nacimiento as string | null) ?? null;
  if ("sexo" in b) pac.sexo = sexo(b.sexo);
  if ("comunidad" in b) pac.comunidad = texto(b.comunidad);
  if ("alergias" in b) pac.alergias = lista(b.alergias);
  if ("condiciones_cronicas" in b) pac.condiciones_cronicas = lista(b.condiciones_cronicas);
  pac.version += 1;
  r.paciente = pac;
  guardar();
  return resp(201, pac);
});

// 12. GET /pacientes/{id}/expediente
ruta("GET", "/pacientes/{id}/expediente", (p, m) => {
  const q = quien(p.token);
  const id = param(m);
  const acceso = puedeLeer(q, id);
  if (q.usuario.rol === "enfermera") {
    anotarEnfermera(q, id);
    guardar();
  }
  return resp(200, expediente(id, acceso?.tipo ?? null, acceso?.vence ?? null));
});

// 14. GET /pacientes/{id}/exportar?formato=  (solo la paciente)
ruta("GET", "/pacientes/{id}/exportar", async (p, m) => {
  const q = quien(p.token);
  const id = param(m);
  if (q.usuario.rol === "medico") {
    const a = accesoMedico(id);
    return a.tipo === "emergencia" ? error("solo_emergencia") : error("rol_no_permitido", "Las descargas son solo de la paciente.");
  }
  exigirRol(q, "paciente");
  puedeLeer(q, id);
  const formato = query(p.ruta).get("formato") ?? "pdf";
  const exp = expediente(id, null, null);
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
  const nombre = `historial-${exp.paciente.dpi}.${formato}`;
  return new Response(blob, { status: 200, headers: { "Content-Type": blob.type, "Content-Disposition": `attachment; filename="${nombre}"` } });
});

// 15. POST /pacientes/{id}/codigos
ruta("POST", "/pacientes/{id}/codigos", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "paciente", "enfermera");
  const id = param(m);
  puedeLeer(q, id);
  // Si lo pide la enfermera a pedido de la paciente, queda en la bitácora.
  if (q.usuario.rol === "enfermera") anotarEnfermera(q, id);
  const e = cargar();
  let codigo = codigoAleatorio();
  while (e.codigos[codigo]) codigo = codigoAleatorio();
  const vence = isoGT(Date.now() + DURACION_CANJE_CODIGO);
  e.codigos[codigo] = { paciente_id: id, vence_en: vence, usado_por: null };
  const sms = (p.json as { enviar_sms?: boolean } | undefined)?.enviar_sms === true;
  guardar();
  const c: CodigoTemporal = { codigo, qr: `https://sigo.app/c/${codigo}`, vence_en: vence, enviado_por_sms: sms && Boolean(e.pacientes[id].telefono) };
  return resp(201, c);
});

// 16. POST /codigos/canjear
ruta("POST", "/codigos/canjear", (p) => {
  const q = quien(p.token);
  exigirRol(q, "medico");
  const e = cargar();
  intentar(e.intentos_codigo);
  const codigo = String((p.json as { codigo?: string } | undefined)?.codigo ?? "").toUpperCase();
  const c = e.codigos[codigo];
  if (!c) {
    fallo(e.intentos_codigo);
    return error("no_existe", "No encontramos ese código. Revísalo con la paciente.");
  }
  if (c.usado_por) return error("codigo_ya_usado", "Este código ya se usó.");
  if (ms(c.vence_en) < Date.now()) return error("codigo_vencido", "Este código ya venció. Pide uno nuevo a la paciente.");
  c.usado_por = q.usuario.id;
  e.intentos_codigo = { n: 0, bloqueado_hasta: null };
  const vence = abrirAccesoMedico(q, c.paciente_id, "codigo", null);
  return resp(200, { paciente_id: c.paciente_id, acceso_vence_en: isoGT(vence) });
});

// 17. POST /pacientes/{id}/preguntar
ruta("POST", "/pacientes/{id}/preguntar", async (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "medico");
  const id = param(m);
  registro(id);
  const a = accesoMedico(id);
  if (a.tipo === "emergencia") return error("solo_emergencia");
  const pregunta = texto((p.json as { pregunta?: string } | undefined)?.pregunta);
  if (!pregunta) return error("validacion", "Escribe una pregunta.");
  await new Promise((r) => setTimeout(r, 900));
  const fila = cargar().bitacora[id]?.find((x) => x.tipo === a.tipo && x.desde === a.desde);
  if (fila) fila.preguntas_hechas += 1;
  guardar();
  return resp(200, responderPregunta(id, pregunta));
});

function responderPregunta(pacienteId: string, pregunta: string): { respuesta: string; fuentes: Fuente[] } {
  const consultas = consultasDe(pacienteId);
  const pac = cargar().pacientes[pacienteId].paciente;
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const pq = norm(pregunta);
  const fuente = (c: Consulta, campo: string): Fuente => ({ consulta_id: c.id, version: c.version, original_url: c.original_url, campo });
  const donde = (c: Consulta) => `${fechaCorta(c.fecha)}, ${c.centro.nombre}`;

  if (pq.includes("vacun")) {
    const c = consultas.find((x) => x.vacunas.length);
    if (c) return { respuesta: `La última vacuna registrada es ${c.vacunas.join(", ")} (${donde(c)}).`, fuentes: [fuente(c, "vacunas")] };
  }
  if (pq.includes("alerg") && pac.alergias.length) {
    // En los datos del demo, las alergias se confirmaron junto con la ficha de con-002.
    const origen = consultas.find((c) => c.id === "con-002") ?? consultas.at(-1);
    if (origen) return { respuesta: `Alergia registrada: ${pac.alergias.join(", ")}.`, fuentes: [fuente(origen, "alergias")] };
  }
  if (pq.includes("tratamiento") || pq.includes("medicamento") || pq.includes("toma")) {
    const c = consultas.find((x) => x.tratamiento);
    if (c) return { respuesta: `El tratamiento más reciente es: ${c.tratamiento} (${donde(c)}).`, fuentes: [fuente(c, "tratamiento")] };
  }
  if (pq.includes("diagnost") || pq.includes("ultima consulta") || pq.includes("ultima vez")) {
    const c = consultas[0];
    if (c) return { respuesta: `La consulta más reciente fue el ${fechaCorta(c.fecha)}: ${c.motivo ?? "sin motivo escrito"}. Diagnóstico: ${c.diagnostico ?? "no registrado"}.`, fuentes: [fuente(c, "diagnostico")] };
  }
  const palabras = pq.split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 5);
  for (const c of consultas) {
    for (const campo of ["motivo", "diagnostico", "tratamiento"] as const) {
      if (palabras.some((w) => norm(c[campo] ?? "").includes(w))) return { respuesta: `Encontré esto el ${fechaCorta(c.fecha)}: ${c[campo]}.`, fuentes: [fuente(c, campo)] };
    }
  }
  return { respuesta: "No lo encontré en el expediente.", fuentes: [] };
}

// 18. GET /pacientes/{id}/accesos
ruta("GET", "/pacientes/{id}/accesos", (p, m) => {
  const q = quien(p.token);
  exigirRol(q, "paciente");
  const id = param(m);
  puedeLeer(q, id);
  return resp(200, { accesos: cargar().bitacora[id] ?? [] });
});

// 19. POST /emergencia
ruta("POST", "/emergencia", (p) => {
  const q = quien(p.token);
  exigirRol(q, "medico");
  const b = (p.json ?? {}) as { dpi?: string; motivo?: string };
  const motivo = texto(b.motivo);
  if (!motivo || motivo.length < 10) return error("motivo_requerido", "Escribe el motivo de la emergencia, con al menos 10 caracteres.");
  const dpi = String(b.dpi ?? "");
  if (!PATRON_IDENTIFICADOR.test(dpi)) return error("identificador_invalido");
  const r = porDpi(dpi);
  if (!r) return error("no_existe", "No hay un paciente con ese DPI en Sigo.");
  const vence = abrirAccesoMedico(q, r.paciente.id, "emergencia", motivo);
  return resp(200, { paciente_id: r.paciente.id, acceso_vence_en: isoGT(vence), tipo_acceso: "emergencia" });
});

// 20. POST /importaciones (un solo paso)
ruta("POST", "/importaciones", async (p) => {
  const q = quien(p.token);
  exigirRol(q, "enfermera");
  const archivo = p.form?.get("archivo");
  if (!(archivo instanceof File)) return error("validacion", "Elige un archivo.");
  const ext = archivo.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["xlsx", "csv", "accdb", "mdb"].includes(ext)) return error("formato_no_soportado", "Sube un Excel (.xlsx), CSV o Access (.accdb, .mdb).");
  if (archivo.size > 20 * 1024 * 1024) return error("archivo_muy_grande", "El archivo pasa de 20 MB. Divide el archivo.");
  if (ext === "accdb" || ext === "mdb") return error("ilegible", "En el demo sin backend no se puede leer Access. Exporta la tabla a Excel o CSV.");

  const XLSX = await import("xlsx");
  const libro = ext === "csv" ? XLSX.read(await archivo.text(), { type: "string", raw: true }) : XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<Record<string, string>>(hoja, { defval: "", raw: false });
  const encabezados = Object.keys(filas[0] ?? {});
  if (!filas.length || !encabezados.length) return error("ilegible", "No encontramos filas en el archivo. Revisa el archivo.");

  // El backend decide qué columna es cada dato; aquí se usa la sugerencia automática de lib/mapeo.
  const { sugerirMapeo, filaARegistro, clavePaciente } = await import("@/lib/mapeo");
  const { limpiarTexto } = await import("@/lib/limpieza");
  const mapeo = sugerirMapeo(encabezados);
  const colDpi = Object.entries(mapeo).find(([, c]) => c === "dpi_cui")?.[0];

  const e = cargar();
  const importacionId = nuevoId("imp");
  const url = urlLocal(archivo);
  const resultado: ResultadoImportacion = { importacion_id: importacionId, total_filas: filas.length, creados: 0, actualizados: 0, con_errores: 0, filas: [] };
  type Registro = ReturnType<typeof filaARegistro>["registro"];
  const grupos = new Map<string, { pacienteId: string; estado: "creado" | "actualizado"; filas: Array<{ indice: number; r: Registro }> }>();

  filas.forEach((cruda, i) => {
    const fila = i + 2; // la fila 1 es el encabezado
    const dpiCrudo = colDpi ? limpiarTexto(cruda[colDpi]) : "";
    const { registro: r } = filaARegistro(cruda, mapeo);
    if ((dpiCrudo && !r.dpi_cui) || !r.nombre) {
      resultado.con_errores += 1;
      resultado.filas.push({ fila, dpi: dpiCrudo || null, estado: "error", expediente_id: null, error: !r.nombre ? "Sin nombre" : "DPI con formato inválido" });
      return;
    }
    const clave = clavePaciente(r);
    let g = grupos.get(clave);
    if (!g) {
      const existente = r.dpi_cui ? porDpi(r.dpi_cui) : null;
      const pacienteId = existente
        ? existente.paciente.id
        : nuevoPaciente(q, { dpi: r.dpi_cui || tmpNuevo(), nombre: r.nombre, fecha_nacimiento: r.fecha_nacimiento || null, sexo: sexo(r.sexo), comunidad: r.comunidad || null }, null).paciente.id;
      g = { pacienteId, estado: existente ? "actualizado" : "creado", filas: [] };
      grupos.set(clave, g);
    }
    g.filas.push({ indice: i, r });
    if (g.estado === "creado") resultado.creados += 1;
    else resultado.actualizados += 1;
    resultado.filas.push({ fila, dpi: r.dpi_cui || null, estado: g.estado, expediente_id: g.pacienteId, error: null });
  });

  // Una ficha en "lista" por paciente, que se revisa y confirma igual que una foto.
  const campo = <T,>(v: T | null | undefined): { valor: T | null; confianza: "alta" | "baja" } =>
    v === null || v === undefined || v === "" ? { valor: null, confianza: "baja" } : { valor: v, confianza: "alta" };
  for (const { pacienteId, filas: fs } of grupos.values()) {
    const r0 = fs[0].r;
    const extraccion: Extraccion = {
      paciente: {
        nombre: campo(r0.nombre),
        dpi: campo(r0.dpi_cui || null),
        fecha_nacimiento: campo(r0.fecha_nacimiento || null),
        // Un sexo distinto de F o M llega como null con confianza baja.
        sexo: campo(sexo(r0.sexo)),
        comunidad: campo(r0.comunidad || null),
        alergias: { valor: [...new Set(fs.flatMap((f) => f.r.alergias))], confianza: "alta" },
        condiciones_cronicas: { valor: [...new Set(fs.flatMap((f) => f.r.condiciones_cronicas))], confianza: "alta" },
      },
      consultas: fs.map(({ indice, r }) => ({
        fecha: campo(r.fecha || null),
        motivo: campo(r.motivo || null),
        diagnostico: campo(r.diagnostico || null),
        tratamiento: campo([r.tratamiento, ...r.medicamentos].filter(Boolean).join(". ") || null),
        vacunas: { valor: r.vacunas, confianza: "alta" },
        pagina: indice,
      })),
      error: null,
    };
    const ficha: FichaGuardada = {
      id: nuevoId("f"),
      paciente_id: pacienteId,
      origen: "importacion",
      importacion_id: importacionId,
      client_id: null,
      estado: "lista",
      originales: [url],
      extraccion,
      error: null,
      creada_en: isoGT(),
      lista_en: 0,
    };
    e.fichas[ficha.id] = ficha;
  }
  guardar();
  return resp(201, resultado);
});

// ---------------------------------------------------------------- entrada

/** Atiende una petición como lo haría el backend. Agrega una latencia corta para que se vean los estados de carga. */
export async function responder(p: Peticion): Promise<Response> {
  await new Promise((r) => setTimeout(r, 180 + Math.random() * 320));
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("sin señal");
  for (const [metodo, patron, fn] of RUTAS) {
    const m = patron.exec(p.ruta);
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
  return error("no_existe", `Ruta simulada no encontrada: ${p.metodo} ${p.ruta}`);
}

export function usuarioDemoPorCorreo(correo: string) {
  return CUENTAS_DEMO.find((c) => c.correo === correo.trim().toLowerCase()) ?? null;
}

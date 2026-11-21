/**
 * Unión por DPI: la misma lógica para la foto de una ficha y para la importación
 * de un sistema antiguo. Si el DPI/CUI existe se agrega la consulta y se fusionan
 * alergias y condiciones sin duplicar; si no, se crea el paciente. Sin DPI se
 * buscan coincidencias por nombre + fecha de nacimiento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Origen, Paciente, RegistroClinico } from "./tipos";
import { clave, fusionarListas } from "./limpieza";

// ---------------------------------------------------------------- puras

function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

/** Similitud de nombres 0..1, tolerante a tildes, orden y errores de una letra. */
export function similitudNombre(a: string, b: string): number {
  const ta = clave(a).split(" ").filter((t) => t.length > 1);
  const tb = clave(b).split(" ").filter((t) => t.length > 1);
  if (!ta.length || !tb.length) return 0;
  const usados = new Set<number>();
  let iguales = 0;
  for (const t of ta) {
    const idx = tb.findIndex((u, i) => !usados.has(i) && (u === t || (t.length >= 5 && distancia(t, u) <= 1)));
    if (idx >= 0) {
      usados.add(idx);
      iguales++;
    }
  }
  return iguales / Math.max(ta.length, tb.length);
}

export interface Candidato {
  paciente: Paciente;
  puntaje: number; // 0..100
  razon: string;
}

export function puntuarCoincidencia(p: Pick<Paciente, "nombre" | "fecha_nacimiento">, nombre: string, fnac: string): Candidato["puntaje"] {
  const sim = similitudNombre(p.nombre, nombre);
  let fecha = 0;
  if (fnac && p.fecha_nacimiento) {
    if (p.fecha_nacimiento === fnac) fecha = 1;
    else if (p.fecha_nacimiento.slice(0, 4) === fnac.slice(0, 4)) fecha = 0.35;
  }
  return Math.round(sim * 62 + fecha * 38);
}

function razon(p: Paciente, nombre: string, fnac: string): string {
  const partes: string[] = [];
  const sim = similitudNombre(p.nombre, nombre);
  if (sim >= 0.99) partes.push("mismo nombre");
  else if (sim >= 0.5) partes.push("nombre parecido");
  if (fnac && p.fecha_nacimiento === fnac) partes.push("misma fecha de nacimiento");
  else if (fnac && p.fecha_nacimiento?.slice(0, 4) === fnac.slice(0, 4)) partes.push("mismo año de nacimiento");
  return partes.join(" y ") || "coincidencia parcial";
}

/** Qué cambia en un paciente existente al recibir un registro nuevo. Nunca borra datos. */
export function fusionarPaciente(existente: Paciente, r: Partial<RegistroClinico>): Partial<Paciente> {
  const cambios: Partial<Paciente> = {};
  const alergias = fusionarListas(existente.alergias, r.alergias ?? []);
  if (alergias.length !== (existente.alergias ?? []).length) cambios.alergias = alergias;
  const condiciones = fusionarListas(existente.condiciones_cronicas, r.condiciones_cronicas ?? []);
  if (condiciones.length !== (existente.condiciones_cronicas ?? []).length) cambios.condiciones_cronicas = condiciones;
  if (!existente.dpi_cui && r.dpi_cui) cambios.dpi_cui = r.dpi_cui;
  if (!existente.fecha_nacimiento && r.fecha_nacimiento) cambios.fecha_nacimiento = r.fecha_nacimiento;
  if (!existente.sexo && (r.sexo === "F" || r.sexo === "M")) cambios.sexo = r.sexo;
  if (!existente.comunidad && r.comunidad) cambios.comunidad = r.comunidad;
  return cambios;
}

/** Huella de una consulta para no duplicarla si se importa dos veces. */
export function huellaConsulta(c: { paciente_id: string; fecha: string; motivo?: string | null; diagnostico?: string | null }): string {
  return `${c.paciente_id}|${c.fecha}|${clave(c.motivo) || clave(c.diagnostico)}`;
}

function nuevoPaciente(r: RegistroClinico) {
  return {
    dpi_cui: r.dpi_cui || null,
    nombre: r.nombre,
    fecha_nacimiento: r.fecha_nacimiento || null,
    sexo: r.sexo === "F" || r.sexo === "M" ? r.sexo : null,
    comunidad: r.comunidad || null,
    alergias: fusionarListas([], r.alergias),
    condiciones_cronicas: fusionarListas([], r.condiciones_cronicas),
  };
}

// ---------------------------------------------------------------- base de datos

type SB = SupabaseClient;

export type ResultadoCoincidencia =
  | { tipo: "dpi"; paciente: Paciente }
  | { tipo: "sugerencias"; candidatos: Candidato[] }
  | { tipo: "nuevo" };

export async function buscarCoincidencias(sb: SB, q: { dpi_cui?: string; nombre?: string; fecha_nacimiento?: string }): Promise<ResultadoCoincidencia> {
  if (q.dpi_cui) {
    const { data, error } = await sb.from("paciente").select("*").eq("dpi_cui", q.dpi_cui).maybeSingle();
    if (error) throw error;
    if (data) return { tipo: "dpi", paciente: data as Paciente };
  }
  const nombre = q.nombre?.trim() ?? "";
  const fnac = q.fecha_nacimiento ?? "";
  if (!nombre) return { tipo: "nuevo" };

  const tokens = clave(nombre).split(" ").filter((t) => t.length >= 4).slice(0, 4);
  const filtros = tokens.map((t) => `nombre.ilike.%${t.replace(/[%_,()]/g, "")}%`);
  if (fnac) filtros.push(`fecha_nacimiento.eq.${fnac}`);
  if (!filtros.length) return { tipo: "nuevo" };

  const { data, error } = await sb.from("paciente").select("*").or(filtros.join(",")).limit(60);
  if (error) throw error;
  const candidatos = (data as Paciente[])
    .filter((p) => !q.dpi_cui || !p.dpi_cui || p.dpi_cui === q.dpi_cui) // otro DPI distinto = otra persona
    .map((p) => ({ paciente: p, puntaje: puntuarCoincidencia(p, nombre, fnac), razon: razon(p, nombre, fnac) }))
    .filter((c) => c.puntaje >= 45)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, 4);
  return candidatos.length ? { tipo: "sugerencias", candidatos } : { tipo: "nuevo" };
}

export interface ContextoUnion {
  centroId: string;
  usuarioId: string;
  origen: Origen;
  fuenteDetalle?: string | null;
  archivos?: string[];
}

export interface ResultadoUnion {
  paciente: Paciente;
  pacienteNuevo: boolean;
  consultaId: string | null;
  duplicada: boolean;
  alergiasNuevas: string[];
}

/**
 * Une un registro (de una foto confirmada) al expediente.
 * `pacienteId`: la persona elegida en la revisión (cuando no hay DPI); `null` = persona nueva.
 */
export async function unirRegistro(sb: SB, r: RegistroClinico, ctx: ContextoUnion, eleccion?: { pacienteId: string | null }): Promise<ResultadoUnion> {
  let paciente: Paciente | null = null;

  if (r.dpi_cui) {
    const { data, error } = await sb.from("paciente").select("*").eq("dpi_cui", r.dpi_cui).maybeSingle();
    if (error) throw error;
    paciente = data as Paciente | null;
  }
  if (!paciente && eleccion?.pacienteId) {
    const { data, error } = await sb.from("paciente").select("*").eq("id", eleccion.pacienteId).single();
    if (error) throw error;
    paciente = data as Paciente;
  }

  let pacienteNuevo = false;
  let alergiasNuevas: string[] = [];
  if (paciente) {
    const cambios = fusionarPaciente(paciente, r);
    if (cambios.alergias) alergiasNuevas = cambios.alergias.filter((a) => !paciente!.alergias.some((b) => clave(b) === clave(a)));
    if (Object.keys(cambios).length) {
      const { data, error } = await sb.from("paciente").update(cambios).eq("id", paciente.id).select("*").single();
      if (error) throw error;
      paciente = data as Paciente;
    }
  } else {
    const { data, error } = await sb.from("paciente").insert(nuevoPaciente(r)).select("*").single();
    if (error) throw error;
    paciente = data as Paciente;
    pacienteNuevo = true;
    alergiasNuevas = paciente.alergias;
  }

  const { data: mismas } = await sb.from("consulta").select("paciente_id, fecha, motivo, diagnostico").eq("paciente_id", paciente.id).eq("fecha", r.fecha);
  const huella = huellaConsulta({ paciente_id: paciente.id, fecha: r.fecha, motivo: r.motivo, diagnostico: r.diagnostico });
  if ((mismas ?? []).some((c) => huellaConsulta(c) === huella)) {
    return { paciente, pacienteNuevo, consultaId: null, duplicada: true, alergiasNuevas };
  }

  const { data: consulta, error } = await sb
    .from("consulta")
    .insert({
      paciente_id: paciente.id,
      centro_id: ctx.centroId,
      fecha: r.fecha,
      motivo: r.motivo || null,
      diagnostico: r.diagnostico || null,
      tratamiento: r.tratamiento || null,
      vacunas: fusionarListas([], r.vacunas),
      medicamentos: fusionarListas([], r.medicamentos),
      origen: ctx.origen,
      fuente_detalle: ctx.fuenteDetalle ?? null,
      archivo_original_url: ctx.archivos?.[0] ?? null,
      archivos_originales: ctx.archivos ?? [],
      confirmado_por: ctx.usuarioId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { paciente, pacienteNuevo, consultaId: consulta.id, duplicada: false, alergiasNuevas };
}

export interface ResumenImportacion {
  filas: number;
  consultasNuevas: number;
  duplicadas: number;
  pacientesNuevos: number;
  pacientesActualizados: number;
  pacientes: Array<{ id: string; nombre: string; dpi_cui: string | null; consultas: number; nuevo: boolean }>;
}

/**
 * Importa muchas filas de un sistema antiguo con pocas consultas a la base
 * (precarga por DPI y por fecha de nacimiento, inserciones por lotes).
 */
export async function importarLote(
  sb: SB,
  filas: Array<{ registro: RegistroClinico; original: Record<string, unknown> }>,
  ctx: ContextoUnion & { archivo: string }
): Promise<ResumenImportacion> {
  const dpis = [...new Set(filas.map((f) => f.registro.dpi_cui).filter(Boolean))];
  const fechasNac = [...new Set(filas.filter((f) => !f.registro.dpi_cui).map((f) => f.registro.fecha_nacimiento).filter(Boolean))];

  const existentes = new Map<string, Paciente>();
  for (let i = 0; i < dpis.length; i += 150) {
    const { data, error } = await sb.from("paciente").select("*").in("dpi_cui", dpis.slice(i, i + 150));
    if (error) throw error;
    for (const p of data as Paciente[]) existentes.set(p.id, p);
  }
  for (let i = 0; i < fechasNac.length; i += 150) {
    const { data, error } = await sb.from("paciente").select("*").in("fecha_nacimiento", fechasNac.slice(i, i + 150));
    if (error) throw error;
    for (const p of data as Paciente[]) existentes.set(p.id, p);
  }
  const porDpi = new Map([...existentes.values()].filter((p) => p.dpi_cui).map((p) => [p.dpi_cui!, p]));

  // Agrupar filas por persona
  const grupos = new Map<string, { pacienteId?: string; filas: typeof filas }>();
  const resolver = (r: RegistroClinico): string => {
    if (r.dpi_cui) return porDpi.get(r.dpi_cui)?.id ?? `dpi:${r.dpi_cui}`;
    // sin DPI: misma fecha de nacimiento y nombre casi idéntico → misma persona
    const mejor = [...existentes.values()]
      .map((p) => ({ p, s: puntuarCoincidencia(p, r.nombre, r.fecha_nacimiento) }))
      .filter((x) => x.s >= 85)
      .sort((a, b) => b.s - a.s)[0];
    if (mejor) return mejor.p.id;
    // ¿coincide con otra fila nueva con DPI del mismo archivo?
    for (const [k, g] of grupos) {
      const r0 = g.filas[0].registro;
      if (k.startsWith("dpi:") && puntuarCoincidencia({ nombre: r0.nombre, fecha_nacimiento: r0.fecha_nacimiento || null }, r.nombre, r.fecha_nacimiento) >= 85) return k;
    }
    return `nom:${clave(r.nombre)}|${r.fecha_nacimiento}`;
  };
  // primero las filas con DPI, para que las filas sin DPI puedan unirse a ellas
  const ordenadas = [...filas].sort((a, b) => Number(!a.registro.dpi_cui) - Number(!b.registro.dpi_cui));
  for (const f of ordenadas) {
    const k = resolver(f.registro);
    const g = grupos.get(k) ?? { pacienteId: existentes.has(k) ? k : undefined, filas: [] };
    g.filas.push(f);
    grupos.set(k, g);
  }

  // Crear pacientes nuevos (fusionando lo que dicen todas sus filas)
  const nuevos: Array<{ k: string; datos: ReturnType<typeof nuevoPaciente> }> = [];
  for (const [k, g] of grupos) {
    if (g.pacienteId) continue;
    const base = g.filas.reduce<RegistroClinico>((acc, { registro: r }) => ({
      ...acc,
      dpi_cui: acc.dpi_cui || r.dpi_cui,
      fecha_nacimiento: acc.fecha_nacimiento || r.fecha_nacimiento,
      sexo: acc.sexo || r.sexo,
      comunidad: acc.comunidad || r.comunidad,
      alergias: fusionarListas(acc.alergias, r.alergias),
      condiciones_cronicas: fusionarListas(acc.condiciones_cronicas, r.condiciones_cronicas),
    }), { ...g.filas[0].registro });
    nuevos.push({ k, datos: nuevoPaciente(base) });
  }
  for (let i = 0; i < nuevos.length; i += 200) {
    const lote = nuevos.slice(i, i + 200);
    const { data, error } = await sb.from("paciente").insert(lote.map((n) => n.datos)).select("*");
    if (error) throw error;
    (data as Paciente[]).forEach((p, j) => {
      existentes.set(p.id, p);
      grupos.get(lote[j].k)!.pacienteId = p.id;
    });
  }

  // Actualizar pacientes existentes (solo si algo cambia)
  let pacientesActualizados = 0;
  const idsNuevos = new Set(nuevos.map((n) => grupos.get(n.k)!.pacienteId!));
  for (const g of grupos.values()) {
    const id = g.pacienteId!;
    if (idsNuevos.has(id)) continue;
    let p = existentes.get(id)!;
    let cambios: Partial<Paciente> = {};
    for (const { registro } of g.filas) {
      const c = fusionarPaciente({ ...p, ...cambios } as Paciente, registro);
      cambios = { ...cambios, ...c };
    }
    if (Object.keys(cambios).length) {
      const { data, error } = await sb.from("paciente").update(cambios).eq("id", id).select("*").single();
      if (error) throw error;
      p = data as Paciente;
      existentes.set(id, p);
      pacientesActualizados++;
    }
  }

  // Consultas: sin duplicar lo que ya existe ni lo repetido en el mismo archivo
  const ids = [...new Set([...grupos.values()].map((g) => g.pacienteId!))];
  const huellas = new Set<string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await sb.from("consulta").select("paciente_id, fecha, motivo, diagnostico").in("paciente_id", ids.slice(i, i + 150));
    if (error) throw error;
    for (const c of data) huellas.add(huellaConsulta(c));
  }

  const inserts: Record<string, unknown>[] = [];
  const conteo = new Map<string, number>();
  let duplicadas = 0;
  for (const g of grupos.values()) {
    for (const { registro: r, original } of g.filas) {
      const h = huellaConsulta({ paciente_id: g.pacienteId!, fecha: r.fecha, motivo: r.motivo, diagnostico: r.diagnostico });
      if (huellas.has(h)) {
        duplicadas++;
        continue;
      }
      huellas.add(h);
      conteo.set(g.pacienteId!, (conteo.get(g.pacienteId!) ?? 0) + 1);
      inserts.push({
        paciente_id: g.pacienteId,
        centro_id: ctx.centroId,
        fecha: r.fecha,
        motivo: r.motivo || null,
        diagnostico: r.diagnostico || null,
        tratamiento: r.tratamiento || null,
        vacunas: r.vacunas,
        medicamentos: r.medicamentos,
        origen: "sistema_antiguo",
        fuente_detalle: ctx.fuenteDetalle ?? null,
        archivo_original_url: ctx.archivo,
        archivos_originales: [ctx.archivo],
        fila_original: Object.fromEntries(Object.entries(original).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "")])),
        confirmado_por: ctx.usuarioId,
      });
    }
  }
  for (let i = 0; i < inserts.length; i += 250) {
    const { error } = await sb.from("consulta").insert(inserts.slice(i, i + 250));
    if (error) throw error;
  }

  return {
    filas: filas.length,
    consultasNuevas: inserts.length,
    duplicadas,
    pacientesNuevos: nuevos.length,
    pacientesActualizados,
    pacientes: ids
      .map((id) => {
        const p = existentes.get(id)!;
        return { id, nombre: p.nombre, dpi_cui: p.dpi_cui, consultas: conteo.get(id) ?? 0, nuevo: idsNuevos.has(id) };
      })
      .sort((a, b) => b.consultas - a.consultas),
  };
}

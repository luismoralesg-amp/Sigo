"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  ArrowLeft, Database, FileSpreadsheet, Upload, Wand2, CalendarDays, CaseSensitive, Eraser, Link2, CircleAlert,
  Check, FolderCheck, House, ShieldCheck, Table2, Sparkles, LoaderCircle,
} from "lucide-react";
import { Boton } from "@/components/ui/button";
import { Insignia } from "@/components/ui/badge";
import { Tarjeta } from "@/components/ui/card";
import { CAMPOS, sugerirMapeo, filaARegistro, type CampoDestino } from "@/lib/mapeo";
import { esVacio, limpiarTexto, normalizarFecha } from "@/lib/limpieza";
import { similitudNombre } from "@/lib/union";
import { PACIENTES } from "@/datos/demo";
import { cn, formatearDPI, fechaCorta } from "@/lib/utils";

type Fila = Record<string, string>;
type Paso = "subir" | "mapear" | "importando" | "listo";

const ARCHIVO_EJEMPLO = "/ejemplos/registro_puesto_2015_2022.csv";

export function FlujoImportar() {
  const [paso, setPaso] = useState<Paso>("subir");
  const [archivo, setArchivo] = useState<{ nombre: string; tamaño: number } | null>(null);
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [mapeo, setMapeo] = useState<Record<string, CampoDestino | "">>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function leerArchivo(f: File) {
    setError(null);
    setCargando(true);
    try {
      let datos: Fila[] = [];
      let cols: string[] = [];
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        const libro = XLSX.read(await f.arrayBuffer(), { cellDates: false });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        datos = XLSX.utils.sheet_to_json<Fila>(hoja, { defval: "", raw: false });
        cols = Object.keys(datos[0] ?? {});
      } else if (/\.(csv|txt)$/i.test(f.name)) {
        const texto = (await f.text()).replace(/^﻿/, "");
        const r = Papa.parse<Fila>(texto, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
        datos = r.data;
        cols = r.meta.fields ?? [];
      } else {
        setError("Ese tipo de archivo no se puede leer todavía. Desde Access, expórtalo como Excel o CSV.");
        return;
      }
      if (!datos.length) {
        setError("El archivo está vacío o no tiene encabezados en la primera fila.");
        return;
      }
      setArchivo({ nombre: f.name, tamaño: f.size });
      setEncabezados(cols);
      setFilas(datos);
      setMapeo(sugerirMapeo(cols));
      setPaso("mapear");
      window.scrollTo({ top: 0 });
    } catch {
      setError("No pudimos abrir el archivo. Revisa que no esté dañado o protegido con contraseña.");
    } finally {
      setCargando(false);
    }
  }

  async function usarEjemplo() {
    setCargando(true);
    const r = await fetch(ARCHIVO_EJEMPLO);
    const b = await r.blob();
    await leerArchivo(new File([b], "registro_puesto_2015_2022.csv", { type: "text/csv" }));
  }

  const analisis = useMemo(() => analizar(filas, mapeo), [filas, mapeo]);

  return (
    <>
      {paso !== "listo" && paso !== "importando" && (
        <div className="mb-4">
          {paso === "subir" ? (
            <Link href="/puesto" className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 font-semibold text-tinta-suave hover:text-tinta">
              <ArrowLeft className="h-5 w-5" /> Inicio
            </Link>
          ) : (
            <button onClick={() => setPaso("subir")} className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 font-semibold text-tinta-suave hover:text-tinta">
              <ArrowLeft className="h-5 w-5" /> Elegir otro archivo
            </button>
          )}
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.div key={paso} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {paso === "subir" && <Subir onArchivo={leerArchivo} onEjemplo={usarEjemplo} error={error} cargando={cargando} />}
          {paso === "mapear" && archivo && (
            <Mapear
              archivo={archivo}
              encabezados={encabezados}
              filas={filas}
              mapeo={mapeo}
              setMapeo={setMapeo}
              analisis={analisis}
              onImportar={() => {
                setPaso("importando");
                window.scrollTo({ top: 0 });
              }}
            />
          )}
          {paso === "importando" && <Importando total={analisis.validas} onListo={() => setPaso("listo")} />}
          {paso === "listo" && <Listo analisis={analisis} archivo={archivo?.nombre ?? ""} />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

// ------------------------------------------------------------------ análisis

interface Analisis {
  total: number;
  validas: number;
  invalidas: number;
  pacientes: number;
  sinDpi: number;
  fechasConvertidas: number;
  mayusculas: number;
  vacias: number;
  rango: [string, string] | null;
  porPaciente: Array<{ nombre: string; dpi: string; consultas: number; existente: boolean }>;
}

function analizar(filas: Fila[], mapeo: Record<string, CampoDestino | "">): Analisis {
  const colsFecha = Object.entries(mapeo).filter(([, c]) => c === "fecha" || c === "fecha_nacimiento").map(([k]) => k);
  const colNombre = Object.entries(mapeo).find(([, c]) => c === "nombre")?.[0];
  const mapeadas = Object.entries(mapeo).filter(([, c]) => c).map(([k]) => k);

  let fechasConvertidas = 0, mayusculas = 0, vacias = 0, sinDpi = 0, invalidas = 0;
  const grupos: Array<{ dpi: string; nombre: string; fnac: string; n: number }> = [];
  const fechas: string[] = [];

  const limpias = filas.map((f) => filaARegistro(f, mapeo));
  limpias.forEach(({ registro: r, valida }, i) => {
    const f = filas[i];
    for (const c of colsFecha) {
      const crudo = limpiarTexto(f[c]);
      const iso = normalizarFecha(crudo);
      if (crudo && iso && crudo !== iso) fechasConvertidas++;
    }
    if (colNombre) {
      const n = limpiarTexto(f[colNombre]).replace(/[^A-Za-zÁÉÍÓÚÑ]/g, "");
      if (n && n === n.toUpperCase()) mayusculas++;
    }
    for (const c of mapeadas) if (esVacio(f[c])) vacias++;
    if (!valida) {
      invalidas++;
      return;
    }
    fechas.push(r.fecha);
    if (!r.dpi_cui) sinDpi++;
  });

  // agrupar por persona: primero DPI, luego nombre + fecha de nacimiento
  const ordenadas = limpias.filter((l) => l.valida).sort((a, b) => Number(!a.registro.dpi_cui) - Number(!b.registro.dpi_cui));
  for (const { registro: r } of ordenadas) {
    let g = r.dpi_cui ? grupos.find((x) => x.dpi === r.dpi_cui) : grupos.find((x) => (!r.fecha_nacimiento || !x.fnac || x.fnac === r.fecha_nacimiento) && similitudNombre(x.nombre, r.nombre) >= 0.66 && (!!x.fnac || !!r.fecha_nacimiento));
    if (!g) {
      g = { dpi: r.dpi_cui, nombre: r.nombre, fnac: r.fecha_nacimiento, n: 0 };
      grupos.push(g);
    }
    if (!g.fnac && r.fecha_nacimiento) g.fnac = r.fecha_nacimiento;
    if (r.nombre.length > g.nombre.length) g.nombre = r.nombre;
    g.n++;
  }
  fechas.sort();
  const porPaciente = grupos
    .map((g) => ({ nombre: g.nombre, dpi: g.dpi, consultas: g.n, existente: PACIENTES.some((p) => p.dpi_cui === g.dpi) }))
    .sort((a, b) => Number(b.existente) - Number(a.existente) || b.consultas - a.consultas);

  return {
    total: filas.length,
    validas: filas.length - invalidas,
    invalidas,
    pacientes: grupos.length,
    sinDpi,
    fechasConvertidas,
    mayusculas,
    vacias,
    rango: fechas.length ? [fechas[0], fechas[fechas.length - 1]] : null,
    porPaciente,
  };
}

// ------------------------------------------------------------------ pasos

function Subir({ onArchivo, onEjemplo, error, cargando }: { onArchivo: (f: File) => void; onEjemplo: () => void; error: string | null; cargando: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  return (
    <div className="mx-auto max-w-3xl">
      <p className="ceja">Paso 1 de 2 · Archivo</p>
      <h1 className="mt-4 text-[2rem] leading-tight sm:text-[2.3rem]">Importar sistema antiguo</h1>
      <p className="mt-2 text-tinta-suave">Sube el archivo tal como sale del sistema del puesto. No hace falta arreglarlo antes.</p>

      <input ref={input} id="archivo-sistema" type="file" accept=".csv,.txt,.xlsx,.xls" className="sr-only" onChange={(e) => e.target.files?.[0] && onArchivo(e.target.files[0])} />
      <label
        htmlFor="archivo-sistema"
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          if (e.dataTransfer.files[0]) onArchivo(e.dataTransfer.files[0]);
        }}
        className={cn(
          "papel-kraft group mt-6 flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-[22px] border-2 border-dashed p-6 text-center transition-colors focus-within:outline-3 focus-within:outline-primario",
          encima ? "border-primario bg-primario-suave" : "border-kraft-borde hover:border-primario/50"
        )}
      >
        <span className="grid h-20 w-20 place-items-center rounded-[18px] bg-superficie text-kraft-tinta shadow-calida ring-1 ring-kraft-borde transition-transform duration-200 group-hover:-translate-y-0.5">
          {cargando ? <LoaderCircle className="h-9 w-9 animate-spin" /> : <Upload className="h-9 w-9" strokeWidth={1.75} />}
        </span>
        <span className="mt-5 font-display text-[1.45rem] font-semibold text-tinta">{cargando ? "Abriendo archivo…" : "Elegir archivo"}</span>
        <span className="mt-1 text-kraft-tinta">Excel (.xlsx, .xls) o CSV · también puedes arrastrarlo aquí</span>
      </label>

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-[12px] bg-alerta-fondo px-4 py-3 text-alerta" role="alert">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /> {error}
        </p>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-[14px] border border-linea bg-superficie p-4 text-[0.92rem] text-tinta-suave">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primario" />
          <p>El sistema original no se toca ni se apaga. Solo leemos una copia del archivo.</p>
        </div>
        <div className="flex items-start gap-3 rounded-[14px] border border-linea bg-superficie p-4 text-[0.92rem] text-tinta-suave">
          <Database className="mt-0.5 h-5 w-5 shrink-0 text-kraft-tinta" />
          <p>¿Usan Access? Desde Access: Datos externos → Exportar → Excel.</p>
        </div>
      </div>

      <button onClick={onEjemplo} disabled={cargando} className="mt-4 flex min-h-11 items-center gap-2 rounded-[12px] px-2 text-left font-semibold text-primario hover:bg-primario-suave">
        <FileSpreadsheet className="h-5 w-5 shrink-0" /> Probar con el archivo de ejemplo (registro_puesto_2015_2022.csv)
      </button>
    </div>
  );
}

function Mapear({
  archivo, encabezados, filas, mapeo, setMapeo, analisis, onImportar,
}: {
  archivo: { nombre: string; tamaño: number };
  encabezados: string[];
  filas: Fila[];
  mapeo: Record<string, CampoDestino | "">;
  setMapeo: (m: Record<string, CampoDestino | "">) => void;
  analisis: Analisis;
  onImportar: () => void;
}) {
  const sugerido = useMemo(() => sugerirMapeo(encabezados), [encabezados]);
  const [vista, setVista] = useState<"original" | "limpio">("original");
  const muestra = filas.slice(0, 6);
  const faltaNombre = !Object.values(mapeo).includes("nombre");
  const faltaFecha = !Object.values(mapeo).includes("fecha");

  return (
    <div className="pb-32">
      <p className="ceja">Paso 2 de 2 · Mapear y limpiar</p>
      <h1 className="mt-4 text-[1.9rem] font-semibold leading-tight sm:text-[2.2rem]">Revisa cómo se va a leer</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Insignia tono="kraft"><FileSpreadsheet /> {archivo.nombre}</Insignia>
        <Insignia tono="neutro">{analisis.total} filas · {encabezados.length} columnas</Insignia>
        {analisis.rango && <Insignia tono="neutro">{analisis.rango[0].slice(0, 4)}–{analisis.rango[1].slice(0, 4)}</Insignia>}
      </div>

      {/* Resumen */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Tarjeta className="mt-6 overflow-hidden">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[16px] bg-primario-suave text-primario">
              <FolderCheck className="h-7 w-7" />
            </span>
            <p className="font-display text-[1.5rem] font-semibold leading-snug sm:text-[1.75rem]">
              <span className="num text-primario">{analisis.validas}</span> consultas de <span className="num text-primario">{analisis.pacientes}</span> pacientes listas para rescatar
            </p>
          </div>
          <ul className="grid gap-px border-t border-linea bg-linea sm:grid-cols-2">
            <Dato icono={<CalendarDays />} texto={`${analisis.fechasConvertidas} fechas pasadas a un solo formato`} />
            <Dato icono={<CaseSensitive />} texto={`${analisis.mayusculas} nombres en MAYÚSCULAS corregidos`} />
            <Dato icono={<Eraser />} texto={`${analisis.vacias} celdas vacías, “N/A” o “-” marcadas sin dato`} />
            <Dato icono={<Link2 />} texto={`${analisis.sinDpi} filas sin DPI se unen por nombre y fecha de nacimiento`} />
            {analisis.invalidas > 0 && <Dato icono={<CircleAlert />} alerta texto={`${analisis.invalidas} filas sin fecha legible quedan aparte para revisar`} />}
          </ul>
        </Tarjeta>
      </motion.div>

      {/* Vista previa original ↔ limpia */}
      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[1.3rem] font-semibold">Primeras filas</h2>
          <div className="inline-flex rounded-[12px] border border-linea bg-superficie p-1" role="tablist">
            {(["original", "limpio"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                className={cn("flex min-h-10 items-center gap-1.5 rounded-[9px] px-3.5 text-[0.92rem] font-semibold transition-colors", vista === v ? (v === "original" ? "bg-kraft text-kraft-tinta" : "bg-primario text-white") : "text-tinta-suave hover:text-tinta")}
              >
                {v === "original" ? <Table2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {v === "original" ? "Como viene" : "Limpio"}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {vista === "original" ? (
            <motion.div key="o" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, filter: "blur(2px)" }} transition={{ duration: 0.18 }} className="papel-kraft mt-3 overflow-hidden rounded-[14px]">
              <div className="flex items-center gap-2 border-b border-kraft-borde/70 bg-kraft/70 px-3 py-2 font-mono text-[0.75rem] font-semibold text-kraft-tinta">
                <Database className="h-3.5 w-3.5" /> {archivo.nombre}
              </div>
              <div className="overflow-x-auto">
                <table className="tabla-vieja w-max min-w-full text-[0.8rem] text-[#3d3324]">
                  <thead>
                    <tr>
                      {encabezados.map((h) => (
                        <th key={h} className="whitespace-nowrap border-b border-r border-kraft-borde/70 px-3 py-2 text-left font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {muestra.map((f, i) => (
                      <tr key={i}>
                        {encabezados.map((h) => (
                          <td key={h} className={cn("h-9 whitespace-nowrap border-r border-kraft-borde/50 px-3", esVacio(f[h]) && "text-[#a08a63]")}>{f[h] || "·"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          ) : (
            <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="mt-3 space-y-2">
              {muestra.map((f, i) => {
                const { registro: r, valida, problemas } = filaARegistro(f, mapeo);
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: -10, backgroundColor: "#f4ecdc" }} animate={{ opacity: 1, x: 0, backgroundColor: "#ffffff" }} transition={{ delay: i * 0.07, duration: 0.3 }} className="grid gap-x-4 gap-y-1 rounded-[14px] border border-linea p-3.5 shadow-calida sm:grid-cols-[1.3fr_1fr_1.3fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.nombre || "Sin nombre"}</p>
                      <p className="num font-mono text-[0.8rem] text-tinta-tenue">{r.dpi_cui ? formatearDPI(r.dpi_cui) : "Sin DPI"}{r.fecha_nacimiento ? ` · nac. ${fechaCorta(r.fecha_nacimiento)}` : ""}</p>
                    </div>
                    <p className="num text-[0.9rem] text-tinta-suave">{r.fecha ? fechaCorta(r.fecha) : "Fecha ilegible"}</p>
                    <p className="min-w-0 truncate text-[0.9rem]">{[r.diagnostico || r.motivo, r.medicamentos.join(", ")].filter(Boolean).join(" · ") || "—"}</p>
                    <span className="sm:justify-self-end">{valida ? <Insignia tono="confirmado"><Check /> Lista</Insignia> : <Insignia tono="revisar"><CircleAlert /> {problemas[0]}</Insignia>}</span>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Mapeo de columnas */}
      <section className="mt-8">
        <h2 className="text-[1.3rem] font-semibold">¿Qué es cada columna?</h2>
        <p className="mt-1 text-tinta-suave">Ya sugerimos cada una. Cambia la que no esté bien.</p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {encabezados.map((h) => {
            const ejemplo = filas.map((f) => f[h]).find((v) => !esVacio(v)) ?? "";
            const valor = mapeo[h] ?? "";
            const esSugerencia = valor && valor === sugerido[h];
            return (
              <div key={h} className={cn("rounded-[14px] border bg-superficie p-3", valor ? "border-linea" : "border-dashed border-linea-fuerte")}>
                <div className="flex items-center gap-2">
                  <span className="papel-kraft-fuerte truncate rounded-[6px] px-2 py-0.5 font-mono text-[0.8rem] font-semibold text-kraft-tinta">{h}</span>
                  {esSugerencia && <Insignia tono="primario" className="ml-auto shrink-0"><Wand2 /> Sugerido</Insignia>}
                </div>
                <p className="mt-1 truncate font-mono text-[0.78rem] text-tinta-tenue">ej.: {ejemplo || "—"}</p>
                <label className="sr-only" htmlFor={`col-${h}`}>Campo para la columna {h}</label>
                <select
                  id={`col-${h}`}
                  value={valor}
                  onChange={(e) => setMapeo({ ...mapeo, [h]: e.target.value as CampoDestino | "" })}
                  className="mt-2 min-h-11 w-full rounded-[10px] border border-linea-fuerte bg-superficie px-3 font-semibold text-tinta focus-visible:border-primario"
                >
                  <option value="">No importar esta columna</option>
                  <optgroup label="Paciente">
                    {CAMPOS.filter((c) => c.grupo === "paciente").map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
                  </optgroup>
                  <optgroup label="Consulta">
                    {CAMPOS.filter((c) => c.grupo === "consulta").map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
                  </optgroup>
                </select>
              </div>
            );
          })}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-superficie/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <p className={cn("text-[0.95rem] font-semibold", faltaNombre || faltaFecha ? "text-alerta" : "text-tinta-suave")}>
            {faltaNombre ? "Elige qué columna tiene el nombre." : faltaFecha ? "Elige qué columna tiene la fecha de consulta." : "Nada se guarda hasta que confirmes."}
          </p>
          <Boton tamaño="xl" className="w-full sm:ml-auto sm:w-auto" disabled={faltaNombre || faltaFecha || !analisis.validas} onClick={onImportar}>
            <Check strokeWidth={3} /> Confirmar y rescatar {analisis.validas}
          </Boton>
        </div>
      </div>
    </div>
  );
}

function Dato({ icono, texto, alerta }: { icono: React.ReactNode; texto: string; alerta?: boolean }) {
  return (
    <li className={cn("flex items-center gap-3 bg-superficie px-5 py-3.5 text-[0.92rem]", alerta ? "bg-revisar-fondo text-revisar-tinta sm:col-span-2" : "text-tinta-suave")}>
      <span className={cn("[&_svg]:h-5 [&_svg]:w-5", alerta ? "text-revisar-tinta" : "text-primario")}>{icono}</span>
      {texto}
    </li>
  );
}

function Importando({ total, onListo }: { total: number; onListo: () => void }) {
  const [n, setN] = useState(0);
  const listo = useRef(onListo);
  useEffect(() => {
    let vivo = true;
    const inicio = performance.now();
    const dur = 2600;
    const tick = () => {
      const p = Math.min(1, (performance.now() - inicio) / dur);
      if (!vivo) return;
      setN(Math.round(total * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
      else setTimeout(() => vivo && listo.current(), 450);
    };
    requestAnimationFrame(tick);
    return () => {
      vivo = false;
    };
  }, [total]);
  const pct = total ? (n / total) * 100 : 0;
  return (
    <div className="mx-auto max-w-lg pt-10 text-center" role="status" aria-live="polite">
      <div className="relative mx-auto h-28 w-28">
        <motion.div animate={{ rotate: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 1.4 }} className="papel-kraft absolute inset-0 grid place-items-center rounded-[18px]">
          <Database className="h-11 w-11 text-kraft-tinta" strokeWidth={1.5} />
        </motion.div>
      </div>
      <h1 className="mt-8 text-[1.9rem] font-semibold">Rescatando consultas…</h1>
      <p className="num mt-2 text-tinta-suave">{n} de {total}</p>
      <div className="mx-auto mt-5 h-3 max-w-sm overflow-hidden rounded-full bg-kraft">
        <div className="h-full rounded-full bg-primario transition-[width] duration-100" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-4 text-[0.9rem] text-tinta-tenue">Uniendo por DPI y sin duplicar consultas que ya existían.</p>
    </div>
  );
}

function Listo({ analisis, archivo }: { analisis: Analisis; archivo: string }) {
  const existentes = analisis.porPaciente.filter((p) => p.existente);
  const nuevos = analisis.pacientes - existentes.length;
  return (
    <div className="mx-auto max-w-2xl pt-4 sm:pt-8">
      <motion.span initial={{ scale: 0 }} animate={{ scale: [0, 1.12, 1] }} transition={{ duration: 0.35 }} className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-confirmado text-white shadow-calida-lg">
        <Check className="h-8 w-8" strokeWidth={3} />
      </motion.span>
      <h1 className="mt-6 text-center text-[2rem] font-semibold leading-tight">{analisis.validas} consultas rescatadas</h1>
      <p className="mt-2 text-center text-tinta-suave">
        {existentes.length} expedientes ya existentes se completaron y {nuevos} pacientes tienen expediente nuevo.
      </p>

      <Tarjeta className="mt-8 divide-y divide-linea">
        {analisis.porPaciente.slice(0, 6).map((p, i) => (
          <motion.div key={p.nombre + i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06 }} className="flex items-center gap-3 p-4">
            <span className="papel-kraft grid h-11 w-11 shrink-0 place-items-center rounded-[10px] font-display text-[1rem] font-semibold text-kraft-tinta">+{p.consultas}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.nombre}</p>
              <p className="num truncate font-mono text-[0.8rem] text-tinta-tenue">{p.dpi ? formatearDPI(p.dpi) : "Unido por nombre y fecha de nacimiento"}</p>
            </div>
            {p.existente ? <Insignia tono="primario">Expediente completado</Insignia> : <Insignia tono="neutro">Nuevo</Insignia>}
          </motion.div>
        ))}
      </Tarjeta>

      <div className="mt-6 flex items-start gap-3 rounded-[14px] border border-linea bg-superficie p-4 text-[0.92rem] text-tinta-suave">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primario" />
        <p>El archivo original <span className="font-mono text-[0.85rem]">{archivo}</span> quedó guardado junto a cada consulta. El sistema del puesto sigue funcionando igual.</p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Boton tamaño="lg" asChild>
          <Link href="/puesto"><House /> Volver al inicio</Link>
        </Boton>
        <Boton tamaño="lg" variante="secundario" asChild>
          <Link href="/puesto/digitalizar">Digitalizar una ficha</Link>
        </Boton>
      </div>
    </div>
  );
}

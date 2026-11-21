"use client";
/**
 * /puesto/importar · enfermera. Subir Excel, CSV o Access; ver y ajustar qué columna va a qué campo;
 * confirmar; lista de fichas creadas para revisar.
 * Endpoints: POST /importar, POST /importar/{id}/confirmar.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Database, FileSpreadsheet, LoaderCircle, TriangleAlert, Upload } from "lucide-react";
import type { Importacion } from "@/lib/types";
import { Shell } from "@/components/shell";
import { Boton } from "@/components/ui/button";
import { MensajeError } from "@/components/estado";
import { api, type ResultadoImportacion } from "@/lib/api/cliente";
import { aErrorApi } from "@/lib/api/errores";
import { cn, mostrarIdentificador } from "@/lib/utils";

/** Campos destino del mapeo. Los de consulta llevan el prefijo "consultas.", como en el ejemplo del contrato. */
const CAMPOS: Array<{ id: string; etiqueta: string; grupo: string }> = [
  { id: "dpi", etiqueta: "DPI", grupo: "Paciente" },
  { id: "nombre", etiqueta: "Nombre", grupo: "Paciente" },
  { id: "fecha_nacimiento", etiqueta: "Fecha de nacimiento", grupo: "Paciente" },
  { id: "sexo", etiqueta: "Sexo", grupo: "Paciente" },
  { id: "comunidad", etiqueta: "Comunidad", grupo: "Paciente" },
  { id: "alergias", etiqueta: "Alergias", grupo: "Paciente" },
  { id: "condiciones_cronicas", etiqueta: "Condiciones crónicas", grupo: "Paciente" },
  { id: "consultas.fecha", etiqueta: "Fecha de la consulta", grupo: "Consulta" },
  { id: "consultas.motivo", etiqueta: "Motivo", grupo: "Consulta" },
  { id: "consultas.diagnostico", etiqueta: "Diagnóstico", grupo: "Consulta" },
  { id: "consultas.tratamiento", etiqueta: "Tratamiento", grupo: "Consulta" },
  { id: "consultas.vacunas", etiqueta: "Vacunas", grupo: "Consulta" },
];
const etiquetaDe = (id: string | null) => CAMPOS.find((c) => c.id === id)?.etiqueta ?? "Se ignora";

type Paso = { tipo: "subir" } | { tipo: "mapear"; imp: Importacion } | { tipo: "listo"; imp: Importacion; r: ResultadoImportacion };

export default function PaginaImportar() {
  const [paso, setPaso] = useState<Paso>({ tipo: "subir" });
  return (
    <Shell ancho="amplio">
      {paso.tipo === "subir" && <Subir onImportacion={(imp) => setPaso({ tipo: "mapear", imp })} />}
      {paso.tipo === "mapear" && <Mapear imp={paso.imp} onVolver={() => setPaso({ tipo: "subir" })} onListo={(r) => setPaso({ tipo: "listo", imp: paso.imp, r })} />}
      {paso.tipo === "listo" && <Listo imp={paso.imp} r={paso.r} onOtro={() => setPaso({ tipo: "subir" })} />}
    </Shell>
  );
}

function Subir({ onImportacion }: { onImportacion: (i: Importacion) => void }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    setSubiendo(true);
    setError(null);
    try {
      onImportacion(await api.importar(archivo));
    } catch (e) {
      const ea = aErrorApi(e);
      setError(ea.codigo === "archivo_muy_grande" ? "El archivo pasa de 20 MB. Divide el archivo y súbelo por partes." : ea.mensaje);
      setSubiendo(false);
    }
  }

  async function usarEjemplo() {
    setSubiendo(true);
    try {
      const r = await fetch("/ejemplos/registro_puesto_2015_2022.csv");
      await subir(new File([await r.blob()], "registro_puesto_2015_2022.csv", { type: "text/csv" }));
    } catch {
      setError("No se pudo cargar el archivo de ejemplo.");
      setSubiendo(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[2rem] leading-tight text-primario sm:text-[2.4rem]">Importar un archivo viejo</h1>
      <p className="mt-2 text-tinta-suave">Sube el Excel, CSV o Access tal como está. El archivo original no se toca: Sigo lo lee, tú indicas qué columna es cada dato, y cada paciente queda como una ficha para revisar.</p>

      <label
        htmlFor="archivo"
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          void subir(e.dataTransfer.files[0]);
        }}
        className={cn(
          "papel-kraft mt-6 flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-[22px] border-2 border-dashed p-6 text-center transition-colors focus-within:outline-3 focus-within:outline-primario",
          arrastrando ? "!border-primario" : "!border-kraft-borde hover:!border-primario/50"
        )}
      >
        <input id="archivo" type="file" accept=".xlsx,.xls,.csv,.accdb,.mdb" className="sr-only" onChange={(e) => void subir(e.target.files?.[0])} disabled={subiendo} />
        <span className="grid h-16 w-16 place-items-center rounded-full bg-primario text-white">
          {subiendo ? <LoaderCircle className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8" strokeWidth={1.75} />}
        </span>
        <span className="mt-4 font-display text-[1.35rem] font-semibold text-tinta">{subiendo ? "Leyendo el archivo…" : "Elegir archivo"}</span>
        <span className="mt-1 text-kraft-tinta">.xlsx, .csv o .accdb, hasta 20 MB</span>
      </label>
      {error && <MensajeError className="mt-4">{error}</MensajeError>}

      <button onClick={usarEjemplo} disabled={subiendo} className="-ml-2 mt-4 inline-flex min-h-11 items-center gap-2 rounded-[10px] px-2 font-semibold text-primario hover:bg-primario-suave disabled:opacity-50">
        <FileSpreadsheet className="h-5 w-5" /> Probar con el registro de ejemplo (CSV)
      </button>
    </div>
  );
}

function Mapear({ imp, onVolver, onListo }: { imp: Importacion; onVolver: () => void; onListo: (r: ResultadoImportacion) => void }) {
  const [mapeo, setMapeo] = useState<Record<string, string | null>>(() => ({ ...imp.mapeo_sugerido }));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usados = Object.values(mapeo).filter(Boolean) as string[];
  const faltan = ["dpi", "nombre"].filter((c) => !usados.includes(c));

  function elegir(col: string, campo: string | null) {
    // Cada campo va a una sola columna: si ya estaba en otra, esa pasa a "se ignora".
    const nuevo = Object.fromEntries(Object.entries(mapeo).map(([k, v]) => [k, campo && v === campo ? null : v]));
    nuevo[col] = campo;
    setMapeo(nuevo);
  }

  async function confirmar() {
    if (faltan.length) {
      setError(`Indica qué columna trae ${faltan.map((f) => (f === "dpi" ? "el DPI" : "el nombre")).join(" y ")}.`);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      onListo(await api.confirmarImportacion(imp.id, mapeo));
    } catch (e) {
      setError(aErrorApi(e).mensaje);
      setEnviando(false);
    }
  }

  return (
    <div className="pb-28">
      <h1 className="text-[1.9rem] leading-tight text-primario sm:text-[2.2rem]">¿Qué columna es cada dato?</h1>
      <p className="mt-2 text-tinta-suave">
        <span className="font-semibold text-tinta">{imp.archivo}</span>, {imp.filas.toLocaleString("es-GT")} filas. Sigo sugirió el mapeo; ajústalo donde no cuadre. Las columnas que se ignoran quedan solo en el original.
      </p>

      <div className="mt-6 overflow-x-auto rounded-[16px] border border-linea bg-superficie shadow-calida">
        <table className="w-full min-w-[640px] border-collapse text-left text-[0.92rem]">
          <thead>
            <tr className="border-b border-linea bg-papel/60">
              <th scope="col" className="px-4 py-3 font-semibold text-tinta-suave">Columna en el archivo</th>
              <th scope="col" className="px-4 py-3 font-semibold text-tinta-suave">Va a</th>
              <th scope="col" className="px-4 py-3 font-semibold text-tinta-suave">Primeras filas</th>
            </tr>
          </thead>
          <tbody>
            {imp.columnas.map((col) => {
              const campo = mapeo[col] ?? null;
              return (
                <tr key={col} className="border-b border-linea last:border-0">
                  <th scope="row" className="tabla-vieja whitespace-nowrap px-4 py-2.5 font-mono text-[0.85rem] font-semibold text-kraft-tinta">
                    {col}
                  </th>
                  <td className="px-4 py-2.5">
                    <label className="sr-only" htmlFor={`m-${col}`}>
                      Campo para la columna {col}
                    </label>
                    <select
                      id={`m-${col}`}
                      value={campo ?? ""}
                      onChange={(e) => elegir(col, e.target.value || null)}
                      className={cn(
                        "min-h-11 w-full min-w-[190px] rounded-[10px] border px-2.5 font-semibold",
                        campo ? "border-primario/40 bg-primario-suave/50 text-primario-tinta" : "border-linea-fuerte bg-superficie text-tinta-tenue"
                      )}
                    >
                      <option value="">Se ignora</option>
                      {["Paciente", "Consulta"].map((g) => (
                        <optgroup key={g} label={g}>
                          {CAMPOS.filter((c) => c.grupo === g).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.etiqueta}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td className="max-w-[340px] truncate px-4 py-2.5 text-tinta-suave" title={imp.muestra.map((f) => f[col]).join(" · ")}>
                    {imp.muestra
                      .slice(0, 3)
                      .map((f) => f[col])
                      .filter(Boolean)
                      .join(", ") || <span className="text-tinta-tenue">vacía</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="mt-5 rounded-[14px] border border-linea bg-superficie">
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-semibold">
          <Database className="h-5 w-5 text-kraft-tinta" /> Ver las primeras {imp.muestra.length} filas tal cual
        </summary>
        <div className="overflow-x-auto border-t border-linea">
          <table className="tabla-vieja w-full text-[0.82rem]">
            <thead>
              <tr>
                {imp.columnas.map((c) => (
                  <th key={c} scope="col" className="whitespace-nowrap px-3 py-2 text-left font-semibold text-kraft-tinta">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {imp.muestra.map((f, i) => (
                <tr key={i}>
                  {imp.columnas.map((c) => (
                    <td key={c} className="whitespace-nowrap px-3 py-2">
                      {f[c]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {error && <MensajeError className="mt-4">{error}</MensajeError>}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-superficie/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3">
          <p className="hidden flex-1 text-tinta-suave sm:block">
            {usados.length} de {imp.columnas.length} columnas mapeadas{faltan.length ? `. Falta ${faltan.map(etiquetaDe).join(" y ")}.` : "."}
          </p>
          <Boton variante="secundario" tamaño="lg" onClick={onVolver} disabled={enviando}>
            Otro archivo
          </Boton>
          <Boton tamaño="lg" onClick={confirmar} disabled={enviando}>
            {enviando && <LoaderCircle className="animate-spin" />} Crear fichas
          </Boton>
        </div>
      </div>
    </div>
  );
}

function Listo({ imp, r, onOtro }: { imp: Importacion; r: ResultadoImportacion; onOtro: () => void }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[1.9rem] leading-tight text-primario sm:text-[2.2rem]">
        {r.fichas.length} {r.fichas.length === 1 ? "ficha lista" : "fichas listas"} para revisar
      </h1>
      <p className="mt-2 text-tinta-suave">
        De {imp.archivo}. Cada una se revisa y se confirma igual que una foto: nada entra al expediente sin tu confirmación.
      </p>

      {r.filas_con_error.length > 0 && (
        <details className="mt-5 rounded-[14px] border border-revisar/60 bg-revisar-fondo text-revisar-tinta" open={r.filas_con_error.length <= 5}>
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-semibold">
            <TriangleAlert className="h-5 w-5" /> {r.filas_con_error.length} {r.filas_con_error.length === 1 ? "fila no se pudo importar" : "filas no se pudieron importar"}
          </summary>
          <ul className="max-h-60 overflow-y-auto border-t border-revisar/40 px-4 py-2 text-[0.92rem]">
            {r.filas_con_error.map((f) => (
              <li key={f.fila} className="py-1">
                Fila <span className="num font-semibold">{f.fila}</span>: {f.motivo}
              </li>
            ))}
          </ul>
        </details>
      )}

      {r.fichas.length > 0 ? (
        <ul className="mt-5 divide-y divide-linea overflow-hidden rounded-[16px] border border-linea bg-superficie shadow-calida">
          {r.fichas.map((f) => (
            <li key={f.id}>
              <Link href={`/puesto/fichas/${encodeURIComponent(f.id)}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-papel">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{f.nombre}</span>
                  <span className="num block font-mono text-[0.85rem] text-tinta-tenue">{mostrarIdentificador(f.dpi)}</span>
                </span>
                <span className="shrink-0 text-[0.9rem] font-semibold text-primario">Revisar</span>
                <ArrowRight className="h-5 w-5 shrink-0 text-primario" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-[14px] border border-linea bg-superficie p-4 text-tinta-suave">No se creó ninguna ficha. Revisa que la columna del DPI esté bien mapeada.</p>
      )}

      <Boton variante="secundario" className="mt-6" onClick={onOtro}>
        Importar otro archivo
      </Boton>
    </div>
  );
}

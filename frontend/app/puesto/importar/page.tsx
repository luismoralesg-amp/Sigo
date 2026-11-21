"use client";
/**
 * /puesto/importar · enfermera. Subir Excel, CSV o Access; ver el resultado fila por fila (creado, actualizado
 * o error); abrir las fichas creadas para revisarlas y confirmarlas.
 * Endpoints: POST /importaciones (un solo paso), GET /fichas?estado=lista&importacion_id=.
 */
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import type { Ficha, ResultadoImportacion } from "@/lib/types";
import { Shell } from "@/components/shell";
import { Boton, BarraAccion } from "@/components/ui/button";
import { Cargando, ErrorPantalla, MensajeError } from "@/components/estado";
import { api } from "@/lib/api/cliente";
import { aErrorApi } from "@/lib/api/errores";
import { useDatos } from "@/lib/api/usar";
import { cn, dpiParcial, edadTexto, mostrarIdentificador } from "@/lib/utils";

export default function PaginaImportar() {
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  return (
    <Shell ancho="amplio">
      {resultado ? <Resultado r={resultado} onOtro={() => setResultado(null)} /> : <Subir onResultado={setResultado} />}
    </Shell>
  );
}

const MENSAJES: Partial<Record<string, string>> = {
  formato_no_soportado: "Sube un Excel (.xlsx), CSV o Access (.accdb o .mdb).",
  archivo_muy_grande: "El archivo pasa de 20 MB. Divide el archivo y súbelo por partes.",
  // fetch lanza en CORS o sin red. El cliente lo traduce a sin_senal; aquí se dice en voz alta.
  sin_senal: "No se pudo enviar el archivo al servidor. Revisa la conexión e intenta de nuevo.",
};

function Subir({ onResultado }: { onResultado: (r: ResultadoImportacion) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [accion, setAccion] = useState<"ejemplo" | "archivo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const puedeImportar = Boolean(archivo) && !subiendo;

  async function subir(a: File | null, desde: "ejemplo" | "archivo") {
    if (!a) {
      setError("Elige un archivo primero.");
      setSubiendo(false);
      setAccion(null);
      return;
    }
    setAccion(desde);
    setSubiendo(true);
    setError(null);
    try {
      onResultado(await api.importar(a));
    } catch (e) {
      const ea = aErrorApi(e);
      setError(MENSAJES[ea.codigo] ?? ea.mensaje);
      setSubiendo(false);
      setAccion(null);
    }
  }

  async function usarEjemplo() {
    if (subiendo) return;
    setAccion("ejemplo");
    setSubiendo(true);
    setError(null);
    let a: File;
    try {
      const r = await fetch("/ejemplos/registro_puesto_2015_2022.csv");
      const tipo = r.headers.get("content-type") ?? "";
      // Un 404 de Next devuelve HTML. Sin esta revisión se subía esa página y el clic parecía mudo.
      if (!r.ok || tipo.includes("text/html")) throw new Error("ejemplo");
      const blob = await r.blob();
      if (blob.size === 0) throw new Error("ejemplo");
      a = new File([blob], "registro_puesto_2015_2022.csv", { type: "text/csv" });
    } catch {
      setError("No se pudo cargar el archivo de ejemplo. Revisa la conexión e intenta de nuevo.");
      setSubiendo(false);
      setAccion(null);
      return;
    }
    setArchivo(a);
    await subir(a, "ejemplo");
  }

  const importandoEjemplo = subiendo && accion === "ejemplo";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="titulo">Importar un archivo viejo</h1>
      <p className="mt-1.5 text-tinta-suave">Excel, CSV o Access del sistema anterior, tal como está. El archivo original no se toca: cada paciente queda como una ficha para revisar.</p>

      <label htmlFor="archivo" className="tarjeta mt-6 flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 border-dashed p-6 text-center hover:border-primario focus-within:outline focus-within:outline-3 focus-within:outline-primario">
        <input
          id="archivo"
          type="file"
          accept=".xlsx,.csv,.accdb,.mdb"
          className="sr-only"
          onChange={(e) => {
            setArchivo(e.target.files?.[0] ?? null);
            setError(null);
          }}
          disabled={subiendo}
        />
        {archivo ? (
          <>
            <FileSpreadsheet className="h-8 w-8 text-primario" aria-hidden="true" />
            <span className="font-semibold">{archivo.name}</span>
            <span className="text-tinta-suave">Toca para elegir otro</span>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-primario" aria-hidden="true" />
            <span className="font-semibold">Elegir archivo</span>
            <span className="text-tinta-suave">.xlsx, .csv, .accdb o .mdb, hasta 20 MB</span>
          </>
        )}
      </label>
      {error && <MensajeError className="mt-3">{error}</MensajeError>}

      <button
        type="button"
        onClick={() => void usarEjemplo()}
        disabled={subiendo}
        aria-busy={importandoEjemplo}
        className="-ml-2 mt-3 inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-[10px] px-2 font-semibold text-primario underline-offset-4 transition-colors hover:bg-superficie hover:underline focus-visible:bg-superficie focus-visible:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:no-underline"
      >
        {importandoEjemplo ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />}
        {importandoEjemplo ? "Importando el ejemplo…" : "Probar con el registro de ejemplo"}
      </button>

      <BarraAccion>
        <p id="ayuda-importar" className="text-center text-[0.95rem] text-tinta-suave">
          {subiendo ? "Leyendo el archivo…" : archivo ? "El archivo está listo. Puedes importarlo." : "Elige un archivo para poder importarlo."}
        </p>
        {/* El botón deshabilitado no recibe el mouse (pointer-events: none). El marco sí, y muestra not-allowed. */}
        <div className={cn("w-full", puedeImportar ? "" : "cursor-not-allowed")}>
          <Boton tamaño="accion" onClick={() => void subir(archivo, "archivo")} disabled={!puedeImportar} aria-describedby="ayuda-importar">
            {subiendo ? <LoaderCircle className="animate-spin" /> : <Upload />} {subiendo ? "Leyendo el archivo…" : "Importar archivo"}
          </Boton>
        </div>
      </BarraAccion>
    </div>
  );
}

const ESTADO_FILA = {
  creado: { texto: "Creado", clase: "etiqueta-ok" },
  actualizado: { texto: "Actualizado", clase: "etiqueta-ok" },
  error: { texto: "Error", clase: "etiqueta-alerta" },
} as const;

function Resultado({ r, onOtro }: { r: ResultadoImportacion; onOtro: () => void }) {
  const fichas = useDatos(() => api.fichasPorRevisar(r.importacion_id), [r.importacion_id]);
  const [verFilas, setVerFilas] = useState<"todas" | "error">(r.con_errores ? "error" : "todas");
  const filas = verFilas === "error" ? r.filas.filter((f) => f.estado === "error") : r.filas;
  // DPI de cada paciente según el archivo, para que la revisión pueda compararlo con lo leído.
  const dpiDe = (pacienteId: string) => r.filas.find((f) => f.expediente_id === pacienteId)?.dpi ?? null;

  return (
    <>
      <h1 className="titulo">Resultado de la importación</h1>
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { t: "Filas", n: r.total_filas, c: "" },
          { t: "Creados", n: r.creados, c: "text-confirmado" },
          { t: "Actualizados", n: r.actualizados, c: "text-confirmado" },
          { t: "Con error", n: r.con_errores, c: r.con_errores ? "text-alerta" : "" },
        ].map((x) => (
          <div key={x.t} className="tarjeta p-4">
            <dt className="text-tinta-suave">{x.t}</dt>
            <dd className={cn("cifra mt-1 text-[1.75rem] font-semibold", x.c)}>{x.n}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="titulo-fichas">
          <h2 id="titulo-fichas" className="subtitulo">
            Fichas para revisar
          </h2>
          <p className="mt-1 text-tinta-suave">Nada entra al expediente hasta que la confirmes.</p>
          <div className="mt-3">
            {fichas.estado === "cargando" && <Cargando filas={2} />}
            {fichas.estado === "error" && <ErrorPantalla error={fichas.error} onReintentar={() => fichas.recargar()} />}
            {fichas.estado === "listo" &&
              (fichas.datos.fichas.length ? (
                <ul className="tarjeta divide-y divide-linea overflow-hidden">
                  {fichas.datos.fichas.map((f) => (
                    <FilaFicha key={f.id} f={f} dpi={dpiDe(f.paciente_id)} />
                  ))}
                </ul>
              ) : (
                <p className="tarjeta p-4 text-tinta-suave">No quedan fichas por revisar de esta importación.</p>
              ))}
          </div>
        </section>

        <section aria-labelledby="titulo-filas">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="titulo-filas" className="subtitulo">
              Fila por fila
            </h2>
            {r.con_errores > 0 && (
              <div className="flex rounded-[12px] border border-linea bg-superficie p-1" role="group" aria-label="Filtrar filas">
                {(["error", "todas"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVerFilas(v)}
                    aria-pressed={verFilas === v}
                    className={cn(
                      "min-h-12 cursor-pointer rounded-[9px] px-3 font-semibold transition-colors hover:bg-primario-suave focus-visible:bg-primario-suave",
                      verFilas === v ? "bg-primario text-white hover:bg-primario-hover focus-visible:bg-primario-hover" : "text-tinta-suave"
                    )}
                  >
                    {v === "error" ? `Con error (${r.con_errores})` : `Todas (${r.total_filas})`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul className="tarjeta mt-3 max-h-[60dvh] divide-y divide-linea overflow-y-auto">
            {filas.map((f) => (
              <li key={f.fila} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                <span className="cifra w-16 shrink-0 text-tinta-suave">Fila {f.fila}</span>
                <span className="min-w-0 flex-1">
                  <span className="cifra block truncate">{f.dpi ? mostrarIdentificador(f.dpi) : "Sin DPI"}</span>
                  {f.error && <span className="block text-[0.95rem] text-alerta">{f.error}</span>}
                </span>
                <span className={cn(ESTADO_FILA[f.estado].clase, "shrink-0")}>{ESTADO_FILA[f.estado].texto}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <BarraAccion>
        <Boton tamaño="accion" variante="secundario" onClick={onOtro}>
          Importar otro archivo
        </Boton>
      </BarraAccion>
    </>
  );
}

function FilaFicha({ f, dpi }: { f: Ficha; dpi: string | null }) {
  const p = f.extraccion?.paciente;
  const nombre = p?.nombre.valor ?? "Sin nombre";
  const edad = edadTexto(p?.fecha_nacimiento.valor);
  const consultas = f.extraccion?.consultas.length ?? 0;
  const href = `/puesto/fichas/${encodeURIComponent(f.id)}${dpi ? `?dpi=${encodeURIComponent(dpi)}` : ""}`;
  return (
    <li>
      <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-papel">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{nombre}</span>
          <span className="cifra block text-[0.95rem] text-tinta-suave">{[dpiParcial(dpi ?? p?.dpi.valor), edad].filter(Boolean).join(", ")}</span>
        </span>
        <span className="etiqueta-dudoso shrink-0">
          {consultas} {consultas === 1 ? "consulta" : "consultas"}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-tinta-suave" aria-hidden="true" />
      </Link>
    </li>
  );
}

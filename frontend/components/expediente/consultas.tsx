"use client";
/**
 * Línea de tiempo de consultas (versión vigente, de la más reciente a la más antigua).
 * Cada tarjeta muestra el original, el historial de versiones (GET /consultas/{id}/versiones)
 * y, para la enfermera, "Corregir" (POST /consultas/{id}/versiones). Corregir nunca borra.
 */
import { useState } from "react";
import { Building2, Hospital, History, Maximize2, Pencil, Syringe, FileText, LoaderCircle } from "lucide-react";
import type { Consulta, Version } from "@/lib/types";
import { api } from "@/lib/api/cliente";
import { aErrorApi, ErrorApi } from "@/lib/api/errores";
import { Boton } from "@/components/ui/button";
import { Entrada, Etiqueta, AreaTexto } from "@/components/ui/input";
import { Dialogo, DialogoContenido, DialogoDescripcion, DialogoTitulo } from "@/components/ui/dialog";
import { MensajeError } from "@/components/estado";
import { cn, fechaCorta, fechaHora } from "@/lib/utils";

export function LineaTiempo({
  consultas,
  versiones = true,
  corregible = false,
  onCorregida,
}: {
  consultas: Consulta[];
  versiones?: boolean;
  corregible?: boolean;
  onCorregida?: (c: Consulta) => void;
}) {
  let añoPrevio = "";
  return (
    <ol className="relative">
      <span className="absolute bottom-4 left-[7px] top-3 w-[2px] rounded-full bg-[linear-gradient(180deg,var(--primario)_0%,var(--linea-fuerte)_45%,var(--kraft-borde)_100%)]" aria-hidden="true" />
      {consultas.map((c) => {
        const año = c.fecha?.slice(0, 4) ?? "Sin fecha";
        const nuevoAño = año !== añoPrevio;
        añoPrevio = año;
        return (
          <li key={c.id} className="relative pl-8 sm:pl-10">
            {nuevoAño && (
              <p className="num relative -ml-8 mb-2.5 mt-1 flex items-center gap-3 font-display text-[1.1rem] font-semibold text-tinta-suave sm:-ml-10">
                <span className="h-4 w-4 rounded-full border-[3px] border-papel bg-kraft-borde" aria-hidden="true" />
                {año}
              </p>
            )}
            <div className="pb-4">
              <TarjetaConsulta c={c} versiones={versiones} corregible={corregible} onCorregida={onCorregida} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TarjetaConsulta({ c, versiones, corregible, onCorregida }: { c: Consulta; versiones: boolean; corregible: boolean; onCorregida?: (c: Consulta) => void }) {
  const [editando, setEditando] = useState(false);
  const [verOriginal, setVerOriginal] = useState(false);
  const [historial, setHistorial] = useState<{ estado: "cerrado" | "cargando" | "listo" | "error"; versiones: Version[]; error?: ErrorApi }>({ estado: "cerrado", versiones: [] });
  const IconoCentro = c.centro.tipo === "hospital" ? Hospital : Building2;

  async function alternarHistorial() {
    if (historial.estado === "listo" || historial.estado === "error") return setHistorial({ estado: "cerrado", versiones: [] });
    setHistorial({ estado: "cargando", versiones: [] });
    try {
      const r = await api.versionesConsulta(c.id);
      setHistorial({ estado: "listo", versiones: r.versiones });
    } catch (e) {
      setHistorial({ estado: "error", versiones: [], error: aErrorApi(e) });
    }
  }

  return (
    <article className="rounded-[16px] border border-linea bg-superficie p-4 shadow-calida sm:p-5">
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <time dateTime={c.fecha ?? undefined} className="num font-display text-[1.2rem] font-semibold">
              {c.fecha ? fechaCorta(c.fecha) : "Fecha no registrada"}
            </time>
            {c.version > 1 && <span className="text-[0.85rem] font-semibold text-kraft-tinta">Corregida, versión {c.version}</span>}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[0.9rem] text-tinta-tenue">
            <IconoCentro className="h-4 w-4 shrink-0" aria-hidden="true" /> {c.centro.nombre}
          </p>
        </div>
        <Miniatura url={c.original_url} onAbrir={() => setVerOriginal(true)} />
      </div>

      {editando ? (
        <FormularioCorreccion
          c={c}
          onCancelar={() => setEditando(false)}
          onGuardada={(nueva) => {
            setEditando(false);
            setHistorial({ estado: "cerrado", versiones: [] });
            onCorregida?.(nueva);
          }}
        />
      ) : (
        <>
          <dl className="mt-3 space-y-2 text-[0.98rem]">
            <Fila etiqueta="Motivo" valor={c.motivo} fuerte />
            <Fila etiqueta="Diagnóstico" valor={c.diagnostico} />
            <Fila etiqueta="Tratamiento" valor={c.tratamiento} />
          </dl>
          {c.vacunas.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Vacunas">
              {c.vacunas.map((v) => (
                <li key={v} className="inline-flex items-center gap-1 rounded-full bg-confirmado-fondo px-2.5 py-1 text-[0.85rem] font-semibold text-confirmado">
                  <Syringe className="h-3.5 w-3.5" aria-hidden="true" /> {v}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {!editando && (versiones || corregible) && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-linea pt-3">
          {corregible && (
            <Boton variante="fantasma" className="-ml-2" onClick={() => setEditando(true)}>
              <Pencil /> Corregir
            </Boton>
          )}
          {versiones && (
            <Boton variante="fantasma" className={corregible ? "" : "-ml-2"} onClick={alternarHistorial} aria-expanded={historial.estado !== "cerrado"}>
              {historial.estado === "cargando" ? <LoaderCircle className="animate-spin" /> : <History />}
              {historial.estado === "listo" ? "Ocultar versiones" : "Ver versiones"}
            </Boton>
          )}
        </div>
      )}

      {historial.estado === "error" && historial.error && (
        <MensajeError className="mt-2">{historial.error.mensaje}</MensajeError>
      )}
      {historial.estado === "listo" && <HistorialVersiones versiones={historial.versiones} />}

      <VisorOriginal url={c.original_url} titulo={`Original de la consulta del ${fechaCorta(c.fecha)}`} abierto={verOriginal} onCerrar={() => setVerOriginal(false)} />
    </article>
  );
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string | null; fuerte?: boolean }) {
  if (!valor) return null;
  return (
    <div className="grid gap-0.5 sm:grid-cols-[110px_1fr] sm:gap-3">
      <dt className="text-[0.88rem] font-semibold text-tinta-tenue sm:pt-0.5">{etiqueta}</dt>
      <dd className={cn(fuerte && "font-semibold")}>{valor}</dd>
    </div>
  );
}

function HistorialVersiones({ versiones }: { versiones: Version[] }) {
  return (
    <ol className="mt-3 space-y-2" aria-label="Versiones de esta consulta">
      {versiones.map((v) => (
        <li key={v.version} className="rounded-[12px] border border-linea bg-papel/60 px-3.5 py-3 text-[0.92rem]">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">Versión {v.version}</span>
            <span className="text-tinta-tenue">
              {v.editada_por}, {fechaHora(v.editada_en)}
            </span>
          </p>
          <p className="mt-0.5 text-tinta-suave">{v.motivo_cambio ?? "Primera versión, al confirmar la ficha."}</p>
          <p className="mt-1.5 text-tinta">
            {fechaCorta(v.datos.fecha)}: {[v.datos.motivo, v.datos.diagnostico, v.datos.tratamiento].filter(Boolean).join(". ")}
            {v.datos.vacunas.length ? `. Vacunas: ${v.datos.vacunas.join(", ")}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

function FormularioCorreccion({ c, onCancelar, onGuardada }: { c: Consulta; onCancelar: () => void; onGuardada: (c: Consulta) => void }) {
  const [valores, setValores] = useState({
    fecha: c.fecha ?? "",
    motivo: c.motivo ?? "",
    diagnostico: c.diagnostico ?? "",
    tratamiento: c.tratamiento ?? "",
    vacunas: c.vacunas.join(", "),
  });
  const [motivoCambio, setMotivoCambio] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<ErrorApi | null>(null);
  const id = `corregir-${c.id}`;
  const set = (k: keyof typeof valores) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValores({ ...valores, [k]: e.target.value });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!motivoCambio.trim()) {
      setError(new ErrorApi(400, "motivo_requerido", "Escribe por qué corriges este dato."));
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const nueva = await api.corregirConsulta(c.id, {
        fecha: valores.fecha || null,
        motivo: valores.motivo || null,
        diagnostico: valores.diagnostico || null,
        tratamiento: valores.tratamiento || null,
        vacunas: valores.vacunas.split(",").map((v) => v.trim()).filter(Boolean),
        motivo_cambio: motivoCambio.trim(),
      });
      onGuardada(nueva);
    } catch (err) {
      setError(aErrorApi(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="mt-4 space-y-3.5" aria-label="Corregir consulta">
      <p className="text-[0.92rem] text-tinta-suave">La versión actual se guarda. Lo que cambies queda como versión {c.version + 1}.</p>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Etiqueta htmlFor={`${id}-fecha`}>Fecha</Etiqueta>
          <Entrada id={`${id}-fecha`} type="date" value={valores.fecha} onChange={set("fecha")} className="num" />
        </div>
        <div className="space-y-1.5">
          <Etiqueta htmlFor={`${id}-vacunas`}>Vacunas, separadas por coma</Etiqueta>
          <Entrada id={`${id}-vacunas`} value={valores.vacunas} onChange={set("vacunas")} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Etiqueta htmlFor={`${id}-motivo`}>Motivo de consulta</Etiqueta>
        <Entrada id={`${id}-motivo`} value={valores.motivo} onChange={set("motivo")} />
      </div>
      <div className="space-y-1.5">
        <Etiqueta htmlFor={`${id}-dx`}>Diagnóstico</Etiqueta>
        <AreaTexto id={`${id}-dx`} rows={2} value={valores.diagnostico} onChange={set("diagnostico")} />
      </div>
      <div className="space-y-1.5">
        <Etiqueta htmlFor={`${id}-tx`}>Tratamiento</Etiqueta>
        <AreaTexto id={`${id}-tx`} rows={2} value={valores.tratamiento} onChange={set("tratamiento")} />
      </div>
      <div className="space-y-1.5">
        <Etiqueta htmlFor={`${id}-por-que`}>Por qué lo corriges</Etiqueta>
        <Entrada
          id={`${id}-por-que`}
          value={motivoCambio}
          onChange={(e) => setMotivoCambio(e.target.value)}
          placeholder="Fecha mal leída"
          aria-invalid={error?.codigo === "motivo_requerido"}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(error?.codigo === "motivo_requerido" && "border-alerta")}
        />
      </div>
      {error && <MensajeError id={`${id}-error`}>{error.mensaje}</MensajeError>}
      <div className="flex flex-wrap gap-2.5">
        <Boton type="submit" disabled={guardando}>
          {guardando && <LoaderCircle className="animate-spin" />} Guardar corrección
        </Boton>
        <Boton type="button" variante="secundario" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

const esImagen = (url: string) => /^(blob:|data:image\/)|\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);

function Miniatura({ url, onAbrir }: { url: string; onAbrir: () => void }) {
  return (
    <button
      onClick={onAbrir}
      className="group relative h-[78px] w-[62px] shrink-0 overflow-hidden rounded-[8px] border border-kraft-borde bg-kraft-claro shadow-calida transition-transform duration-200 hover:scale-105"
      aria-label="Ver el original"
    >
      {esImagen(url) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center">
          <FileText className="h-6 w-6 text-kraft-tinta" aria-hidden="true" />
        </span>
      )}
      <span className="absolute inset-0 grid place-items-center bg-tinta/0 text-white opacity-0 transition-all group-hover:bg-tinta/35 group-hover:opacity-100">
        <Maximize2 className="h-5 w-5" aria-hidden="true" />
      </span>
    </button>
  );
}

export function VisorOriginal({ url, titulo, abierto, onCerrar }: { url: string; titulo: string; abierto: boolean; onCerrar: () => void }) {
  return (
    <Dialogo open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogoContenido>
        <div className="pr-12">
          <DialogoTitulo className="font-display text-[1.35rem] font-semibold">{titulo}</DialogoTitulo>
          <DialogoDescripcion className="mt-1 text-tinta-suave">La foto o el archivo original, guardado junto al dato.</DialogoDescripcion>
        </div>
        {esImagen(url) ? (
          <div className="mt-4 overflow-hidden rounded-[12px] bg-tinta">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={titulo} className="mx-auto max-h-[72dvh] w-auto" />
          </div>
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-linea px-4 font-semibold text-primario hover:bg-primario-suave">
            <FileText className="h-5 w-5" /> Abrir el archivo original
          </a>
        )}
      </DialogoContenido>
    </Dialogo>
  );
}

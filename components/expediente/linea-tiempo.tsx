"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Hospital, Pill, Syringe, ScrollText, Database, MonitorCheck, Table2, Maximize2 } from "lucide-react";
import type { Consulta } from "@/lib/tipos";
import { CENTROS } from "@/datos/demo";
import { Insignia } from "@/components/ui/badge";
import { Dialogo, DialogoContenido, DialogoTitulo, DialogoDescripcion } from "@/components/ui/dialog";
import { cn, fechaCorta } from "@/lib/utils";

const ARCHIVO_SISTEMA = "registro_puesto_2015_2022.csv";

export function LineaTiempo({ consultas }: { consultas: Consulta[] }) {
  const [abierta, setAbierta] = useState<Consulta | null>(null);
  let añoPrevio = "";
  return (
    <>
      <ol className="relative">
        <span className="absolute bottom-4 left-[15px] top-4 w-[2px] rounded-full bg-[linear-gradient(180deg,var(--primario)_0%,var(--linea-fuerte)_35%,var(--kraft-borde)_100%)] sm:left-[19px]" aria-hidden="true" />
        {consultas.map((c, i) => {
          const año = c.fecha.slice(0, 4);
          const nuevoAño = año !== añoPrevio;
          añoPrevio = año;
          return (
            <li key={c.id} className="relative pl-11 sm:pl-14">
              {nuevoAño && (
                <p className="num relative -ml-11 mb-3 mt-2 flex items-center gap-3 font-serif text-[1.15rem] font-semibold text-tinta-suave sm:-ml-14">
                  <span className="grid h-8 w-8 place-items-center rounded-full border border-linea-fuerte bg-papel text-[0.72rem] font-sans font-bold sm:h-10 sm:w-10 sm:text-[0.8rem]">{año.slice(2)}</span>
                  {año}
                </p>
              )}
              <span className={cn("absolute left-[10px] h-3 w-3 rounded-full ring-4 ring-papel sm:left-[14px]", nuevoAño ? "top-[78px] sm:top-[86px]" : "top-7", c.origen === "digital" ? "bg-primario" : "bg-kraft-borde")} aria-hidden="true" />
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.25 + Math.min(i, 8) * 0.05 }} className="pb-4">
                <TarjetaConsulta c={c} onAbrir={() => setAbierta(c)} />
              </motion.div>
            </li>
          );
        })}
      </ol>
      <VisorOriginal consulta={abierta} onCerrar={() => setAbierta(null)} />
    </>
  );
}

function InsigniaFuente({ c }: { c: Consulta }) {
  const año = c.fecha.slice(0, 4);
  if (c.origen === "foto") return <Insignia tono="kraft"><ScrollText /> Rescatado de papel · {año}</Insignia>;
  if (c.origen === "sistema_antiguo") return <Insignia tono="kraft"><Database /> Rescatado de sistema antiguo · {c.fuente_detalle ?? "Excel"}</Insignia>;
  return <Insignia tono="primario"><MonitorCheck /> Digital</Insignia>;
}

function TarjetaConsulta({ c, onAbrir }: { c: Consulta; onAbrir: () => void }) {
  const centro = c.centro_id ? CENTROS[c.centro_id] : null;
  const pasado = c.origen !== "digital";
  const IconoCentro = centro?.tipo === "hospital" ? Hospital : Building2;
  return (
    <article className={cn("rounded-[16px] p-4 sm:p-5", pasado ? "papel-kraft esquina-doblada shadow-calida" : "border border-linea bg-superficie shadow-calida")}>
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <time dateTime={c.fecha} className="num font-serif text-[1.2rem] font-semibold">{fechaCorta(c.fecha)}</time>
            <InsigniaFuente c={c} />
          </div>
          {centro && (
            <p className={cn("mt-1 flex items-center gap-1.5 text-[0.88rem]", pasado ? "text-kraft-tinta" : "text-tinta-tenue")}>
              <IconoCentro className="h-4 w-4 shrink-0" /> {centro.nombre}
            </p>
          )}
        </div>
        {c.origen !== "digital" && <Miniatura c={c} onAbrir={onAbrir} />}
      </div>

      <dl className="mt-3 space-y-2 text-[0.97rem]">
        {c.motivo && <Fila etiqueta="Motivo" valor={c.motivo} fuerte />}
        {c.diagnostico && <Fila etiqueta="Diagnóstico" valor={c.diagnostico} />}
        {c.tratamiento && c.tratamiento !== "—" && <Fila etiqueta="Tratamiento" valor={c.tratamiento} />}
      </dl>

      {(c.medicamentos.length > 0 || c.vacunas.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.medicamentos.map((m) => (
            <span key={m} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.82rem] font-semibold", pasado ? "bg-white/70 text-tinta" : "bg-primario-suave text-primario-tinta")}>
              <Pill className="h-3.5 w-3.5" /> {m}
            </span>
          ))}
          {c.vacunas.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-confirmado-fondo px-2.5 py-1 text-[0.82rem] font-semibold text-confirmado">
              <Syringe className="h-3.5 w-3.5" /> {v}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[110px_1fr] sm:gap-3">
      <dt className="text-[0.82rem] font-semibold uppercase tracking-[0.05em] text-tinta-tenue sm:pt-0.5">{etiqueta}</dt>
      <dd className={cn(fuerte && "font-semibold")}>{valor}</dd>
    </div>
  );
}

function Miniatura({ c, onAbrir }: { c: Consulta; onAbrir: () => void }) {
  return (
    <button onClick={onAbrir} className="group relative h-[84px] w-[66px] shrink-0 rotate-[2deg] overflow-hidden rounded-[6px] border border-kraft-borde bg-[#f7efdd] shadow-calida transition-transform duration-200 hover:rotate-0 hover:scale-105" aria-label="Ver el original">
      {c.archivo_original_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.archivo_original_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="tabla-vieja flex h-full w-full flex-col gap-[5px] p-1.5 pt-2" aria-hidden="true">
          <Table2 className="h-4 w-4 text-kraft-tinta" />
          {[1, 2, 3, 4].map((k) => <span key={k} className="h-[3px] rounded bg-kraft-tinta/35" style={{ width: `${90 - k * 12}%` }} />)}
        </span>
      )}
      <span className="absolute inset-0 grid place-items-center bg-tinta/0 text-white opacity-0 transition-all group-hover:bg-tinta/35 group-hover:opacity-100">
        <Maximize2 className="h-5 w-5" />
      </span>
    </button>
  );
}

function VisorOriginal({ consulta: c, onCerrar }: { consulta: Consulta | null; onCerrar: () => void }) {
  return (
    <Dialogo open={!!c} onOpenChange={(o) => !o && onCerrar()}>
      <DialogoContenido>
        {c && (
          <>
            <div className="pr-12">
              <DialogoTitulo className="font-serif text-[1.4rem] font-semibold">Original · {fechaCorta(c.fecha)}</DialogoTitulo>
              <DialogoDescripcion className="mt-1 text-tinta-suave">
                {c.origen === "foto" ? "Foto de la ficha en papel, tal como se rescató." : `Fila tal como venía en ${ARCHIVO_SISTEMA}. El sistema original no se modificó.`}
              </DialogoDescripcion>
            </div>
            {c.origen === "foto" && c.archivo_original_url ? (
              <div className="mt-4 overflow-hidden rounded-[12px] bg-tinta">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.archivo_original_url} alt={`Ficha en papel del ${fechaCorta(c.fecha)}`} className="mx-auto max-h-[72dvh] w-auto" />
              </div>
            ) : (
              <div className="papel-kraft mt-4 overflow-hidden rounded-[12px]">
                <div className="flex items-center gap-2 border-b border-kraft-borde/70 bg-kraft/70 px-3 py-2 font-mono text-[0.78rem] font-semibold text-kraft-tinta">
                  <Database className="h-3.5 w-3.5" /> {ARCHIVO_SISTEMA} · {c.fuente_detalle}
                </div>
                <table className="tabla-vieja w-full text-[0.85rem] text-[#3d3324]">
                  <tbody>
                    {Object.entries(c.fila_original ?? {}).map(([k, v]) => (
                      <tr key={k}>
                        <th className="h-9 w-[42%] border-r border-kraft-borde/60 px-3 text-left font-semibold">{k}</th>
                        <td className="px-3">{v || <span className="text-[#a08a63]">·</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </DialogoContenido>
    </Dialogo>
  );
}

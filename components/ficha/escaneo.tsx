"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import type { LecturaFicha } from "@/lib/ia";
import { DEFINICION } from "./campos";
import { cn, formatearDPI, fechaCorta } from "@/lib/utils";

const MENSAJES = ["Enderezando la foto…", "Buscando el nombre y el DPI…", "Leyendo las fechas…", "Leyendo diagnóstico y tratamiento…", "Revisando alergias y medicamentos…"];

function mostrar(clave: string, v: string | string[]): string {
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (!v) return "—";
  if (clave === "dpi_cui") return formatearDPI(v);
  if (clave.startsWith("fecha")) return fechaCorta(v);
  if (clave === "sexo") return v === "F" ? "Femenino" : v === "M" ? "Masculino" : v;
  return v;
}

/** La foto con una línea de escaneo y los campos apareciendo uno por uno. */
export function Escaneo({ foto, lectura, onTerminar }: { foto: string; lectura: LecturaFicha | null; onTerminar: () => void }) {
  const [msg, setMsg] = useState(0);
  const [visibles, setVisibles] = useState(0);

  useEffect(() => {
    if (lectura) return;
    const t = setInterval(() => setMsg((m) => Math.min(m + 1, MENSAJES.length - 1)), 900);
    return () => clearInterval(t);
  }, [lectura]);

  useEffect(() => {
    if (!lectura) return;
    if (visibles >= DEFINICION.length) {
      const t = setTimeout(onTerminar, 750);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisibles((v) => v + 1), 130);
    return () => clearTimeout(t);
  }, [lectura, visibles, onTerminar]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
      <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-[18px] bg-tinta shadow-calida-lg lg:max-w-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={foto} alt="Ficha que se está leyendo" className="max-h-[34dvh] w-full object-contain lg:max-h-[72dvh]" />
        {/* velo que se ilumina detrás de la línea */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(15,94,90,.0),rgba(15,94,90,.10))]" />
        {!lectura || visibles < DEFINICION.length ? (
          <div className="pointer-events-none absolute inset-x-0 h-[14%] [animation:barrido_2.1s_cubic-bezier(.45,0,.55,1)_infinite_alternate]">
            <div className="h-full bg-[linear-gradient(180deg,rgba(94,234,212,0)_0%,rgba(94,234,212,.28)_88%,rgba(94,234,212,.0)_100%)]" />
            <div className="absolute inset-x-0 bottom-[12%] h-[2px] bg-[#5eead4] shadow-[0_0_14px_3px_rgba(94,234,212,.75)]" />
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center bg-primario/25">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-superficie text-primario shadow-calida-lg">
              <Check className="h-8 w-8" strokeWidth={3} />
            </span>
          </motion.div>
        )}
      </div>

      <div>
        <p className="text-[0.85rem] font-semibold uppercase tracking-[0.08em] text-primario">Lectura en curso</p>
        <h1 className="mt-1 text-[1.9rem] font-semibold leading-tight">{lectura ? "Lectura lista" : "Leyendo la ficha…"}</h1>
        <p className="mt-1.5 text-tinta-suave" aria-live="polite">
          {lectura ? "Ahora revisa lo que se leyó antes de guardar." : MENSAJES[msg]}
        </p>

        <ul className="mt-5 divide-y divide-linea overflow-hidden rounded-[16px] border border-linea bg-superficie">
          {DEFINICION.map((d, i) => {
            const fuente = lectura ? (lectura[d.grupo] as Record<string, { valor: string | string[]; confianza: string }>)[d.clave] : null;
            const visible = lectura && i < visibles;
            const dudoso = fuente && fuente.confianza !== "alta";
            return (
              <li key={d.clave} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                <span className="w-[42%] shrink-0 text-[0.88rem] text-tinta-tenue sm:w-[38%]">{d.etiqueta}</span>
                {visible && fuente ? (
                  <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className={cn("min-w-0 flex-1 truncate font-semibold", dudoso && "text-revisar-tinta")}>
                    <span className={cn(d.clave === "dpi_cui" && "num font-mono")}>{mostrar(d.clave, fuente.valor)}</span>
                  </motion.span>
                ) : (
                  <span className="h-3.5 flex-1 overflow-hidden rounded-full bg-[#efe8db]">
                    <span className="block h-full w-1/3 animate-[brillo_1.3s_ease-in-out_infinite] rounded-full bg-[linear-gradient(90deg,transparent,#fbf7ef,transparent)]" style={{ animationDelay: `${i * 90}ms` }} />
                  </span>
                )}
                {visible && fuente && (
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dudoso ? "bg-revisar" : "bg-confirmado")} aria-label={dudoso ? "Revisar" : "Claro"} />
                )}
              </li>
            );
          })}
        </ul>
        <style>{`@keyframes brillo{from{transform:translateX(-120%)}to{transform:translateX(320%)}}`}</style>
      </div>
    </div>
  );
}

"use client";
import { motion } from "framer-motion";
import { TriangleAlert, HeartPulse, Pill, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function AlertaClinica({ alergias, condiciones, medicamentos, sexo }: { alergias: string[]; condiciones: string[]; medicamentos: string[]; sexo: "F" | "M" | null }) {
  const hay = alergias.length > 0;
  const palabra = sexo === "M" ? "ALÉRGICO" : "ALÉRGICA";
  return (
    <motion.section
      aria-label="Alerta clínica"
      initial={{ opacity: 0, y: -10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1], delay: 0.05 }}
      className={cn("overflow-hidden rounded-[18px] shadow-calida-lg", hay ? "bg-alerta text-white" : "border border-linea bg-superficie")}
    >
      <div className={cn("flex items-center gap-3.5 px-4 py-4 sm:px-6 sm:py-5", !hay && "border-b border-linea")}>
        <motion.span
          initial={{ scale: 0.6 }}
          animate={hay ? { scale: [0.6, 1.12, 1] } : { scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-full sm:h-14 sm:w-14", hay ? "bg-white/15 ring-2 ring-white/35" : "bg-confirmado-fondo text-confirmado")}
        >
          {hay ? <TriangleAlert className="h-7 w-7" strokeWidth={2.25} /> : <ShieldCheck className="h-7 w-7" />}
        </motion.span>
        <div className="min-w-0">
          <p className={cn("text-[0.78rem] font-bold uppercase tracking-[0.12em]", hay ? "text-white/80" : "text-tinta-tenue")}>Alerta clínica</p>
          {hay ? (
            <p className="font-sans text-[1.35rem] font-bold leading-tight tracking-[0.02em] sm:text-[1.75rem]">
              {palabra} A {alergias.map((a) => a.toUpperCase()).join(" Y ")}
            </p>
          ) : (
            <p className="text-[1.2rem] font-bold text-tinta">Sin alergias registradas</p>
          )}
        </div>
      </div>
      <div className={cn("grid gap-px sm:grid-cols-2", hay ? "bg-white/15" : "bg-linea")}>
        <Bloque icono={<HeartPulse />} titulo="Condiciones crónicas" items={condiciones} vacio="Ninguna registrada" oscuro={hay} />
        <Bloque icono={<Pill />} titulo="Medicamentos actuales" items={medicamentos} vacio="Ninguno en el último año" oscuro={hay} />
      </div>
    </motion.section>
  );
}

function Bloque({ icono, titulo, items, vacio, oscuro }: { icono: React.ReactNode; titulo: string; items: string[]; vacio: string; oscuro: boolean }) {
  return (
    <div className={cn("px-4 py-3.5 sm:px-6", oscuro ? "bg-[#b5302a]" : "bg-superficie")}>
      <p className={cn("flex items-center gap-1.5 text-[0.8rem] font-bold uppercase tracking-[0.08em] [&_svg]:h-4 [&_svg]:w-4", oscuro ? "text-white/80" : "text-tinta-tenue")}>
        {icono} {titulo}
      </p>
      {items.length ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {items.map((i) => (
            <li key={i} className={cn("rounded-full px-2.5 py-1 text-[0.9rem] font-semibold", oscuro ? "bg-white text-alerta" : "bg-papel text-tinta")}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className={cn("mt-1 text-[0.92rem]", oscuro ? "text-white/85" : "text-tinta-suave")}>{vacio}</p>
      )}
    </div>
  );
}

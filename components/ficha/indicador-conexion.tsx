"use client";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff, CloudUpload, CircleCheck } from "lucide-react";
import { useConexion } from "@/lib/pendientes";
import { cn } from "@/lib/utils";

/** Franja bajo el encabezado: sin señal, fichas pendientes y subida automática. */
export function IndicadorConexion() {
  const { enLinea, pendientes, subiendo, subidas } = useConexion();
  const n = pendientes.length;

  let contenido: { tono: "revisar" | "primario" | "confirmado"; icono: React.ReactNode; texto: string; detalle?: string } | null = null;
  if (!enLinea) {
    contenido = {
      tono: "revisar",
      icono: <CloudOff />,
      texto: n ? `Sin señal · ${n} ${n === 1 ? "ficha pendiente" : "fichas pendientes"} de subir` : "Sin señal",
      detalle: n ? "Se subirán solas cuando vuelva la señal." : "Puedes seguir digitalizando; se guarda en el celular.",
    };
  } else if (subiendo) {
    contenido = { tono: "primario", icono: <CloudUpload className="animate-bounce" />, texto: `Subiendo ${subiendo} ${subiendo === 1 ? "ficha" : "fichas"}…` };
  } else if (subidas) {
    contenido = { tono: "confirmado", icono: <CircleCheck />, texto: `${subidas} ${subidas === 1 ? "ficha subida" : "fichas subidas"} al expediente` };
  } else if (n) {
    contenido = { tono: "revisar", icono: <CloudUpload />, texto: `${n} ${n === 1 ? "ficha pendiente" : "fichas pendientes"} de subir` };
  }

  return (
    <AnimatePresence initial={false}>
      {contenido && (
        <motion.div
          key={contenido.tono + contenido.texto}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22 }}
          role="status"
          aria-live="polite"
          className={cn(
            "overflow-hidden border-b",
            contenido.tono === "revisar" && "border-revisar/60 bg-revisar-fondo text-revisar-tinta",
            contenido.tono === "primario" && "border-primario bg-primario text-white",
            contenido.tono === "confirmado" && "border-confirmado/30 bg-confirmado-fondo text-confirmado"
          )}
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5 text-[0.92rem] sm:px-6 [&_svg]:h-5 [&_svg]:w-5">
            {contenido.icono}
            <span className="font-bold">{contenido.texto}</span>
            {contenido.detalle && <span className="basis-full pl-7 text-[0.85rem] opacity-90 sm:basis-auto sm:pl-1">{contenido.detalle}</span>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

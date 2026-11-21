"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Camera, House, FileImage, TriangleAlert, CalendarPlus, CloudOff } from "lucide-react";
import { Boton } from "@/components/ui/button";
import { fechaCorta, primerNombre } from "@/lib/utils";

/** La ficha "se guarda" dentro del expediente. */
export function Guardado({ foto, nombre, fecha, alergias, sinSenal = false, onOtra }: { foto: string; nombre: string; fecha: string; alergias: string[]; sinSenal?: boolean; onOtra: () => void }) {
  return (
    <div className="mx-auto max-w-lg pt-4 text-center sm:pt-10">
      <div className="relative mx-auto h-56 w-60" aria-hidden="true">
        {/* fólder trasero */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="absolute bottom-0 left-1/2 h-36 w-56 -translate-x-1/2">
          <div className="absolute -top-4 left-3 h-6 w-20 rounded-t-[10px] bg-primario-hover" />
          <div className="absolute inset-0 rounded-[14px] bg-primario-hover" />
        </motion.div>
        {/* ficha que entra */}
        <motion.div
          initial={{ y: -40, rotate: -8, scale: 1, opacity: 0 }}
          animate={{ y: [-40, -40, 58], rotate: [-8, -4, 0], scale: [1, 1, 0.82], opacity: [0, 1, 1] }}
          transition={{ duration: 1.1, times: [0, 0.35, 1], ease: [0.3, 0.7, 0.2, 1] }}
          className="papel-kraft absolute left-1/2 top-0 h-40 w-32 -translate-x-1/2 overflow-hidden rounded-[8px] p-1"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} alt="" className="h-full w-full rounded-[5px] object-cover" />
        </motion.div>
        {/* frente del fólder */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="absolute bottom-0 left-1/2 h-28 w-56 -translate-x-1/2 rounded-[14px] bg-primario shadow-[0_18px_30px_-14px_rgba(40,54,89,.8)]">
          <span className="absolute bottom-3 left-4 font-display text-[0.95rem] font-semibold text-white/90">Expediente</span>
        </motion.div>
        {/* sello de confirmado */}
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.15, 1], opacity: 1 }}
          transition={{ delay: 1.05, duration: 0.3 }}
          className={sinSenal ? "absolute -right-1 bottom-16 grid h-14 w-14 place-items-center rounded-full bg-revisar text-tinta shadow-calida-lg ring-4 ring-papel" : "absolute -right-1 bottom-16 grid h-14 w-14 place-items-center rounded-full bg-confirmado text-white shadow-calida-lg ring-4 ring-papel"}
        >
          {sinSenal ? <CloudOff className="h-7 w-7" /> : <Check className="h-7 w-7" strokeWidth={3} />}
        </motion.span>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 0.25 }}>
        <h1 className="mt-8 text-[2rem] font-semibold leading-tight" role="status">
          {sinSenal ? "Ficha guardada en el celular" : `Expediente de ${primerNombre(nombre)} actualizado`}
        </h1>
        <p className="mt-2 text-tinta-suave">
          {sinSenal ? `No hay señal. La ficha de ${primerNombre(nombre)} se subirá sola cuando vuelva.` : "Cualquier centro autorizado ya puede consultarlo con su DPI."}
        </p>

        <ul className="mx-auto mt-6 max-w-sm space-y-2.5 text-left">
          <Item icono={<CalendarPlus />}>Consulta del {fechaCorta(fecha)} {sinSenal ? "lista para subir" : "agregada"}</Item>
          {alergias.length > 0 && <Item icono={<TriangleAlert />} alerta>Alergia confirmada: {alergias.join(", ")}</Item>}
          <Item icono={<FileImage />}>{sinSenal ? "Foto original guardada en el celular" : "Foto original guardada junto al dato"}</Item>
        </ul>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Boton tamaño="lg" onClick={onOtra}>
            <Camera /> Digitalizar otra ficha
          </Boton>
          <Boton tamaño="lg" variante="secundario" asChild>
            <Link href="/puesto">
              <House /> Volver al inicio
            </Link>
          </Boton>
        </div>
      </motion.div>
    </div>
  );
}

function Item({ icono, children, alerta }: { icono: React.ReactNode; children: React.ReactNode; alerta?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-[12px] border border-linea bg-superficie px-3.5 py-3">
      <span className={alerta ? "text-alerta [&_svg]:h-5 [&_svg]:w-5" : "text-confirmado [&_svg]:h-5 [&_svg]:w-5"}>{icono}</span>
      <span className="font-semibold">{children}</span>
    </li>
  );
}

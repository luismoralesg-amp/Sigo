"use client";
import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Captura, type Foto } from "./captura";
import { Escaneo } from "./escaneo";
import { Revision } from "./revision";
import { Guardado } from "./guardado";
import { aCampos, listaDe, valorDe, type EstadoCampo } from "./campos";
import type { LecturaFicha } from "@/lib/ia";
import { LECTURA_RESPALDO_ROSA } from "@/datos/lectura-respaldo";
import { agregarPendiente, estaEnLinea } from "@/lib/pendientes";

type Paso = "captura" | "leyendo" | "revision" | "listo";

/**
 * Lectura simulada para la versión de interfaz: devuelve la ficha de Rosa ya procesada.
 * Al conectar el backend se reemplaza por POST /api/leer-ficha con las fotos.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- las fotos se enviarán al conectar el backend
async function leer(_fotos: Foto[]): Promise<LecturaFicha> {
  await new Promise((r) => setTimeout(r, 3600));
  return structuredClone(LECTURA_RESPALDO_ROSA);
}

export function FlujoDigitalizar() {
  const [paso, setPaso] = useState<Paso>("captura");
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [lectura, setLectura] = useState<LecturaFicha | null>(null);
  const [campos, setCampos] = useState<EstadoCampo[]>([]);
  const [eleccion, setEleccion] = useState<string | null>(null);
  const [sinSenal, setSinSenal] = useState(false);

  async function iniciarLectura() {
    setLectura(null);
    setPaso("leyendo");
    window.scrollTo({ top: 0 });
    const l = await leer(fotos);
    setLectura(l);
    setCampos(aCampos(l));
  }

  const terminarEscaneo = useCallback(() => {
    setPaso("revision");
    window.scrollTo({ top: 0 });
  }, []);

  function confirmar() {
    const offline = !estaEnLinea();
    // Sin señal: la ficha confirmada queda en el celular y se sube sola después.
    if (offline) agregarPendiente({ nombre: valorDe(campos, "nombre"), fecha: valorDe(campos, "fecha") });
    setSinSenal(offline);
    setPaso("listo");
    window.scrollTo({ top: 0 });
  }

  function reiniciar() {
    setFotos([]);
    setLectura(null);
    setCampos([]);
    setEleccion(null);
    setPaso("captura");
    window.scrollTo({ top: 0 });
  }

  return (
    <>
      {paso !== "listo" && (
        <div className="mb-4">
          {paso === "captura" ? (
            <Link href="/puesto" className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 font-semibold text-tinta-suave hover:text-tinta">
              <ArrowLeft className="h-5 w-5" /> Inicio
            </Link>
          ) : (
            <button onClick={() => setPaso("captura")} className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 font-semibold text-tinta-suave hover:text-tinta">
              <ArrowLeft className="h-5 w-5" /> Cambiar fotos
            </button>
          )}
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.div key={paso} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {paso === "captura" && <Captura fotos={fotos} setFotos={setFotos} onLeer={iniciarLectura} />}
          {paso === "leyendo" && fotos[0] && <Escaneo foto={fotos[0].url} lectura={lectura} onTerminar={terminarEscaneo} />}
          {paso === "revision" && (
            <Revision fotos={fotos.map((f) => f.url)} campos={campos} setCampos={setCampos} eleccion={eleccion} setEleccion={setEleccion} onConfirmar={confirmar} />
          )}
          {paso === "listo" && fotos[0] && (
            <Guardado foto={fotos[0].url} nombre={valorDe(campos, "nombre")} fecha={valorDe(campos, "fecha")} alergias={listaDe(campos, "alergias")} sinSenal={sinSenal} onOtra={reiniciar} />
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

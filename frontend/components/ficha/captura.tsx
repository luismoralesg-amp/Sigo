"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import imageCompression from "browser-image-compression";
import { Camera, ImagePlus, X, ScrollText, LoaderCircle, ScanLine, Lightbulb } from "lucide-react";
import { Boton } from "@/components/ui/button";

export interface Foto {
  id: string;
  url: string;
  archivo: File;
}

export function Captura({ fotos, setFotos, onLeer }: { fotos: Foto[]; setFotos: (f: Foto[]) => void; onLeer: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preparando, setPreparando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agregar(lista: FileList | File[]) {
    setError(null);
    setPreparando(true);
    try {
      const nuevas: Foto[] = [];
      for (const f of Array.from(lista).slice(0, 4 - fotos.length)) {
        if (!f.type.startsWith("image/")) {
          setError("Ese archivo no es una foto. Usa la cámara o elige una imagen.");
          continue;
        }
        // Comprimir en el celular: se sube más rápido con poca señal
        const comprimida = await imageCompression(f, { maxWidthOrHeight: 1800, maxSizeMB: 0.8, useWebWorker: false, fileType: "image/jpeg" });
        nuevas.push({ id: crypto.randomUUID(), url: URL.createObjectURL(comprimida), archivo: new File([comprimida], f.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) });
      }
      setFotos([...fotos, ...nuevas]);
    } catch {
      setError("No pudimos preparar la foto. Intenta tomarla de nuevo.");
    } finally {
      setPreparando(false);
    }
  }

  async function usarEjemplo() {
    setPreparando(true);
    const r = await fetch("/demo/ficha-rosa-2024.jpg");
    const b = await r.blob();
    setPreparando(false);
    await agregar([new File([b], "ficha-rosa-2024.jpg", { type: "image/jpeg" })]);
  }

  const quitar = (id: string) => setFotos(fotos.filter((f) => f.id !== id));

  return (
    <div className="pb-28">
      <p className="ceja">Paso 1 de 2 · Foto</p>
      <h1 className="mt-4 text-[2rem] leading-tight sm:text-[2.3rem]">Digitalizar ficha en papel</h1>
      <p className="mt-2 text-tinta-suave">Toma una foto de la ficha completa. Si tiene varias páginas, agrega una foto por página.</p>

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        id="foto-ficha"
        onChange={(e) => {
          if (e.target.files?.length) agregar(e.target.files);
          e.target.value = "";
        }}
      />

      <AnimatePresence mode="popLayout" initial={false}>
        {fotos.length === 0 ? (
          <motion.label
            key="vacio"
            htmlFor="foto-ficha"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="papel-kraft group mt-6 flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-[22px] border-2 border-dashed !border-kraft-borde p-6 text-center transition-colors hover:!border-primario/50 focus-within:outline-3 focus-within:outline-primario"
          >
            <span className="grid h-20 w-20 place-items-center rounded-full bg-primario text-white shadow-[0_10px_24px_-10px_rgba(40,54,89,.8)] transition-transform duration-200 group-hover:scale-105">
              <Camera className="h-9 w-9" strokeWidth={1.75} />
            </span>
            <span className="mt-5 font-display text-[1.45rem] font-semibold text-tinta">Tomar foto de la ficha</span>
            <span className="mt-1 text-kraft-tinta">o elegir una de la galería</span>
          </motion.label>
        ) : (
          <motion.div key="fotos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fotos.map((f, i) => (
              <motion.figure key={f.id} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.22 }} className="papel-kraft relative overflow-hidden rounded-[14px] p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={`Página ${i + 1} de la ficha`} className="aspect-[3/4] w-full rounded-[10px] object-cover" />
                <figcaption className="absolute bottom-3 left-3 rounded-full bg-tinta/75 px-2.5 py-1 text-[0.75rem] font-semibold text-white">Página {i + 1}</figcaption>
                <button onClick={() => quitar(f.id)} className="absolute right-2.5 top-2.5 grid h-11 w-11 place-items-center rounded-full bg-superficie/95 text-tinta shadow-calida" aria-label={`Quitar página ${i + 1}`}>
                  <X className="h-5 w-5" />
                </button>
              </motion.figure>
            ))}
            {fotos.length < 4 && (
              <label htmlFor="foto-ficha" className="grid aspect-[3/4] cursor-pointer place-items-center rounded-[14px] border-2 border-dashed border-linea-fuerte bg-superficie text-center text-tinta-suave transition-colors hover:border-primario/50 hover:text-primario">
                <span>
                  <ImagePlus className="mx-auto h-8 w-8" strokeWidth={1.75} />
                  <span className="mt-2 block px-2 text-[0.9rem] font-semibold">Agregar otra página</span>
                </span>
              </label>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {preparando && (
        <p className="mt-4 flex items-center gap-2 text-tinta-suave" role="status">
          <LoaderCircle className="h-5 w-5 animate-spin text-primario" /> Preparando la foto…
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-[12px] bg-alerta-fondo px-4 py-3 text-alerta" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-start gap-3 rounded-[14px] border border-linea bg-superficie p-4 text-[0.92rem] text-tinta-suave">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-revisar-tinta" />
        <p>Pon la ficha sobre una mesa, con luz de ventana y sin sombra de tu mano. La foto original se guarda junto a los datos.</p>
      </div>

      {fotos.length === 0 && (
        <button onClick={usarEjemplo} className="mt-4 flex min-h-11 items-center gap-2 rounded-[12px] px-2 font-semibold text-primario hover:bg-primario-suave">
          <ScrollText className="h-5 w-5" /> Probar con la ficha de ejemplo de Rosa
        </button>
      )}

      {/* barra fija */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-superficie/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <p className="hidden flex-1 text-tinta-suave sm:block">{fotos.length ? `${fotos.length} ${fotos.length === 1 ? "página lista" : "páginas listas"}` : "Agrega al menos una foto"}</p>
          <Boton tamaño="xl" className="w-full sm:w-auto" disabled={!fotos.length || preparando} onClick={onLeer}>
            <ScanLine /> Leer ficha
          </Boton>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { Camera, ImagePlus, X, ScrollText, LoaderCircle, ScanLine, Lightbulb } from "lucide-react";
import { Boton, BarraAccion } from "@/components/ui/button";

export interface Foto {
  id: string;
  url: string;
  archivo: File;
}

const MAX_PAGINAS = 4;

/** Compresión del contrato: 1600 px de lado y menos de 1.5 MB por foto. `fuerte` se usa al reintentar tras un 413. */
export async function comprimir(f: File | Blob, fuerte = false): Promise<File> {
  const c = await imageCompression(f instanceof File ? f : new File([f], "foto.jpg", { type: f.type || "image/jpeg" }), {
    maxWidthOrHeight: fuerte ? 1280 : 1600,
    maxSizeMB: fuerte ? 0.8 : 1.4,
    useWebWorker: false,
    fileType: "image/jpeg",
  });
  return new File([c], "pagina.jpg", { type: "image/jpeg" });
}

export function Captura({
  fotos,
  setFotos,
  onLeer,
  ocupado,
  paciente,
  errorSubida,
}: {
  fotos: Foto[];
  setFotos: (f: Foto[]) => void;
  onLeer: () => void;
  ocupado: boolean;
  paciente: string;
  errorSubida?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preparando, setPreparando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agregar(lista: FileList | File[]) {
    setError(null);
    setPreparando(true);
    try {
      const nuevas: Foto[] = [];
      for (const f of Array.from(lista).slice(0, MAX_PAGINAS - fotos.length)) {
        if (!f.type.startsWith("image/")) {
          setError("Ese archivo no es una foto. Usa la cámara o elige una imagen.");
          continue;
        }
        // Comprimir en el celular: se sube más rápido con poca señal.
        const comprimida = await comprimir(f);
        nuevas.push({ id: crypto.randomUUID(), url: URL.createObjectURL(comprimida), archivo: comprimida });
      }
      setFotos([...fotos, ...nuevas]);
    } catch {
      setError("No se pudo preparar la foto. Tómala otra vez.");
    } finally {
      setPreparando(false);
    }
  }

  async function usarEjemplo() {
    setPreparando(true);
    try {
      const r = await fetch("/demo/ficha-rosa-2025.jpg");
      const b = await r.blob();
      await agregar([new File([b], "ficha-rosa-2025.jpg", { type: "image/jpeg" })]);
    } catch {
      setError("No se pudo cargar la ficha de ejemplo.");
    } finally {
      setPreparando(false);
    }
  }

  const quitar = (id: string) => setFotos(fotos.filter((f) => f.id !== id));
  const mensaje = error ?? errorSubida;

  return (
    <div>
      <h1 className="titulo">Escanear ficha</h1>
      <p className="mt-1.5 text-tinta-suave">
        De <span className="font-semibold text-tinta">{paciente}</span>. Una foto por página; puedes agregar hasta {MAX_PAGINAS}.
      </p>

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        id="foto-ficha"
        onChange={(e) => {
          if (e.target.files?.length) void agregar(e.target.files);
          e.target.value = "";
        }}
      />

      {fotos.length === 0 ? (
        <label
          htmlFor="foto-ficha"
          className="tarjeta mt-5 flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 border-dashed p-6 text-center hover:border-primario focus-within:outline focus-within:outline-3 focus-within:outline-primario"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-primario text-white">
            <Camera className="h-8 w-8" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="subtitulo">Tomar foto de la ficha</span>
          <span className="text-tinta-suave">o elegir una de la galería</span>
        </label>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Páginas">
          {fotos.map((f, i) => (
            <li key={f.id} className="tarjeta relative overflow-hidden p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={`Página ${i + 1} de la ficha`} className="aspect-[3/4] w-full rounded-[8px] object-cover" />
              <span className="absolute bottom-3 left-3 rounded-full bg-primario px-2.5 py-1 text-[0.85rem] font-semibold text-white">Página {i + 1}</span>
              <button onClick={() => quitar(f.id)} className="absolute right-2 top-2 grid h-12 w-12 place-items-center rounded-full border border-linea bg-superficie text-tinta" aria-label={`Quitar página ${i + 1}`}>
                <X className="h-5 w-5" />
              </button>
            </li>
          ))}
          {fotos.length < MAX_PAGINAS && (
            <li>
              <label htmlFor="foto-ficha" className="tarjeta flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 border-dashed p-2 text-center text-primario hover:border-primario">
                <ImagePlus className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
                <span className="font-semibold">Agregar página</span>
              </label>
            </li>
          )}
        </ul>
      )}

      {preparando && (
        <p className="mt-4 flex items-center gap-2 text-tinta-suave" role="status">
          <LoaderCircle className="h-5 w-5 animate-spin text-primario" aria-hidden="true" /> Preparando la foto…
        </p>
      )}
      {mensaje && (
        <p className="aviso-alerta mt-4 px-4 py-3" role="alert">
          {mensaje}
        </p>
      )}

      <p className="mt-5 flex items-start gap-3 text-tinta-suave">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        Ficha sobre una mesa, con luz de ventana y sin sombra de la mano. La foto original se guarda junto a los datos.
      </p>

      {fotos.length === 0 && (
        <button onClick={usarEjemplo} className="-ml-2 mt-3 flex min-h-12 items-center gap-2 rounded-[10px] px-2 font-semibold text-primario hover:bg-primario-suave">
          <ScrollText className="h-5 w-5" aria-hidden="true" /> Probar con la ficha de ejemplo
        </button>
      )}

      <BarraAccion>
        <Boton tamaño="accion" disabled={!fotos.length || preparando || ocupado} onClick={onLeer}>
          {ocupado ? <LoaderCircle className="animate-spin" /> : <ScanLine />}{" "}
          {ocupado ? "Subiendo…" : fotos.length ? `Leer ficha (${fotos.length} ${fotos.length === 1 ? "página" : "páginas"})` : "Toma al menos una foto"}
        </Boton>
      </BarraAccion>
    </div>
  );
}

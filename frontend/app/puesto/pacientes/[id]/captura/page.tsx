"use client";
/**
 * /puesto/pacientes/[id]/captura · enfermera. Cámara: una o varias páginas.
 * Endpoint: POST /pacientes/{id}/fichas (o la cola local si no hay señal).
 * La ficha nace ligada a este paciente (P-05), aunque el papel no traiga DPI.
 * El nombre llega por la URL (?nombre=) para no leer el expediente solo por mostrarlo, y para que funcione sin señal.
 */
import { Suspense, use, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CloudOff } from "lucide-react";
import { Shell } from "@/components/shell";
import { Boton } from "@/components/ui/button";
import { Captura, comprimir, type Foto } from "@/components/ficha/captura";
import { api } from "@/lib/api/cliente";
import { aErrorApi } from "@/lib/api/errores";
import { estaEnLinea, guardarPendiente, type Pendiente } from "@/lib/pendientes";
import { isoGuatemala } from "@/lib/utils";

export default function PaginaCaptura({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent(use(params).id);
  return (
    <Shell>
      <Suspense>
        <Contenido id={id} />
      </Suspense>
    </Shell>
  );
}

function Contenido({ id }: { id: string }) {
  const router = useRouter();
  const nombre = useSearchParams().get("nombre") ?? "este paciente";
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enCola, setEnCola] = useState(false);
  const volver = `/puesto/pacientes/${encodeURIComponent(id)}`;

  async function aCola(p: Pendiente) {
    await guardarPendiente(p);
    setEnCola(true);
  }

  async function leer() {
    setError(null);
    setSubiendo(true);
    const pendiente: Pendiente = { paciente_id: id, client_id: crypto.randomUUID(), capturada_en: isoGuatemala(), imagenes: fotos.map((f) => f.archivo as Blob) };

    // Sin señal: la foto y su client_id se quedan en el celular y se suben solas después.
    if (!estaEnLinea()) {
      await aCola(pendiente);
      setSubiendo(false);
      return;
    }
    try {
      let ficha;
      try {
        ficha = await api.subirFicha(id, pendiente);
      } catch (e) {
        // 413: se vuelve a comprimir más fuerte y se reintenta una vez, con el mismo client_id.
        if (aErrorApi(e).codigo !== "archivo_muy_grande") throw e;
        pendiente.imagenes = await Promise.all(pendiente.imagenes.map((i) => comprimir(i, true)));
        ficha = await api.subirFicha(id, pendiente);
      }
      router.push(`/puesto/fichas/${encodeURIComponent(ficha.id)}`);
    } catch (e) {
      const ea = aErrorApi(e);
      // Sin señal o IA caída: la ficha queda en cola (tabla de errores, 503).
      if (ea.codigo === "sin_senal" || ea.codigo === "ia_no_disponible") await aCola(pendiente);
      else if (ea.codigo === "ilegible") setError(ea.mensaje || "No se pudo leer nada. Toma la foto otra vez, con más luz.");
      else setError(ea.mensaje);
      setSubiendo(false);
    }
  }

  return (
    <>
      <Link href={volver} className="-ml-2 mb-3 inline-flex min-h-12 items-center gap-1.5 rounded-[10px] px-2 font-semibold text-tinta-suave hover:text-tinta">
        <ArrowLeft className="h-5 w-5" /> Volver al paciente
      </Link>

      {enCola ? (
        <section className="rounded-[12px] border border-dudoso-borde bg-dudoso-fondo p-5 text-dudoso" role="status">
          <CloudOff className="h-7 w-7" aria-hidden="true" />
          <h1 className="mt-3 text-[1.5rem] font-semibold text-tinta">La ficha quedó guardada en el celular</h1>
          <p className="mt-2 text-tinta">
            {fotos.length} {fotos.length === 1 ? "página" : "páginas"} de {nombre}. Se sube sola cuando vuelva la señal; después la revisas y la confirmas.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Boton
              onClick={() => {
                setFotos([]);
                setEnCola(false);
              }}
            >
              Escanear otra ficha
            </Boton>
            <Boton asChild variante="secundario">
              <Link href={volver}>Volver al paciente</Link>
            </Boton>
          </div>
        </section>
      ) : (
        <Captura fotos={fotos} setFotos={setFotos} onLeer={leer} ocupado={subiendo} paciente={nombre} errorSubida={error} />
      )}
    </>
  );
}

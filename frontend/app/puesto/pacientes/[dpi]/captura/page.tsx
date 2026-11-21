"use client";
/**
 * /puesto/pacientes/[dpi]/captura · enfermera. Cámara: una o varias páginas.
 * Endpoint: POST /fichas/foto (o la cola local si no hay señal).
 * La ficha nace ligada a este paciente (P-05), aunque el papel no traiga DPI.
 */
import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CloudOff } from "lucide-react";
import { Shell } from "@/components/shell";
import { Boton } from "@/components/ui/button";
import { Captura, comprimir, type Foto } from "@/components/ficha/captura";
import { Cargando, ErrorPantalla } from "@/components/estado";
import { api } from "@/lib/api/cliente";
import { aErrorApi } from "@/lib/api/errores";
import { useDatos } from "@/lib/api/usar";
import { estaEnLinea, guardarPendiente } from "@/lib/pendientes";
import { isoGuatemala } from "@/lib/utils";

export default function PaginaCaptura({ params }: { params: Promise<{ dpi: string }> }) {
  const dpi = decodeURIComponent(use(params).dpi);
  const router = useRouter();
  const paciente = useDatos(() => api.buscarPaciente(dpi), [dpi]);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enCola, setEnCola] = useState(false);
  const volver = `/puesto/pacientes/${encodeURIComponent(dpi)}`;

  async function leer() {
    setError(null);
    setSubiendo(true);
    const pendiente = { dpi, client_id: crypto.randomUUID(), capturada_en: isoGuatemala(), imagenes: fotos.map((f) => f.archivo as Blob) };

    // Sin señal: la foto y su client_id se quedan en el celular y se suben solas después.
    if (!estaEnLinea()) {
      await guardarPendiente(pendiente);
      setSubiendo(false);
      setEnCola(true);
      return;
    }
    try {
      let ficha;
      try {
        ficha = await api.subirFoto(pendiente);
      } catch (e) {
        // 413: se vuelve a comprimir más fuerte y se reintenta una vez, con el mismo client_id.
        if (aErrorApi(e).codigo !== "archivo_muy_grande") throw e;
        pendiente.imagenes = await Promise.all(pendiente.imagenes.map((i) => comprimir(i, true)));
        ficha = await api.subirFoto(pendiente);
      }
      router.push(`/puesto/fichas/${encodeURIComponent(ficha.id)}`);
    } catch (e) {
      const ea = aErrorApi(e);
      if (ea.codigo === "sin_senal") {
        await guardarPendiente(pendiente);
        setEnCola(true);
      } else if (ea.codigo === "ilegible") {
        setError("No se pudo leer nada. Toma la foto otra vez, con más luz.");
      } else if (ea.codigo === "ia_no_disponible") {
        await guardarPendiente(pendiente);
        setEnCola(true);
      } else {
        setError(ea.mensaje);
      }
      setSubiendo(false);
    }
  }

  return (
    <Shell>
      <Link href={volver} className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 font-semibold text-tinta-suave hover:text-tinta">
        <ArrowLeft className="h-5 w-5" /> Volver al paciente
      </Link>

      {paciente.estado === "cargando" && <Cargando filas={1} />}
      {paciente.estado === "error" && <ErrorPantalla error={paciente.error} onReintentar={() => paciente.recargar()} />}
      {paciente.estado === "listo" && enCola && (
        <section className="rounded-[18px] border border-revisar/60 bg-revisar-fondo p-6 text-revisar-tinta" role="status">
          <CloudOff className="h-8 w-8" aria-hidden="true" />
          <h1 className="mt-3 text-[1.6rem] font-semibold text-tinta">La ficha quedó guardada en el celular</h1>
          <p className="mt-2">
            {fotos.length} {fotos.length === 1 ? "página" : "páginas"} de {paciente.datos.nombre}. Se sube sola cuando vuelva la señal o la IA esté disponible; después la revisas y la confirmas.
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
      )}
      {paciente.estado === "listo" && !enCola && (
        <Captura fotos={fotos} setFotos={setFotos} onLeer={leer} ocupado={subiendo} paciente={paciente.datos.nombre} errorSubida={error} />
      )}
    </Shell>
  );
}

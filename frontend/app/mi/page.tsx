"use client";
/**
 * /mi · paciente. Mi historial: alergias arriba, línea de tiempo, botón "Descargar" con los formatos.
 * Endpoints: GET /pacientes/{id}/expediente, GET /pacientes/{id}/exportar.
 * Regla 4: la paciente solo ve, descarga y comparte. No hay botones de editar.
 */
import { useState } from "react";
import Link from "next/link";
import { Download, KeyRound, LoaderCircle, ScrollText } from "lucide-react";
import { Shell } from "@/components/shell";
import { Boton } from "@/components/ui/button";
import { Cargando, ErrorPantalla, MensajeError } from "@/components/estado";
import { CabeceraPaciente } from "@/components/expediente/cabecera";
import { BannerAlergias, PanelAlertas } from "@/components/expediente/alertas";
import { LineaTiempo } from "@/components/expediente/consultas";
import { api, FORMATOS_EXPORTAR, type FormatoExportar } from "@/lib/api/cliente";
import { aErrorApi } from "@/lib/api/errores";
import { useUsuario } from "@/lib/api/sesion";
import { useDatos } from "@/lib/api/usar";
import { cn } from "@/lib/utils";

const NOMBRES: Record<FormatoExportar, { titulo: string; detalle: string }> = {
  pdf: { titulo: "PDF", detalle: "Para imprimir o mostrar" },
  docx: { titulo: "Word", detalle: ".docx" },
  xlsx: { titulo: "Excel", detalle: ".xlsx" },
  txt: { titulo: "Texto", detalle: ".txt" },
  md: { titulo: "Markdown", detalle: ".md" },
  html: { titulo: "Página web", detalle: ".html" },
  json: { titulo: "Sistemas oficiales", detalle: "JSON para MSPAS (simulado)" },
};

export default function PaginaMiHistorial() {
  const { usuario } = useUsuario();
  const id = usuario.paciente_id!;
  const exp = useDatos(() => api.expediente(id), [id]);

  return (
    <Shell ancho="amplio">
      {exp.estado === "cargando" && <Cargando />}
      {exp.estado === "error" && <ErrorPantalla error={exp.error} onReintentar={() => exp.recargar()} />}
      {exp.estado === "listo" && (
        <>
          <BannerAlergias alergias={exp.datos.alertas.alergias} className="mb-6" />
          <CabeceraPaciente paciente={exp.datos.paciente}>
            <Boton asChild tamaño="lg">
              <Link href="/mi/compartir">
                <KeyRound /> Compartir con un médico
              </Link>
            </Boton>
          </CabeceraPaciente>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section aria-labelledby="titulo-historial" className="min-w-0">
              <h2 id="titulo-historial" className="mb-4 text-[1.4rem] font-semibold">
                Mis consultas
              </h2>
              {exp.datos.consultas.length ? (
                <LineaTiempo consultas={exp.datos.consultas} />
              ) : (
                <div className="papel-kraft esquina-doblada rounded-[16px] p-6 text-kraft-tinta">
                  <ScrollText className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
                  <p className="mt-3 text-[1.1rem] font-semibold text-primario">Todavía no hay consultas</p>
                  <p className="mt-1">Cuando la enfermera digitalice tus fichas de papel, aparecen aquí con la foto original.</p>
                </div>
              )}
            </section>
            <aside className="min-w-0 space-y-6 lg:pt-[3.05rem]">
              <PanelAlertas alertas={exp.datos.alertas} className="sm:grid-cols-1" />
              <Descargar pacienteId={id} />
            </aside>
          </div>
        </>
      )}
    </Shell>
  );
}

function Descargar({ pacienteId }: { pacienteId: string }) {
  const [formato, setFormato] = useState<FormatoExportar>("pdf");
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function bajar() {
    setBajando(true);
    setError(null);
    try {
      const { archivo, nombre } = await api.exportar(pacienteId, formato);
      const url = URL.createObjectURL(archivo);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setError(aErrorApi(e).mensaje);
    } finally {
      setBajando(false);
    }
  }

  return (
    <section aria-labelledby="titulo-descargar" className="rounded-[16px] border border-linea bg-superficie p-4 sm:p-5">
      <h2 id="titulo-descargar" className="text-[1.1rem] font-semibold">
        Descargar mi historial
      </h2>
      <fieldset className="mt-3">
        <legend className="sr-only">Formato</legend>
        <div className="grid grid-cols-2 gap-2">
          {FORMATOS_EXPORTAR.map((f) => (
            <label
              key={f}
              className={cn(
                "flex min-h-14 cursor-pointer flex-col justify-center rounded-[12px] border px-3 py-2 transition-colors",
                f === "json" && "col-span-2",
                formato === f ? "border-primario bg-primario-suave/60" : "border-linea hover:border-linea-fuerte"
              )}
            >
              <input type="radio" name="formato" value={f} checked={formato === f} onChange={() => setFormato(f)} className="sr-only" />
              <span className={cn("font-semibold", formato === f && "text-primario")}>{NOMBRES[f].titulo}</span>
              <span className="text-[0.8rem] text-tinta-tenue">{NOMBRES[f].detalle}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <MensajeError className="mt-3">{error}</MensajeError>}
      <Boton className="mt-4 w-full" onClick={bajar} disabled={bajando}>
        {bajando ? <LoaderCircle className="animate-spin" /> : <Download />} Descargar
      </Boton>
    </section>
  );
}

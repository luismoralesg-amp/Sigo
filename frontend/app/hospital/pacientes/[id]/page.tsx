"use client";
/**
 * /hospital/pacientes/[id] · médico. Expediente: alerta de alergias, línea de tiempo, versiones, asistente y el
 * tiempo que le queda al acceso. En emergencia, solo alergias y condiciones crónicas, con una banda roja arriba.
 * Endpoints: GET /pacientes/{id}/expediente, GET /consultas/{id}/versiones, POST /pacientes/{id}/preguntar.
 * Quinto estado del médico, "el acceso venció": al llegar a acceso_vence_en (o con 403 acceso_vencido)
 * regresa a /hospital, donde se le pide un código nuevo.
 */
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, LoaderCircle, MessageCircleQuestion, Send, Siren, Timer } from "lucide-react";
import type { Expediente, Fuente } from "@/lib/types";
import { Shell } from "@/components/shell";
import { Boton } from "@/components/ui/button";
import { AreaTexto } from "@/components/ui/input";
import { Cargando, ErrorPantalla, MensajeError } from "@/components/estado";
import { CabeceraPaciente } from "@/components/expediente/cabecera";
import { BannerAlergias, PanelAlertas } from "@/components/expediente/alertas";
import { LineaTiempo, VisorOriginal } from "@/components/expediente/consultas";
import { api } from "@/lib/api/cliente";
import { aErrorApi } from "@/lib/api/errores";
import { formatoRestante, useCuentaRegresiva, useDatos } from "@/lib/api/usar";
import { cn } from "@/lib/utils";

const VENCIDO = "/hospital?vencido=1";

export default function PaginaExpedienteMedico({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent(use(params).id);
  const exp = useDatos(() => api.expediente(id), [id]);

  if (exp.estado === "listo") return <Expedientes e={exp.datos} />;
  return (
    <Shell ancho="amplio">
      {exp.estado === "cargando" && <Cargando />}
      {/* 403 acceso_vencido redirige a /hospital desde ErrorPantalla. */}
      {exp.estado === "error" && <ErrorPantalla error={exp.error} onReintentar={() => exp.recargar()} />}
    </Shell>
  );
}

function Expedientes({ e }: { e: Expediente }) {
  const router = useRouter();
  const restante = useCuentaRegresiva(e.acceso_vence_en);
  const emergencia = e.tipo_acceso === "emergencia";
  const vencido = restante === 0;

  useEffect(() => {
    if (vencido) router.replace(VENCIDO);
  }, [vencido, router]);

  const tiempo = restante === null ? null : formatoRestante(restante);
  const banda = emergencia ? (
    <div className="bg-alerta text-white" role="status">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-6">
        <Siren className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="font-semibold">Acceso de emergencia: solo alergias y condiciones crónicas</p>
        {tiempo && (
          <p className="cifra ml-auto font-semibold" aria-label={`Quedan ${tiempo}`}>
            Quedan {tiempo}
          </p>
        )}
      </div>
    </div>
  ) : null;

  if (vencido) return <Shell ancho="amplio" banda={banda}><Cargando filas={1} /></Shell>;

  return (
    <Shell ancho="amplio" banda={banda}>
      <Link href="/hospital" className="-ml-2 mb-3 inline-flex min-h-12 items-center gap-1.5 rounded-[10px] px-2 font-semibold text-tinta-suave hover:text-tinta">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Abrir otro expediente
      </Link>
      <CabeceraPaciente paciente={e.paciente}>
        {!emergencia && tiempo && <TiempoRestante tiempo={tiempo} poco={(restante ?? 0) < 60_000} />}
      </CabeceraPaciente>

      {emergencia ? (
        <section className="mt-6 space-y-4" aria-label="Alertas">
          <BannerAlergias alergias={e.alertas.alergias} />
          <PanelAlertas alertas={e.alertas} sinMedicamentos />
          <p className="tarjeta p-4 text-tinta-suave">Para ver el historial completo, las versiones y el asistente, pide el código a la paciente o a su familia.</p>
        </section>
      ) : (
        <>
          <BannerAlergias alergias={e.alertas.alergias} className="mt-6" />
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section aria-labelledby="titulo-historial" className="min-w-0">
              <h2 id="titulo-historial" className="subtitulo mb-4">
                Historial de consultas
              </h2>
              {e.consultas.length ? (
                <LineaTiempo consultas={e.consultas} corregible={false} />
              ) : (
                <p className="tarjeta p-4 text-tinta-suave">Este expediente todavía no tiene consultas.</p>
              )}
            </section>
            <aside className="min-w-0 space-y-6">
              <PanelAlertas alertas={e.alertas} className="sm:grid-cols-1" />
              <Asistente pacienteId={e.paciente.id} />
            </aside>
          </div>
        </>
      )}
    </Shell>
  );
}

function TiempoRestante({ tiempo, poco }: { tiempo: string; poco: boolean }) {
  return (
    <p className={cn("cifra inline-flex min-h-12 items-center gap-2 rounded-[12px] border px-4 font-semibold", poco ? "border-alerta bg-alerta-fondo text-alerta" : "border-linea bg-superficie text-tinta")} role="timer" aria-live="off">
      <Timer className="h-5 w-5" aria-hidden="true" />
      Acceso: quedan {tiempo}
    </p>
  );
}

type Turno = { pregunta: string; respuesta: string; fuentes: Fuente[] };

function Asistente({ pacienteId }: { pacienteId: string }) {
  const [pregunta, setPregunta] = useState("");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [preguntando, setPreguntando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [original, setOriginal] = useState<Fuente | null>(null);

  async function preguntar(ev: React.FormEvent) {
    ev.preventDefault();
    const q = pregunta.trim();
    if (!q) return setError("Escribe una pregunta.");
    setPreguntando(true);
    setError(null);
    try {
      const r = await api.preguntar(pacienteId, q);
      setTurnos([{ pregunta: q, ...r }, ...turnos]);
      setPregunta("");
    } catch (e) {
      const ea = aErrorApi(e);
      // 403 acceso_vencido lo resuelve la cuenta regresiva; 503 permite reintentar.
      setError(ea.codigo === "ia_no_disponible" ? "El asistente no respondió. Intenta de nuevo." : ea.mensaje);
    } finally {
      setPreguntando(false);
    }
  }

  return (
    <section aria-labelledby="titulo-asistente" className="tarjeta p-4 sm:p-5">
      <h2 id="titulo-asistente" className="subtitulo flex items-center gap-2">
        <MessageCircleQuestion className="h-5 w-5 text-primario" aria-hidden="true" /> Preguntar al asistente
      </h2>
      <p className="mt-1 text-[0.95rem] text-tinta-suave">Responde solo con lo que está en este expediente y cita de dónde sale.</p>
      <form onSubmit={preguntar} className="mt-3 space-y-2.5" noValidate>
        <label htmlFor="pregunta" className="sr-only">
          Pregunta
        </label>
        <AreaTexto id="pregunta" rows={2} value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="¿Cuándo fue su última vacuna?" />
        {error && <MensajeError>{error}</MensajeError>}
        <Boton type="submit" className="w-full" disabled={preguntando}>
          {preguntando ? <LoaderCircle className="animate-spin" /> : <Send />} Preguntar
        </Boton>
      </form>
      {turnos.length > 0 && (
        <ol className="mt-4 space-y-3" aria-live="polite">
          {turnos.map((t, i) => (
            <li key={i} className="rounded-[12px] bg-papel p-3.5">
              <p className="text-[0.95rem] font-semibold text-tinta-suave">{t.pregunta}</p>
              <p className="mt-1">{t.respuesta}</p>
              {t.fuentes.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {t.fuentes.map((f) => (
                    <li key={`${f.consulta_id}-${f.campo}`}>
                      <button onClick={() => setOriginal(f)} className="inline-flex min-h-12 items-center gap-1.5 rounded-[10px] border border-linea bg-superficie px-3 text-[0.9rem] font-semibold text-primario">
                        <FileText className="h-4 w-4" aria-hidden="true" /> Ver original
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      {original && <VisorOriginal url={original.original_url} titulo={`Fuente: ${original.campo}, versión ${original.version}`} abierto onCerrar={() => setOriginal(null)} />}
    </section>
  );
}

"use client";
/**
 * /puesto/pacientes/[id] · enfermera. Consultas del paciente, "Escanear ficha", "Corregir" en cada dato
 * y "Generar código" para la paciente sin smartphone.
 * Endpoints: GET /pacientes/{id}/expediente, POST /consultas/{id}/versiones, POST /pacientes/{id}/versiones,
 * POST /pacientes/{id}/codigos.
 */
import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, KeyRound, LoaderCircle, Pencil, ScrollText, X } from "lucide-react";
import type { Expediente, Paciente } from "@/lib/types";
import { Shell } from "@/components/shell";
import { Boton } from "@/components/ui/button";
import { Entrada, Etiqueta } from "@/components/ui/input";
import { Cargando, ErrorPantalla, MensajeError } from "@/components/estado";
import { CabeceraPaciente } from "@/components/expediente/cabecera";
import { BannerAlergias, PanelAlertas } from "@/components/expediente/alertas";
import { LineaTiempo } from "@/components/expediente/consultas";
import { GenerarCodigo } from "@/components/expediente/codigo";
import { api } from "@/lib/api/cliente";
import { aErrorApi, ErrorApi } from "@/lib/api/errores";
import { useDatos } from "@/lib/api/usar";

export default function PaginaPacientePuesto({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent(use(params).id);
  const exp = useDatos(() => api.expediente(id), [id]);
  const [panel, setPanel] = useState<null | "datos" | "codigo">(null);

  return (
    <Shell ancho="amplio">
      <Link href="/puesto" className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 font-semibold text-tinta-suave hover:text-tinta">
        <ArrowLeft className="h-5 w-5" /> Buscar otro paciente
      </Link>

      {exp.estado === "cargando" && <Cargando />}
      {exp.estado === "error" && (
        <ErrorPantalla error={exp.error} onReintentar={() => exp.recargar()}>
          <Boton asChild variante="secundario">
            <Link href="/puesto">Volver a buscar</Link>
          </Boton>
        </ErrorPantalla>
      )}
      {exp.estado === "listo" && (
        <Contenido
          e={exp.datos}
          panel={panel}
          setPanel={setPanel}
          onPaciente={(p) => exp.poner({ ...exp.datos, paciente: p, alertas: { ...exp.datos.alertas, alergias: p.alergias, condiciones_cronicas: p.condiciones_cronicas } })}
          onRecargar={() => exp.recargar(true)}
        />
      )}
    </Shell>
  );
}

function Contenido({
  e,
  panel,
  setPanel,
  onPaciente,
  onRecargar,
}: {
  e: Expediente;
  panel: null | "datos" | "codigo";
  setPanel: (p: null | "datos" | "codigo") => void;
  onPaciente: (p: Paciente) => void;
  onRecargar: () => void;
}) {
  const captura = `/puesto/pacientes/${encodeURIComponent(e.paciente.id)}/captura?${new URLSearchParams({ nombre: e.paciente.nombre, dpi: e.paciente.dpi })}`;
  return (
    <>
      <CabeceraPaciente paciente={e.paciente}>
        <Boton asChild tamaño="lg">
          <Link href={captura}>
            <Camera /> Escanear ficha
          </Link>
        </Boton>
        <Boton tamaño="lg" variante="secundario" onClick={() => setPanel(panel === "codigo" ? null : "codigo")} aria-expanded={panel === "codigo"}>
          <KeyRound /> Generar código
        </Boton>
      </CabeceraPaciente>

      {panel === "codigo" && (
        <Panel titulo="Código para la paciente sin smartphone" onCerrar={() => setPanel(null)}>
          <p className="mb-4 text-tinta-suave">Genéralo solo si la paciente lo pide. Queda anotado en su bitácora.</p>
          <GenerarCodigo pacienteId={e.paciente.id} para="enfermera" />
        </Panel>
      )}

      <BannerAlergias alergias={e.alertas.alergias} className="mt-6" />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="titulo-consultas" className="min-w-0">
          <h2 id="titulo-consultas" className="mb-4 text-[1.4rem] font-semibold">
            Consultas
          </h2>
          {e.consultas.length ? (
            <LineaTiempo consultas={e.consultas} corregible onCorregida={onRecargar} />
          ) : (
            <div className="papel-kraft esquina-doblada rounded-[16px] p-6 text-kraft-tinta">
              <ScrollText className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
              <p className="mt-3 text-[1.1rem] font-semibold text-primario">Todavía no hay consultas</p>
              <p className="mt-1">Escanea su primera ficha en papel. Lo que lea la IA lo revisas tú antes de guardar.</p>
              <Boton asChild className="mt-4">
                <Link href={captura}>
                  <Camera /> Escanear ficha
                </Link>
              </Boton>
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-4 lg:pt-[3.05rem]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[1.1rem] font-semibold">Datos y alertas</h2>
            {panel !== "datos" && (
              <Boton variante="fantasma" onClick={() => setPanel("datos")}>
                <Pencil /> Corregir
              </Boton>
            )}
          </div>
          {panel === "datos" ? (
            <CorregirPaciente
              p={e.paciente}
              onCancelar={() => setPanel(null)}
              onGuardado={(p) => {
                onPaciente(p);
                setPanel(null);
              }}
            />
          ) : (
            <PanelAlertas alertas={e.alertas} className="sm:grid-cols-1" />
          )}
          <p className="text-[0.88rem] text-tinta-tenue">Datos del paciente en su versión {e.paciente.version}. El DPI no se corrige desde la app.</p>
        </aside>
      </div>
    </>
  );
}

function Panel({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-[18px] border border-linea bg-superficie p-5 shadow-calida sm:p-6" aria-label={titulo}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <h2 className="text-[1.25rem] font-semibold">{titulo}</h2>
        <button onClick={onCerrar} className="-mr-2 -mt-2 grid h-11 w-11 place-items-center rounded-full text-tinta-suave hover:bg-papel" aria-label="Cerrar">
          <X className="h-5 w-5" />
        </button>
      </div>
      {children}
    </section>
  );
}

const aLista = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function CorregirPaciente({ p, onCancelar, onGuardado }: { p: Paciente; onCancelar: () => void; onGuardado: (p: Paciente) => void }) {
  const [v, setV] = useState({ nombre: p.nombre, alergias: p.alergias.join(", "), condiciones: p.condiciones_cronicas.join(", "), motivo: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<ErrorApi | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!v.motivo.trim()) return setError(new ErrorApi(400, "motivo_requerido", "Escribe por qué corriges estos datos."));
    setGuardando(true);
    setError(null);
    try {
      onGuardado(
        await api.corregirPaciente(p.id, {
          nombre: v.nombre.trim(),
          alergias: aLista(v.alergias),
          condiciones_cronicas: aLista(v.condiciones),
          motivo_cambio: v.motivo.trim(),
        })
      );
    } catch (err) {
      setError(aErrorApi(err));
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-3.5 rounded-[16px] border border-linea bg-superficie p-4" aria-label="Corregir datos del paciente">
      <div className="space-y-1.5">
        <Etiqueta htmlFor="c-nombre">Nombre completo</Etiqueta>
        <Entrada id="c-nombre" value={v.nombre} onChange={set("nombre")} />
      </div>
      <div className="space-y-1.5">
        <Etiqueta htmlFor="c-alergias">Alergias, separadas por coma</Etiqueta>
        <Entrada id="c-alergias" value={v.alergias} onChange={set("alergias")} />
      </div>
      <div className="space-y-1.5">
        <Etiqueta htmlFor="c-cond">Condiciones crónicas, separadas por coma</Etiqueta>
        <Entrada id="c-cond" value={v.condiciones} onChange={set("condiciones")} />
      </div>
      <div className="space-y-1.5">
        <Etiqueta htmlFor="c-motivo">Por qué lo corriges</Etiqueta>
        <Entrada id="c-motivo" value={v.motivo} onChange={set("motivo")} placeholder="Alergia confirmada con la paciente" aria-invalid={error?.codigo === "motivo_requerido"} />
      </div>
      {error && <MensajeError>{error.mensaje}</MensajeError>}
      <div className="flex flex-wrap gap-2.5">
        <Boton type="submit" disabled={guardando}>
          {guardando && <LoaderCircle className="animate-spin" />} Guardar como versión {p.version + 1}
        </Boton>
        <Boton type="button" variante="secundario" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

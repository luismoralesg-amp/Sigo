"use client";
/**
 * Revisión de la enfermera. Los campos salen de GET /fichas/{id}.
 * Confianza baja (contrato: "baja"; si viniera un número, menor que 0.8) queda en amarillo
 * y hay que tocarla antes de Confirmar. Confirmar es POST /fichas/{id}/confirmar:
 * crea la consulta en una versión nueva, no pisa una anterior.
 * El historial es GET /consultas/{id}/versiones. No hay botón de borrar.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CircleCheck, FileText, LoaderCircle, ShieldAlert } from "lucide-react";
import type { Campo, Consulta, Expediente, Ficha, Version } from "@/lib/types";
import { Boton, BarraAccion } from "@/components/ui/button";
import { AreaTexto, Entrada } from "@/components/ui/input";
import { MensajeError } from "@/components/estado";
import { HistorialVersiones, VisorOriginal } from "@/components/expediente/consultas";
import { api } from "@/lib/api/cliente";
import { aErrorApi } from "@/lib/api/errores";
import { armarConfirmacion, esConfianzaBaja, planDeConfirmacion, textoDeCampo, type CorreccionPlanConsulta, type CorreccionPlanPaciente } from "@/lib/ficha-revision";
import { cn, fechaCorta, mostrarIdentificador, soloDigitos } from "@/lib/utils";

const rutaPaciente = (id: string) => `/puesto/pacientes/${encodeURIComponent(id)}`;

type Revisable = { valor: string; baja: boolean; revisado: boolean; original: string };

function revisable(c: Campo<string | string[]> | { valor: string | string[] | null; confianza: unknown }): Revisable {
  const valor = textoDeCampo(c.valor);
  const baja = esConfianzaBaja(c.confianza);
  return { valor, baja, revisado: !baja, original: valor };
}

type ConsultaEditable = {
  pagina: number;
  fecha: Revisable;
  motivo: Revisable;
  diagnostico: Revisable;
  tratamiento: Revisable;
  vacunas: Revisable;
};

type CampoDef<K extends string> = { k: K; etiqueta: string; tipo: "fecha" | "texto" | "largo" | "lista" | "sexo" };

const CAMPOS_PACIENTE: CampoDef<"nombre" | "fecha_nacimiento" | "sexo" | "comunidad" | "alergias" | "condiciones_cronicas">[] = [
  { k: "nombre", etiqueta: "Nombre completo", tipo: "texto" },
  { k: "fecha_nacimiento", etiqueta: "Fecha de nacimiento", tipo: "fecha" },
  { k: "sexo", etiqueta: "Sexo", tipo: "sexo" },
  { k: "comunidad", etiqueta: "Comunidad", tipo: "texto" },
  { k: "alergias", etiqueta: "Alergias, separadas por coma", tipo: "lista" },
  { k: "condiciones_cronicas", etiqueta: "Condiciones crónicas, separadas por coma", tipo: "lista" },
];

const CAMPOS_CONSULTA: CampoDef<Exclude<keyof ConsultaEditable, "pagina">>[] = [
  { k: "fecha", etiqueta: "Fecha de la consulta", tipo: "fecha" },
  { k: "motivo", etiqueta: "Motivo", tipo: "texto" },
  { k: "diagnostico", etiqueta: "Diagnóstico", tipo: "largo" },
  { k: "tratamiento", etiqueta: "Tratamiento", tipo: "largo" },
  { k: "vacunas", etiqueta: "Vacunas, separadas por coma", tipo: "lista" },
];

type PacienteEditable = Record<(typeof CAMPOS_PACIENTE)[number]["k"], Revisable>;

type HistorialConsulta = { consulta: Consulta; versiones: Version[] | null };

type Hecho = {
  consultas_creadas: number;
  version: number;
  versionPaciente: number | null;
  versionPacienteAntes: number | null;
  historiales: HistorialConsulta[];
  sinIdentificadores: boolean;
  correccionNoAplicada: boolean;
};

function useDpiPaciente(pacienteId: string, dpiUrl: string | null) {
  const [dpi, setDpi] = useState<string | null>(dpiUrl);
  useEffect(() => {
    let vivo = true;
    api.expediente(pacienteId).then(
      (e) => vivo && setDpi(e.paciente.dpi),
      () => undefined
    );
    return () => {
      vivo = false;
    };
  }, [pacienteId, dpiUrl]);
  return dpi;
}

export function Revision({ ficha, dpiUrl }: { ficha: Ficha; dpiUrl: string | null }) {
  const router = useRouter();
  const ex = ficha.extraccion!;
  const dpiPaciente = useDpiPaciente(ficha.paciente_id, dpiUrl);
  const [paciente, setPaciente] = useState<PacienteEditable>(() => ({
    nombre: revisable(ex.paciente.nombre),
    fecha_nacimiento: revisable(ex.paciente.fecha_nacimiento),
    sexo: revisable(ex.paciente.sexo),
    comunidad: revisable(ex.paciente.comunidad),
    alergias: revisable(ex.paciente.alergias),
    condiciones_cronicas: revisable(ex.paciente.condiciones_cronicas),
  }));
  const [consultas, setConsultas] = useState<ConsultaEditable[]>(() =>
    ex.consultas.map((c) => ({
      pagina: c.pagina,
      fecha: revisable(c.fecha),
      motivo: revisable(c.motivo),
      diagnostico: revisable(c.diagnostico),
      tratamiento: revisable(c.tratamiento),
      vacunas: revisable(c.vacunas),
    }))
  );
  const dpiCampo = ex.paciente.dpi;
  const dpiBaja = esConfianzaBaja(dpiCampo.confianza);
  const [dpiRevisado, setDpiRevisado] = useState(!dpiBaja);
  const [consentimiento, setConsentimiento] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [ampliar, setAmpliar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ campo: "revision" | "consentimiento" | "general"; mensaje: string } | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);

  const dpiLeido = dpiCampo.valor ? soloDigitos(dpiCampo.valor) || dpiCampo.valor : null;
  const dpiNoCoincide = Boolean(dpiLeido && dpiPaciente && dpiLeido !== dpiPaciente);
  const todos = useMemo(
    () => [...Object.values(paciente), ...consultas.flatMap((c) => CAMPOS_CONSULTA.map(({ k }) => c[k]))],
    [paciente, consultas]
  );
  const pendientesCampo = todos.filter((r) => r.baja && !r.revisado).length;
  const dpiPendiente = dpiBaja && !dpiRevisado;
  const pendientes = pendientesCampo + (dpiPendiente ? 1 : 0);
  const correcciones = todos.filter((r) => r.valor.trim() !== r.original.trim()).length;
  const esFoto = ficha.origen === "foto";

  function irAlPrimeroPendiente() {
    const nodo = document.querySelector<HTMLElement>("[data-pendiente='true']");
    nodo?.scrollIntoView({ behavior: "smooth", block: "center" });
    nodo?.querySelector<HTMLElement>("input, textarea, button")?.focus();
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (pendientes) {
      setError({
        campo: "revision",
        mensaje: `Revisa ${pendientes === 1 ? "el dato" : `los ${pendientes} datos`} en amarillo: corrígelo o toca "Está bien".`,
      });
      irAlPrimeroPendiente();
      return;
    }
    if (!paciente.nombre.valor.trim()) return setError({ campo: "general", mensaje: "El nombre no puede quedar vacío." });
    if (!consentimiento) {
      setError({ campo: "consentimiento", mensaje: "Falta el consentimiento de la paciente para guardar su ficha." });
      document.getElementById("consentimiento")?.focus();
      return;
    }
    setEnviando(true);
    setError(null);
    const aCampos = (p: PacienteEditable, cs: ConsultaEditable[]) =>
      armarConfirmacion({
        paciente: {
          nombre: p.nombre.valor,
          fecha_nacimiento: p.fecha_nacimiento.valor,
          sexo: p.sexo.valor,
          comunidad: p.comunidad.valor,
          alergias: p.alergias.valor,
          condiciones_cronicas: p.condiciones_cronicas.valor,
        },
        consultas: cs.map((c) => ({
          fecha: c.fecha.valor,
          motivo: c.motivo.valor,
          diagnostico: c.diagnostico.valor,
          tratamiento: c.tratamiento.valor,
          vacunas: c.vacunas.valor,
          pagina: c.pagina,
        })),
      });
    const actuales = aCampos(paciente, consultas);
    const originales = aCampos(
      {
        nombre: { ...paciente.nombre, valor: paciente.nombre.original },
        fecha_nacimiento: { ...paciente.fecha_nacimiento, valor: paciente.fecha_nacimiento.original },
        sexo: { ...paciente.sexo, valor: paciente.sexo.original },
        comunidad: { ...paciente.comunidad, valor: paciente.comunidad.original },
        alergias: { ...paciente.alergias, valor: paciente.alergias.original },
        condiciones_cronicas: { ...paciente.condiciones_cronicas, valor: paciente.condiciones_cronicas.original },
      },
      consultas.map((c) => ({
        pagina: c.pagina,
        fecha: { ...c.fecha, valor: c.fecha.original },
        motivo: { ...c.motivo, valor: c.motivo.original },
        diagnostico: { ...c.diagnostico, valor: c.diagnostico.original },
        tratamiento: { ...c.tratamiento, valor: c.tratamiento.original },
        vacunas: { ...c.vacunas, valor: c.vacunas.original },
      }))
    );
    const plan = planDeConfirmacion(actuales, originales);
    let antes: Expediente | null = null;
    try {
      antes = await api.expediente(ficha.paciente_id);
    } catch {
      antes = null;
    }
    try {
      const respuesta = await api.confirmarFicha(ficha.id, plan.confirmar);
      const hechoNuevo = await aplicarCorrecciones(ficha.paciente_id, antes, respuesta, plan);
      setHecho(hechoNuevo);
    } catch (err) {
      const ea = aErrorApi(err);
      if (ea.codigo === "ficha_ya_confirmada") return router.push(rutaPaciente(ficha.paciente_id));
      setError({ campo: ea.codigo === "sin_consentimiento" ? "consentimiento" : "general", mensaje: ea.mensaje });
      setEnviando(false);
    }
  }

  if (hecho) return <Guardado ficha={ficha} hecho={hecho} />;

  const original = ficha.originales[esFoto ? pagina : 0];

  return (
    <>
      <Link href={rutaPaciente(ficha.paciente_id)} className="-ml-2 mb-3 inline-flex min-h-12 items-center gap-1.5 rounded-[10px] px-2 font-semibold text-tinta-suave hover:text-tinta">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Volver al paciente
      </Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
        <section aria-label="Original" className="lg:sticky lg:top-4">
          {esFoto ? (
            <>
              <div className="tarjeta overflow-hidden">
                {original ? (
                  <button type="button" onClick={() => setAmpliar(true)} className="block w-full" aria-label={`Ampliar la página ${pagina + 1} de la ficha`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={original} alt={`Página ${pagina + 1} de la ficha`} className="mx-auto max-h-[28dvh] w-auto sm:max-h-[36dvh] lg:max-h-[78dvh]" />
                  </button>
                ) : (
                  <p className="p-4 text-tinta-suave">Esta ficha no trajo la foto original.</p>
                )}
              </div>
              <p className="mt-2 text-[0.92rem] text-tinta-suave lg:hidden">Toca la foto para ampliarla y compararla con lo leído.</p>
              {ficha.originales.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Páginas">
                  {ficha.originales.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={i === pagina}
                      onClick={() => setPagina(i)}
                      className={cn("min-h-12 rounded-[12px] border px-4 font-semibold", i === pagina ? "border-primario bg-primario text-white" : "border-linea bg-superficie text-tinta")}
                    >
                      Página {i + 1}
                    </button>
                  ))}
                </div>
              )}
              {original && (
                <VisorOriginal url={original} titulo={`Página ${pagina + 1} de la ficha`} abierto={ampliar} onCerrar={() => setAmpliar(false)} />
              )}
            </>
          ) : (
            <div className="tarjeta p-4">
              <FileText className="h-6 w-6 text-primario" aria-hidden="true" />
              <p className="mt-2 font-semibold">Importado de un archivo del sistema anterior</p>
              <p className="mt-1 text-tinta-suave">Cada consulta dice de qué fila del archivo salió. El archivo original queda guardado.</p>
              {original && (
                <a href={original} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-12 items-center font-semibold text-primario underline underline-offset-4">
                  Abrir el archivo original
                </a>
              )}
            </div>
          )}
        </section>

        <form id="form-ficha" onSubmit={confirmar} noValidate className="min-w-0 space-y-5">
          <div>
            <h1 className="titulo">Revisar lo que se leyó</h1>
            <p className="mt-1.5 text-tinta-suave">
              Lo amarillo es confianza baja. Corrígela o marca que está bien, y después toca Confirmar. Sin ese botón la ficha no entra al expediente.
            </p>
            <p className="mt-3 flex flex-wrap gap-2" aria-live="polite">
              {pendientes ? (
                <button type="button" onClick={irAlPrimeroPendiente} className="etiqueta-dudoso min-h-12 px-4">
                  {pendientes} {pendientes === 1 ? "dato" : "datos"} por revisar
                </button>
              ) : (
                <span className="etiqueta-ok">Todo revisado</span>
              )}
              {correcciones > 0 && (
                <span className="etiqueta-ok">
                  {correcciones === 1 ? "1 corrección" : `${correcciones} correcciones`} · versión nueva al confirmar
                </span>
              )}
            </p>
          </div>

          <fieldset className="tarjeta p-4 sm:p-5">
            <legend className="subtitulo px-1">Paciente</legend>
            <div
              data-pendiente={dpiPendiente || undefined}
              className={cn(
                "mb-4 scroll-mb-36 rounded-[12px] px-3.5 py-3",
                dpiNoCoincide ? "aviso-alerta" : dpiPendiente ? "border border-revisar bg-revisar-fondo" : "bg-papel"
              )}
              role={dpiNoCoincide ? "alert" : undefined}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="etiqueta-campo">DPI en la ficha</p>
                <MarcaConfianza baja={dpiBaja} revisado={dpiRevisado} />
              </div>
              <p className={cn("cifra text-[1.15rem] font-semibold", dpiNoCoincide && "text-alerta")}>{dpiLeido ? mostrarIdentificador(dpiLeido) : "No se leyó"}</p>
              {dpiNoCoincide && (
                <p className="mt-1.5 flex gap-2 text-tinta">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-alerta" aria-hidden="true" />
                  <span>
                    No coincide con la paciente (<span className="cifra font-semibold">{mostrarIdentificador(dpiPaciente)}</span>). Revisa que sea la ficha correcta antes de confirmar.
                  </span>
                </p>
              )}
              {!dpiLeido && <p className="mt-1 text-[0.95rem] text-tinta-suave">Se guarda con la paciente que elegiste antes de escanear. El DPI no se escribe aquí.</p>}
              {dpiLeido && <p className="mt-1 text-[0.95rem] text-tinta-suave">El DPI no se corrige desde la app.</p>}
              {dpiPendiente && (
                <>
                  <p className="mt-1.5 text-[0.95rem] text-revisar-tinta">Lectura dudosa del DPI. Compárala con el original.</p>
                  <button type="button" onClick={() => setDpiRevisado(true)} className="mt-2 min-h-12 w-full rounded-[12px] border border-revisar bg-superficie px-4 font-semibold text-revisar-tinta sm:w-auto">
                    Está bien
                  </button>
                </>
              )}
            </div>
            <div className="grid gap-4">
              {CAMPOS_PACIENTE.map(({ k, etiqueta, tipo }) => (
                <CampoRevisable key={k} id={`p-${k}`} etiqueta={etiqueta} tipo={tipo} r={paciente[k]} onCambio={(r) => setPaciente({ ...paciente, [k]: r })} />
              ))}
            </div>
          </fieldset>

          {consultas.map((c, i) => (
            <fieldset key={i} className="tarjeta p-4 sm:p-5">
              <legend className="subtitulo px-1">
                {consultas.length > 1 ? `Consulta ${i + 1} de ${consultas.length}` : "Consulta"}
                <span className="ml-2 font-sans text-[0.95rem] font-normal text-tinta-suave">{esFoto ? `página ${c.pagina + 1}` : `fila ${c.pagina + 2} del archivo`}</span>
              </legend>
              <div className="grid gap-4">
                {CAMPOS_CONSULTA.map(({ k, etiqueta, tipo }) => (
                  <CampoRevisable
                    key={k}
                    id={`c${i}-${k}`}
                    etiqueta={etiqueta}
                    tipo={tipo}
                    r={c[k]}
                    onCambio={(r) => setConsultas(consultas.map((x, j) => (j === i ? { ...x, [k]: r } : x)))}
                    onFoco={() => esFoto && setPagina(Math.min(c.pagina, ficha.originales.length - 1))}
                  />
                ))}
              </div>
            </fieldset>
          ))}

          <div className="scroll-mb-36">
            <label className={cn("tarjeta flex min-h-14 cursor-pointer items-start gap-3 p-4", error?.campo === "consentimiento" && "!border-alerta")}>
              <input
                id="consentimiento"
                type="checkbox"
                checked={consentimiento}
                onChange={(e) => setConsentimiento(e.target.checked)}
                className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--primario)]"
                aria-describedby={error?.campo === "consentimiento" ? "error-consentimiento" : undefined}
              />
              <span>
                <span className="block font-semibold">La paciente aceptó que su ficha se guarde en Sigo</span>
                <span className="block text-tinta-suave">Ella decide quién ve su historial. Nada se borra: una corrección suma una versión.</span>
              </span>
            </label>
            {error?.campo === "consentimiento" && (
              <MensajeError id="error-consentimiento" className="mt-2">
                {error.mensaje}
              </MensajeError>
            )}
          </div>
          {error && error.campo !== "consentimiento" && <MensajeError>{error.mensaje}</MensajeError>}
        </form>
      </div>

      <BarraAccion>
        <Boton type="submit" form="form-ficha" tamaño="accion" disabled={enviando}>
          {enviando ? <LoaderCircle className="animate-spin" /> : <Check />} Confirmar y guardar
        </Boton>
      </BarraAccion>
    </>
  );
}

const MOTIVO_REVISION = "Corregido al revisar la ficha";

function mismaConsulta(
  consulta: Consulta,
  original: { fecha: string | null; motivo: string | null; diagnostico: string | null; tratamiento: string | null; vacunas: string[] }
) {
  return (
    consulta.fecha === original.fecha &&
    consulta.motivo === original.motivo &&
    consulta.diagnostico === original.diagnostico &&
    consulta.tratamiento === original.tratamiento &&
    consulta.vacunas.length === original.vacunas.length &&
    consulta.vacunas.every((v, i) => v === original.vacunas[i])
  );
}

async function aplicarCorrecciones(
  pacienteId: string,
  antes: Expediente | null,
  respuesta: { consultas_creadas: number; version: number },
  plan: { confirmar: { consultas: Array<{ fecha: string | null; motivo: string | null; diagnostico: string | null; tratamiento: string | null; vacunas: string[] }> }; paciente: CorreccionPlanPaciente | null; consultas: Array<CorreccionPlanConsulta | null> }
): Promise<Hecho> {
  let despues: Expediente | null = null;
  try {
    despues = await api.expediente(pacienteId);
  } catch {
    despues = null;
  }
  const idsAntes = new Set(antes?.consultas.map((c) => c.id) ?? []);
  const libres = antes && despues ? despues.consultas.filter((c) => !idsAntes.has(c.id)) : [];
  const historiales: HistorialConsulta[] = [];
  let correccionNoAplicada = false;
  let versionMostrada = respuesta.version;

  for (let i = 0; i < plan.confirmar.consultas.length; i++) {
    const original = plan.confirmar.consultas[i];
    const correccion = plan.consultas[i];
    const idx = libres.findIndex((c) => mismaConsulta(c, original));
    if (idx < 0) {
      if (correccion) correccionNoAplicada = true;
      continue;
    }
    let consulta = libres.splice(idx, 1)[0];
    if (correccion) {
      try {
        consulta = await api.corregirConsulta(consulta.id, { ...correccion, motivo_cambio: MOTIVO_REVISION });
        versionMostrada = consulta.version;
      } catch {
        correccionNoAplicada = true;
      }
    }
    try {
      const r = await api.versionesConsulta(consulta.id);
      historiales.push({ consulta, versiones: r.versiones });
    } catch {
      historiales.push({ consulta, versiones: null });
    }
  }

  let versionPaciente = despues?.paciente.version ?? null;
  if (plan.paciente) {
    try {
      const paciente = await api.corregirPaciente(pacienteId, { ...plan.paciente, motivo_cambio: MOTIVO_REVISION });
      versionPaciente = paciente.version;
    } catch {
      correccionNoAplicada = true;
    }
  }

  return {
    consultas_creadas: respuesta.consultas_creadas,
    version: versionMostrada,
    versionPaciente,
    versionPacienteAntes: antes?.paciente.version ?? null,
    historiales,
    sinIdentificadores: respuesta.consultas_creadas > 0 && historiales.length === 0,
    correccionNoAplicada,
  };
}

function Guardado({ ficha, hecho }: { ficha: Ficha; hecho: Hecho }) {
  const subioPaciente =
    hecho.versionPaciente !== null && hecho.versionPacienteAntes !== null && hecho.versionPaciente > hecho.versionPacienteAntes;
  return (
    <div className="mx-auto max-w-lg">
      <div className="text-center" role="status">
        <CircleCheck className="mx-auto h-12 w-12 text-confirmado" aria-hidden="true" />
        <h1 className="titulo mt-4">Guardado en el expediente</h1>
        <p className="mt-2 text-tinta-suave">
          {hecho.consultas_creadas} {hecho.consultas_creadas === 1 ? "consulta nueva" : "consultas nuevas"}.
          {hecho.version > 1
            ? ` La corrección quedó como versión ${hecho.version}. La lectura anterior sigue en el historial.`
            : ` Quedó como versión ${hecho.version}.`}{" "}
          La foto original queda junto al dato. No se borró nada.
        </p>
      </div>

      {hecho.correccionNoAplicada && (
        <p className="aviso-alerta mt-5 px-3.5 py-3" role="alert">
          La ficha quedó confirmada, pero una corrección no se guardó como versión nueva. Ábrela en el expediente y corrígela desde ahí: tampoco se borra.
        </p>
      )}

      {subioPaciente && (
        <p className="tarjeta mt-5 p-4 text-[0.98rem]">
          Los datos de la paciente pasaron a la versión {hecho.versionPaciente}. La anterior sigue guardada. El contrato no trae el listado de
          esas versiones, solo el número vigente.
        </p>
      )}

      {hecho.historiales.length > 0 && (
        <section className="mt-5 space-y-4" aria-label="Versiones de lo que acabas de confirmar">
          {hecho.historiales.map(({ consulta, versiones }) => (
            <article key={consulta.id} className="tarjeta p-4">
              <h2 className="font-semibold">
                Consulta del {fechaCorta(consulta.fecha)} · versión {consulta.version}
              </h2>
              <p className="mt-1 text-tinta-suave">{[consulta.motivo, consulta.diagnostico].filter(Boolean).join(" · ") || "Sin motivo leído"}</p>
              {versiones ? (
                <HistorialVersiones versiones={versiones} />
              ) : (
                <p className="mt-3 text-tinta-suave">No se pudo leer el historial de esta consulta. El dato sí quedó guardado; ábrelo en el expediente.</p>
              )}
            </article>
          ))}
        </section>
      )}

      {hecho.sinIdentificadores && (
        <p className="tarjeta mt-5 p-4 text-tinta-suave">
          Confirmar no devuelve el identificador de cada consulta. No pude comparar el expediente para listar el historial aquí. Está en el
          expediente de la paciente.
        </p>
      )}

      <BarraAccion>
        <Boton asChild tamaño="accion">
          <Link href={rutaPaciente(ficha.paciente_id)}>Ver expediente</Link>
        </Boton>
      </BarraAccion>
    </div>
  );
}

function MarcaConfianza({ baja, revisado }: { baja: boolean; revisado: boolean }) {
  if (!baja) return <span className="text-[0.88rem] font-semibold text-confirmado">Confianza alta</span>;
  if (!revisado) return <span className="etiqueta-dudoso">Revisar · confianza baja</span>;
  return (
    <span className="flex items-center gap-1 text-[0.9rem] font-semibold text-confirmado">
      <Check className="h-4 w-4" aria-hidden="true" /> Revisado
    </span>
  );
}

function CampoRevisable({
  id,
  etiqueta,
  r,
  onCambio,
  tipo,
  onFoco,
}: {
  id: string;
  etiqueta: string;
  r: Revisable;
  onCambio: (r: Revisable) => void;
  tipo: "fecha" | "texto" | "largo" | "lista" | "sexo";
  onFoco?: () => void;
}) {
  const pendiente = r.baja && !r.revisado;
  const corregido = r.valor.trim() !== r.original.trim();
  const cambiar = (valor: string) => onCambio({ ...r, valor, revisado: true });
  const clase = cn(pendiente && "!border-revisar bg-superficie", tipo === "fecha" && "cifra");
  const ayuda = pendiente ? `${id}-ayuda` : corregido ? `${id}-version` : undefined;
  return (
    <div
      data-pendiente={pendiente || undefined}
      className={cn("scroll-mb-36 space-y-1.5 rounded-[12px] p-3", pendiente ? "border border-revisar bg-revisar-fondo" : "border border-transparent")}
    >
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        {tipo === "sexo" ? (
          <span id={`${id}-etiqueta`} className="etiqueta-campo">
            {etiqueta}
          </span>
        ) : (
          <label htmlFor={id} className="etiqueta-campo">
            {etiqueta}
          </label>
        )}
        <MarcaConfianza baja={r.baja} revisado={r.revisado} />
      </div>
      {tipo === "sexo" ? (
        <div className="flex gap-2" role="radiogroup" aria-labelledby={`${id}-etiqueta`} aria-describedby={ayuda}>
          {(["F", "M"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={r.valor === s}
              onFocus={onFoco}
              onClick={() => cambiar(s)}
              className={cn(
                "min-h-[52px] flex-1 rounded-[12px] border font-semibold",
                r.valor === s ? "border-primario bg-primario-suave text-primario" : pendiente ? "border-revisar bg-superficie text-tinta" : "border-linea-fuerte bg-superficie text-tinta-suave"
              )}
            >
              {s === "F" ? "Femenino" : "Masculino"}
            </button>
          ))}
        </div>
      ) : tipo === "largo" ? (
        <AreaTexto id={id} rows={2} value={r.valor} onFocus={onFoco} onChange={(e) => cambiar(e.target.value)} aria-describedby={ayuda} placeholder={r.baja && !r.valor ? "No se pudo leer. Escríbelo si aparece." : undefined} className={clase} />
      ) : (
        <Entrada
          id={id}
          type={tipo === "fecha" ? "date" : "text"}
          value={r.valor}
          onFocus={onFoco}
          onChange={(e) => cambiar(e.target.value)}
          aria-describedby={ayuda}
          placeholder={r.baja && !r.valor ? "No se pudo leer. Escríbelo si aparece." : undefined}
          className={clase}
        />
      )}
      {pendiente && (
        <>
          <p id={ayuda} className="text-[0.95rem] text-revisar-tinta">
            Lectura dudosa. Compárala con el original.
          </p>
          <button type="button" onClick={() => onCambio({ ...r, revisado: true })} className="min-h-12 w-full rounded-[12px] border border-revisar bg-superficie px-4 font-semibold text-revisar-tinta sm:w-auto">
            Está bien
          </button>
        </>
      )}
      {corregido && (
        <p id={pendiente ? undefined : `${id}-version`} className="text-[0.95rem] font-semibold text-confirmado">
          Corregido. Al confirmar queda en una versión nueva; lo anterior no se borra.
        </p>
      )}
    </div>
  );
}

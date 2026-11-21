"use client";
/**
 * /puesto/fichas/[id] · enfermera. Revisión: foto o fila original a la izquierda, campos a la derecha,
 * dudosos en amarillo, consentimiento, confirmar.
 * Endpoints: GET /fichas/{id} (cada 2 s, hasta 60 s, mientras esté en "procesando"), POST /fichas/{id}/confirmar.
 * Regla 2: nada entra al expediente sin esta confirmación. Confirmar manda el paciente completo salvo el dpi.
 *
 * La Ficha no trae el DPI del paciente, y hace falta para marcar en rojo si la IA leyó otro. Llega por la URL
 * (?dpi=) desde la captura o desde importar; si falta, se lee del expediente.
 */
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, CircleCheck, FileText, LoaderCircle, ShieldAlert, TriangleAlert } from "lucide-react";
import type { Campo, Ficha } from "@/lib/types";
import { Shell } from "@/components/shell";
import { Boton, BarraAccion } from "@/components/ui/button";
import { AreaTexto, Entrada } from "@/components/ui/input";
import { Cargando, ErrorPantalla, MensajeError } from "@/components/estado";
import { api, type ConfirmarFicha } from "@/lib/api/cliente";
import { aErrorApi, type ErrorApi } from "@/lib/api/errores";
import { cn, mostrarIdentificador, soloDigitos } from "@/lib/utils";

const INTERVALO = 2000;
const LIMITE = 60_000;

type Estado =
  | { tipo: "cargando" }
  | { tipo: "error"; error: ErrorApi }
  | { tipo: "procesando"; ficha: Ficha; agotado: boolean }
  | { tipo: "ficha"; ficha: Ficha };

const rutaPaciente = (id: string) => `/puesto/pacientes/${encodeURIComponent(id)}`;

export default function PaginaFicha({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent(use(params).id);
  return (
    <Shell ancho="amplio">
      <Suspense>
        <Contenido id={id} />
      </Suspense>
    </Shell>
  );
}

function Contenido({ id }: { id: string }) {
  const dpiUrl = useSearchParams().get("dpi");
  const [s, setS] = useState<Estado>({ tipo: "cargando" });
  const inicio = useRef(Date.now());
  const vivo = useRef(true);

  const consultar = useCallback(async () => {
    try {
      const f = await api.obtenerFicha(id);
      if (f.estado === "procesando") {
        const agotado = Date.now() - inicio.current >= LIMITE;
        setS({ tipo: "procesando", ficha: f, agotado });
        return !agotado;
      }
      setS({ tipo: "ficha", ficha: f });
    } catch (e) {
      setS({ tipo: "error", error: aErrorApi(e) });
    }
    return false;
  }, [id]);

  const ciclo = useCallback(async () => {
    if ((await consultar()) && vivo.current) setTimeout(() => vivo.current && void ciclo(), INTERVALO);
  }, [consultar]);

  useEffect(() => {
    vivo.current = true;
    inicio.current = Date.now();
    void ciclo();
    return () => {
      vivo.current = false;
    };
  }, [ciclo]);

  const reintentar = () => {
    inicio.current = Date.now();
    setS({ tipo: "cargando" });
    void ciclo();
  };

  if (s.tipo === "cargando") return <Cargando />;
  if (s.tipo === "error") return <ErrorPantalla error={s.error} onReintentar={reintentar} />;
  if (s.tipo === "procesando") return <Procesando ficha={s.ficha} agotado={s.agotado} onReintentar={reintentar} />;
  const f = s.ficha;
  if (f.estado === "confirmada") return <Final ficha={f} titulo="Esta ficha ya se confirmó" texto="Sus datos ya están en el expediente. Si algo quedó mal, corrígelo desde el paciente: se guarda como versión nueva." />;
  if (f.estado === "error" || !f.extraccion) return <FichaConError ficha={f} />;
  return <Revision ficha={f} dpiUrl={dpiUrl} />;
}

// ---------------------------------------------------------------- estados de la ficha

function Procesando({ ficha, agotado, onReintentar }: { ficha: Ficha; agotado: boolean; onReintentar: () => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="tarjeta overflow-hidden">
        {ficha.originales[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ficha.originales[0]} alt="Ficha que se está leyendo" className="mx-auto max-h-[40dvh] w-auto lg:max-h-[70dvh]" />
        )}
      </div>
      <div role="status" aria-live="polite">
        <h1 className="titulo">{agotado ? "La lectura está tardando" : "Leyendo la ficha…"}</h1>
        {!agotado && (
          <div className="mt-4 h-1.5 w-40 overflow-hidden rounded-full bg-linea" aria-hidden="true">
            <div className="h-full w-1/3 animate-[deslizar_1.1s_ease-in-out_infinite] rounded-full bg-primario" />
          </div>
        )}
        <p className="mt-3 text-tinta-suave">
          {agotado
            ? "Puedes esperar aquí o volver al paciente; la ficha te espera en “Fichas por revisar”."
            : `${ficha.originales.length} ${ficha.originales.length === 1 ? "página" : "páginas"}. Cuando termine, revisas cada dato antes de guardar.`}
        </p>
        {agotado && (
          <BarraAccion>
            <Boton tamaño="accion" onClick={onReintentar}>
              Volver a consultar
            </Boton>
          </BarraAccion>
        )}
      </div>
    </div>
  );
}

function Final({ ficha, titulo, texto }: { ficha: Ficha; titulo: string; texto: string }) {
  return (
    <div className="mx-auto max-w-md pt-6 text-center" role="status">
      <CircleCheck className="mx-auto h-12 w-12 text-confirmado" aria-hidden="true" />
      <h1 className="titulo mt-4">{titulo}</h1>
      <p className="mt-2 text-tinta-suave">{texto}</p>
      <BarraAccion>
        <Boton asChild tamaño="accion">
          <Link href={rutaPaciente(ficha.paciente_id)}>Ver expediente</Link>
        </Boton>
      </BarraAccion>
    </div>
  );
}

function FichaConError({ ficha }: { ficha: Ficha }) {
  return (
    <div className="mx-auto max-w-md pt-6 text-center" role="alert">
      <TriangleAlert className="mx-auto h-12 w-12 text-revisar-tinta" aria-hidden="true" />
      <h1 className="titulo mt-4">No se pudo leer esta ficha</h1>
      <p className="mt-2 text-tinta-suave">{ficha.error ?? ficha.extraccion?.error ?? "Toma la foto otra vez, con más luz."}</p>
      <BarraAccion>
        <Boton asChild tamaño="accion">
          <Link href={`${rutaPaciente(ficha.paciente_id)}/captura`}>Tomar la foto otra vez</Link>
        </Boton>
      </BarraAccion>
    </div>
  );
}

// ---------------------------------------------------------------- revisión

type Revisable = { valor: string; baja: boolean; revisado: boolean };
const revisable = (c: Campo<string | string[]>): Revisable => {
  const v = c.valor;
  return { valor: Array.isArray(v) ? v.join(", ") : v ?? "", baja: c.confianza === "baja", revisado: c.confianza === "alta" };
};
type ConsultaEditable = { pagina: number; fecha: Revisable; motivo: Revisable; diagnostico: Revisable; tratamiento: Revisable; vacunas: Revisable };
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
const aLista = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
type PacienteEditable = Record<(typeof CAMPOS_PACIENTE)[number]["k"], Revisable>;

/** DPI del paciente de la ficha: de la URL, o del expediente si no vino. */
function useDpiPaciente(pacienteId: string, dpiUrl: string | null) {
  const [dpi, setDpi] = useState<string | null>(dpiUrl);
  useEffect(() => {
    if (dpiUrl) return;
    let vivo = true;
    api.expediente(pacienteId).then((e) => vivo && setDpi(e.paciente.dpi), () => undefined);
    return () => {
      vivo = false;
    };
  }, [pacienteId, dpiUrl]);
  return dpi;
}

function Revision({ ficha, dpiUrl }: { ficha: Ficha; dpiUrl: string | null }) {
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
    ex.consultas.map((c) => ({ pagina: c.pagina, fecha: revisable(c.fecha), motivo: revisable(c.motivo), diagnostico: revisable(c.diagnostico), tratamiento: revisable(c.tratamiento), vacunas: revisable(c.vacunas) }))
  );
  const [consentimiento, setConsentimiento] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ campo: "revision" | "consentimiento" | "general"; mensaje: string } | null>(null);
  const [hecho, setHecho] = useState<{ consultas_creadas: number; version: number } | null>(null);

  const dpiLeido = ex.paciente.dpi.valor ? soloDigitos(ex.paciente.dpi.valor) || ex.paciente.dpi.valor : null;
  const dpiNoCoincide = Boolean(dpiLeido && dpiPaciente && dpiLeido !== dpiPaciente);
  const todos = useMemo(() => [...Object.values(paciente), ...consultas.flatMap((c) => CAMPOS_CONSULTA.map(({ k }) => c[k]))], [paciente, consultas]);
  const pendientes = todos.filter((r) => r.baja && !r.revisado).length;
  const esFoto = ficha.origen === "foto";

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (pendientes) {
      setError({ campo: "revision", mensaje: `Revisa ${pendientes === 1 ? "el dato" : `los ${pendientes} datos`} en amarillo: corrígelo o toca "Está bien".` });
      document.querySelector<HTMLElement>("[data-pendiente='true'] input, [data-pendiente='true'] textarea, [data-pendiente='true'] button")?.focus();
      return;
    }
    if (!paciente.nombre.valor.trim()) return setError({ campo: "general", mensaje: "El nombre no puede quedar vacío." });
    if (!consentimiento) return setError({ campo: "consentimiento", mensaje: "Falta el consentimiento de la paciente para guardar su ficha." });
    setEnviando(true);
    setError(null);
    const sexo = paciente.sexo.valor === "F" || paciente.sexo.valor === "M" ? paciente.sexo.valor : null;
    const cuerpo: ConfirmarFicha = {
      paciente: {
        nombre: paciente.nombre.valor.trim(),
        fecha_nacimiento: paciente.fecha_nacimiento.valor || null,
        sexo,
        comunidad: paciente.comunidad.valor.trim() || null,
        alergias: aLista(paciente.alergias.valor),
        condiciones_cronicas: aLista(paciente.condiciones_cronicas.valor),
      },
      consultas: consultas.map((c) => ({
        fecha: c.fecha.valor || null,
        motivo: c.motivo.valor || null,
        diagnostico: c.diagnostico.valor || null,
        tratamiento: c.tratamiento.valor || null,
        vacunas: aLista(c.vacunas.valor),
        pagina: c.pagina,
      })),
      consentimiento: true,
    };
    try {
      setHecho(await api.confirmarFicha(ficha.id, cuerpo));
    } catch (err) {
      const ea = aErrorApi(err);
      if (ea.codigo === "ficha_ya_confirmada") return router.push(rutaPaciente(ficha.paciente_id));
      setError({ campo: ea.codigo === "sin_consentimiento" ? "consentimiento" : "general", mensaje: ea.mensaje });
      setEnviando(false);
    }
  }

  if (hecho)
    return (
      <Final
        ficha={ficha}
        titulo="Guardado en el expediente"
        texto={`${hecho.consultas_creadas} ${hecho.consultas_creadas === 1 ? "consulta nueva" : "consultas nuevas"}, como versión ${hecho.version}. El original queda guardado junto a cada dato.`}
      />
    );

  const original = ficha.originales[esFoto ? pagina : 0];

  return (
    <>
      <Link href={rutaPaciente(ficha.paciente_id)} className="-ml-2 mb-3 inline-flex min-h-12 items-center gap-1.5 rounded-[10px] px-2 font-semibold text-tinta-suave hover:text-tinta">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Volver al paciente
      </Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
        {/* Original */}
        <section aria-label="Original" className="lg:sticky lg:top-4">
          {esFoto ? (
            <>
              <div className="tarjeta overflow-hidden">
                {original && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={original} alt={`Página ${pagina + 1} de la ficha`} className="mx-auto max-h-[44dvh] w-auto lg:max-h-[78dvh]" />
                )}
              </div>
              {ficha.originales.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Páginas">
                  {ficha.originales.map((_, i) => (
                    <button
                      key={i}
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

        {/* Campos */}
        <form id="form-ficha" onSubmit={confirmar} noValidate className="min-w-0 space-y-5">
          <div>
            <h1 className="titulo">Revisar lo que se leyó</h1>
            <p className="mt-1.5" aria-live="polite">
              {pendientes ? (
                <span className="etiqueta-dudoso">
                  {pendientes} {pendientes === 1 ? "dato dudoso" : "datos dudosos"} por revisar
                </span>
              ) : (
                <span className="etiqueta-ok">Todo revisado</span>
              )}
            </p>
          </div>

          <fieldset className="tarjeta p-4 sm:p-5">
            <legend className="subtitulo px-1">Paciente</legend>
            <div className={cn("mb-4 rounded-[12px] px-3.5 py-3", dpiNoCoincide ? "aviso-alerta" : "bg-papel")} role={dpiNoCoincide ? "alert" : undefined}>
              <p className="etiqueta-campo">DPI en la ficha</p>
              <p className={cn("cifra text-[1.15rem] font-semibold", dpiNoCoincide && "text-alerta")}>{dpiLeido ? mostrarIdentificador(dpiLeido) : "No se leyó"}</p>
              {dpiNoCoincide && (
                <p className="mt-1.5 flex gap-2 text-tinta">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-alerta" aria-hidden="true" />
                  <span>
                    No coincide con el paciente (<span className="cifra font-semibold">{mostrarIdentificador(dpiPaciente)}</span>). Revisa que sea la ficha correcta antes de confirmar.
                  </span>
                </p>
              )}
              {!dpiLeido && <p className="mt-1 text-[0.95rem] text-tinta-suave">Se guarda con el paciente que elegiste antes de escanear.</p>}
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

          <div>
            <label className={cn("tarjeta flex min-h-14 cursor-pointer items-start gap-3 p-4", error?.campo === "consentimiento" && "!border-alerta")}>
              <input
                type="checkbox"
                checked={consentimiento}
                onChange={(e) => setConsentimiento(e.target.checked)}
                className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--primario)]"
                aria-describedby={error?.campo === "consentimiento" ? "error-consentimiento" : undefined}
              />
              <span>
                <span className="block font-semibold">La paciente aceptó que su ficha se guarde en Sigo</span>
                <span className="block text-tinta-suave">Ella decide quién ve su historial, y nada se borra.</span>
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
  const cambiar = (valor: string) => onCambio({ ...r, valor, revisado: true });
  const clase = cn(pendiente && "!border-revisar bg-revisar-fondo", tipo === "fecha" && "cifra");
  const ayuda = pendiente ? `${id}-ayuda` : undefined;
  return (
    <div data-pendiente={pendiente} className="space-y-1.5">
      <div className="flex min-h-9 items-center justify-between gap-2">
        {tipo === "sexo" ? (
          <span id={`${id}-etiqueta`} className="etiqueta-campo">
            {etiqueta}
          </span>
        ) : (
          <label htmlFor={id} className="etiqueta-campo">
            {etiqueta}
          </label>
        )}
        {r.baja &&
          (pendiente ? (
            <button type="button" onClick={() => onCambio({ ...r, revisado: true })} className="etiqueta-dudoso min-h-10 border border-revisar">
              Está bien
            </button>
          ) : (
            <span className="flex items-center gap-1 text-[0.9rem] font-semibold text-confirmado">
              <Check className="h-4 w-4" aria-hidden="true" /> Revisado
            </span>
          ))}
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
                r.valor === s ? "border-primario bg-primario-suave text-primario" : pendiente ? "border-revisar bg-revisar-fondo text-tinta" : "border-linea-fuerte bg-superficie text-tinta-suave"
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
        <p id={ayuda} className="text-[0.95rem] text-revisar-tinta">
          Lectura dudosa. Compárala con el original.
        </p>
      )}
    </div>
  );
}

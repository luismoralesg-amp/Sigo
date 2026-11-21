"use client";
/**
 * /puesto/fichas/[id] · enfermera. Revisión: foto o fila original a la izquierda, campos a la derecha,
 * dudosos en amarillo, consentimiento, confirmar.
 * Endpoints: GET /fichas/{id} (cada 2 s, hasta 60 s, mientras esté en "procesando"), POST /fichas/{id}/confirmar.
 * Regla 2: nada entra al expediente sin esta confirmación.
 */
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CircleCheck, FileText, LoaderCircle, ScanLine, ShieldAlert, TriangleAlert } from "lucide-react";
import type { Campo, Ficha } from "@/lib/types";
import { Shell } from "@/components/shell";
import { Boton } from "@/components/ui/button";
import { AreaTexto, Entrada } from "@/components/ui/input";
import { Cargando, ErrorPantalla, MensajeError } from "@/components/estado";
import { api, type ConfirmarFicha } from "@/lib/api/cliente";
import { aErrorApi, type ErrorApi } from "@/lib/api/errores";
import { cn, fechaCorta, mostrarIdentificador, soloDigitos } from "@/lib/utils";

const INTERVALO = 2000;
const LIMITE = 60_000;

type Estado =
  | { tipo: "cargando" }
  | { tipo: "error"; error: ErrorApi }
  | { tipo: "procesando"; ficha: Ficha; agotado: boolean }
  | { tipo: "ficha"; ficha: Ficha };

export default function PaginaFicha({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent(use(params).id);
  const [s, setS] = useState<Estado>({ tipo: "cargando" });
  const inicio = useRef(Date.now());

  const consultar = useCallback(async () => {
    try {
      const f = await api.obtenerFicha(id);
      if (f.estado === "procesando") {
        const agotado = Date.now() - inicio.current >= LIMITE;
        setS({ tipo: "procesando", ficha: f, agotado });
        return !agotado;
      }
      setS({ tipo: "ficha", ficha: f });
      return false;
    } catch (e) {
      setS({ tipo: "error", error: aErrorApi(e) });
      return false;
    }
  }, [id]);

  useEffect(() => {
    let vivo = true;
    let t: ReturnType<typeof setTimeout>;
    const ciclo = async () => {
      const seguir = await consultar();
      if (vivo && seguir) t = setTimeout(ciclo, INTERVALO);
    };
    void ciclo();
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [consultar]);

  const reintentar = () => {
    inicio.current = Date.now();
    setS({ tipo: "cargando" });
    const ciclo = async () => {
      if (await consultar()) setTimeout(ciclo, INTERVALO);
    };
    void ciclo();
  };

  return (
    <Shell ancho="amplio">
      {s.tipo === "cargando" && <Cargando />}
      {s.tipo === "error" && <ErrorPantalla error={s.error} onReintentar={reintentar} />}
      {s.tipo === "procesando" && <Procesando ficha={s.ficha} agotado={s.agotado} onReintentar={reintentar} />}
      {s.tipo === "ficha" && s.ficha.estado === "lista" && s.ficha.extraccion && <Revision ficha={s.ficha} />}
      {s.tipo === "ficha" && s.ficha.estado === "confirmada" && <YaConfirmada ficha={s.ficha} />}
      {s.tipo === "ficha" && s.ficha.estado === "error" && <FichaConError ficha={s.ficha} />}
    </Shell>
  );
}

const rutaPaciente = (dpi: string) => `/puesto/pacientes/${encodeURIComponent(dpi)}`;

// ---------------------------------------------------------------- estados de la ficha

function Procesando({ ficha, agotado, onReintentar }: { ficha: Ficha; agotado: boolean; onReintentar: () => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
      <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-[18px] bg-tinta shadow-calida-lg lg:max-w-none">
        {ficha.originales[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ficha.originales[0]} alt="Ficha que se está leyendo" className="max-h-[42dvh] w-full object-contain lg:max-h-[70dvh]" />
        )}
        {!agotado && (
          <div className="pointer-events-none absolute inset-x-0 h-[14%] [animation:barrido_2.1s_cubic-bezier(.45,0,.55,1)_infinite_alternate]">
            <div className="h-full bg-[linear-gradient(180deg,rgba(232,185,140,0)_0%,rgba(232,185,140,.28)_88%,rgba(232,185,140,0)_100%)]" />
            <div className="absolute inset-x-0 bottom-[12%] h-[2px] bg-[#e8b98c] shadow-[0_0_14px_3px_rgba(232,185,140,.75)]" />
          </div>
        )}
      </div>
      <div role="status" aria-live="polite">
        <h1 className="text-[1.9rem] font-semibold leading-tight text-primario">{agotado ? "La lectura está tardando" : "Leyendo la ficha…"}</h1>
        <p className="mt-2 text-tinta-suave">
          {agotado
            ? "La IA sigue trabajando. Puedes esperar aquí o volver al paciente; la ficha te espera lista para revisar."
            : `${ficha.originales.length} ${ficha.originales.length === 1 ? "página" : "páginas"}. Cuando termine, revisas cada dato antes de guardar.`}
        </p>
        {agotado && (
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Boton onClick={onReintentar}>
              <ScanLine /> Volver a consultar
            </Boton>
            <Boton asChild variante="secundario">
              <Link href={rutaPaciente(ficha.dpi)}>Volver al paciente</Link>
            </Boton>
          </div>
        )}
      </div>
    </div>
  );
}

function YaConfirmada({ ficha }: { ficha: Ficha }) {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <CircleCheck className="mx-auto h-12 w-12 text-confirmado" aria-hidden="true" />
      <h1 className="mt-4 text-[1.6rem] font-semibold">Esta ficha ya se confirmó</h1>
      <p className="mt-2 text-tinta-suave">Sus datos ya están en el expediente. Si algo quedó mal, corrígelo desde el paciente: se guarda como versión nueva.</p>
      <Boton asChild className="mt-6">
        <Link href={rutaPaciente(ficha.dpi)}>Ver expediente</Link>
      </Boton>
    </div>
  );
}

function FichaConError({ ficha }: { ficha: Ficha }) {
  return (
    <div className="mx-auto max-w-md py-12 text-center" role="alert">
      <TriangleAlert className="mx-auto h-12 w-12 text-revisar-tinta" aria-hidden="true" />
      <h1 className="mt-4 text-[1.6rem] font-semibold">No se pudo leer esta ficha</h1>
      <p className="mt-2 text-tinta-suave">{ficha.error ?? "Toma la foto otra vez, con más luz."}</p>
      <Boton asChild className="mt-6">
        <Link href={`${rutaPaciente(ficha.dpi)}/captura`}>Tomar la foto otra vez</Link>
      </Boton>
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
const CAMPOS_CONSULTA: Array<{ k: keyof Omit<ConsultaEditable, "pagina">; etiqueta: string; tipo: "fecha" | "texto" | "largo" | "lista" }> = [
  { k: "fecha", etiqueta: "Fecha de la consulta", tipo: "fecha" },
  { k: "motivo", etiqueta: "Motivo", tipo: "texto" },
  { k: "diagnostico", etiqueta: "Diagnóstico", tipo: "largo" },
  { k: "tratamiento", etiqueta: "Tratamiento", tipo: "largo" },
  { k: "vacunas", etiqueta: "Vacunas, separadas por coma", tipo: "lista" },
];
const aLista = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Revision({ ficha }: { ficha: Ficha }) {
  const router = useRouter();
  const ex = ficha.extraccion!;
  const [alergias, setAlergias] = useState(() => revisable(ex.paciente.alergias));
  const [condiciones, setCondiciones] = useState(() => revisable(ex.paciente.condiciones_cronicas));
  const [consultas, setConsultas] = useState<ConsultaEditable[]>(() =>
    ex.consultas.map((c) => ({ pagina: c.pagina, fecha: revisable(c.fecha), motivo: revisable(c.motivo), diagnostico: revisable(c.diagnostico), tratamiento: revisable(c.tratamiento), vacunas: revisable(c.vacunas) }))
  );
  const [consentimiento, setConsentimiento] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ campo: "revision" | "consentimiento" | "general"; mensaje: string } | null>(null);
  const [hecho, setHecho] = useState<{ consultas_creadas: number; version: number } | null>(null);

  const dpiLeido = ex.paciente.dpi.valor ? soloDigitos(ex.paciente.dpi.valor) || ex.paciente.dpi.valor : null;
  const dpiNoCoincide = Boolean(dpiLeido && dpiLeido !== ficha.dpi);
  const pendientes = useMemo(
    () => [alergias, condiciones, ...consultas.flatMap((c) => CAMPOS_CONSULTA.map(({ k }) => c[k]))].filter((r) => r.baja && !r.revisado).length,
    [alergias, condiciones, consultas]
  );
  const esFoto = ficha.origen === "foto";

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (pendientes) {
      setError({ campo: "revision", mensaje: `Revisa ${pendientes === 1 ? "el dato" : `los ${pendientes} datos`} en amarillo: corrígelo o marca "Está bien".` });
      document.querySelector<HTMLElement>("[data-pendiente='true'] input, [data-pendiente='true'] textarea")?.focus();
      return;
    }
    if (!consentimiento) {
      setError({ campo: "consentimiento", mensaje: "Falta el consentimiento de la paciente para guardar su ficha." });
      return;
    }
    setEnviando(true);
    setError(null);
    const cuerpo: ConfirmarFicha = {
      paciente: { alergias: aLista(alergias.valor), condiciones_cronicas: aLista(condiciones.valor) },
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
      if (ea.codigo === "ficha_ya_confirmada") return router.push(rutaPaciente(ficha.dpi));
      setError({ campo: ea.codigo === "sin_consentimiento" ? "consentimiento" : "general", mensaje: ea.mensaje });
      setEnviando(false);
    }
  }

  if (hecho)
    return (
      <div className="mx-auto max-w-md py-12 text-center" role="status">
        <CircleCheck className="mx-auto h-12 w-12 text-confirmado" aria-hidden="true" />
        <h1 className="mt-4 text-[1.7rem] font-semibold">Guardado en el expediente</h1>
        <p className="mt-2 text-tinta-suave">
          {hecho.consultas_creadas} {hecho.consultas_creadas === 1 ? "consulta nueva" : "consultas nuevas"}, como versión {hecho.version}. El original queda guardado junto a cada dato.
        </p>
        <Boton asChild className="mt-6">
          <Link href={rutaPaciente(ficha.dpi)}>Ver expediente</Link>
        </Boton>
      </div>
    );

  const original = ficha.originales[esFoto ? pagina : 0];

  return (
    <>
      <Link href={rutaPaciente(ficha.dpi)} className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 font-semibold text-tinta-suave hover:text-tinta">
        <ArrowLeft className="h-5 w-5" /> Volver al paciente
      </Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
        {/* Original */}
        <section aria-label="Original" className="lg:sticky lg:top-4">
          {esFoto ? (
            <>
              <div className="overflow-hidden rounded-[16px] bg-tinta shadow-calida-lg">
                {original && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={original} alt={`Página ${pagina + 1} de la ficha`} className="mx-auto max-h-[46dvh] w-auto lg:max-h-[78dvh]" />
                )}
              </div>
              {ficha.originales.length > 1 && (
                <div className="mt-3 flex gap-2" role="tablist" aria-label="Páginas">
                  {ficha.originales.map((_, i) => (
                    <button
                      key={i}
                      role="tab"
                      aria-selected={i === pagina}
                      onClick={() => setPagina(i)}
                      className={cn("min-h-11 rounded-[10px] px-3.5 font-semibold", i === pagina ? "bg-primario text-white" : "bg-superficie text-tinta-suave ring-1 ring-linea")}
                    >
                      Página {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="papel-kraft rounded-[16px] p-5 text-kraft-tinta">
              <FileText className="h-7 w-7" aria-hidden="true" />
              <p className="mt-2 font-semibold text-primario">Importado de un archivo del sistema anterior</p>
              <p className="mt-1 text-[0.92rem]">Cada consulta indica la fila del archivo de donde salió. El archivo original queda guardado.</p>
              {original && (
                <a href={original} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-primario underline-offset-4 hover:underline">
                  Abrir el archivo original
                </a>
              )}
            </div>
          )}
        </section>

        {/* Campos */}
        <form onSubmit={confirmar} noValidate className="min-w-0 space-y-6 pb-28">
          <div>
            <h1 className="text-[1.8rem] font-semibold leading-tight text-primario">Revisar lo que se leyó</h1>
            <p className="mt-1.5 text-tinta-suave" aria-live="polite">
              {pendientes ? (
                <>
                  <span className="font-semibold text-revisar-tinta">{pendientes} {pendientes === 1 ? "dato dudoso" : "datos dudosos"}</span>, en amarillo. Compáralos con el original.
                </>
              ) : (
                "Todo revisado. Confirma con la paciente y guarda."
              )}
            </p>
          </div>

          {/* Paciente */}
          <fieldset className="rounded-[16px] border border-linea bg-superficie p-4 sm:p-5">
            <legend className="px-1 text-[1.05rem] font-semibold">Paciente</legend>
            {dpiNoCoincide && (
              <div className="mb-4 flex gap-3 rounded-[12px] border border-alerta/50 bg-alerta-fondo p-3.5 text-alerta" role="alert">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-tinta">
                  <span className="font-semibold text-alerta">El DPI de la ficha no coincide.</span> La ficha dice{" "}
                  <span className="num font-mono font-semibold">{mostrarIdentificador(dpiLeido)}</span> y el paciente es{" "}
                  <span className="num font-mono font-semibold">{mostrarIdentificador(ficha.dpi)}</span>. Revisa que sea la ficha correcta antes de confirmar.
                </p>
              </div>
            )}
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              <DatoLeido etiqueta="Nombre" campo={ex.paciente.nombre} />
              <DatoLeido etiqueta="DPI en la ficha" campo={ex.paciente.dpi} mostrar={mostrarIdentificador} rojo={dpiNoCoincide} />
              <DatoLeido etiqueta="Nacimiento" campo={ex.paciente.fecha_nacimiento} mostrar={fechaCorta} />
              <DatoLeido etiqueta="Sexo" campo={ex.paciente.sexo} mostrar={(v) => (v === "F" ? "Femenino" : "Masculino")} />
              <DatoLeido etiqueta="Comunidad" campo={ex.paciente.comunidad} />
            </dl>
            <p className="mt-2 text-[0.85rem] text-tinta-tenue">Estos datos no se guardan desde aquí; si están mal, corrígelos en el paciente.</p>
            <div className="mt-4 grid gap-4">
              <CampoRevisable id="alergias" etiqueta="Alergias, separadas por coma" r={alergias} onCambio={setAlergias} tipo="lista" />
              <CampoRevisable id="condiciones" etiqueta="Condiciones crónicas, separadas por coma" r={condiciones} onCambio={setCondiciones} tipo="lista" />
            </div>
          </fieldset>

          {/* Consultas */}
          {consultas.map((c, i) => (
            <fieldset key={i} className="rounded-[16px] border border-linea bg-superficie p-4 sm:p-5">
              <legend className="px-1 text-[1.05rem] font-semibold">
                Consulta {consultas.length > 1 ? `${i + 1} de ${consultas.length}` : ""}
                <span className="ml-2 text-[0.88rem] font-normal text-tinta-tenue">{esFoto ? `página ${c.pagina + 1}` : `fila ${c.pagina + 2} del archivo`}</span>
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

          {/* Consentimiento */}
          <div>
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-[14px] border p-4", error?.campo === "consentimiento" ? "border-alerta bg-alerta-fondo" : "border-linea bg-superficie")}>
              <input
                type="checkbox"
                checked={consentimiento}
                onChange={(e) => setConsentimiento(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--primario)]"
                aria-describedby={error?.campo === "consentimiento" ? "error-consentimiento" : undefined}
              />
              <span>
                <span className="block font-semibold">La paciente aceptó que su ficha se guarde en Sigo</span>
                <span className="block text-[0.92rem] text-tinta-suave">Se lo explicaste: ella decide quién ve su historial, y nada se borra.</span>
              </span>
            </label>
            {error?.campo === "consentimiento" && <MensajeError id="error-consentimiento" className="mt-2">{error.mensaje}</MensajeError>}
          </div>

          {error && error.campo !== "consentimiento" && <MensajeError>{error.mensaje}</MensajeError>}

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-superficie/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-end gap-3">
              <p className="hidden flex-1 text-tinta-suave sm:block">{pendientes ? `${pendientes} por revisar` : "Listo para guardar"}</p>
              <Boton type="submit" tamaño="xl" className="w-full sm:w-auto" disabled={enviando}>
                {enviando ? <LoaderCircle className="animate-spin" /> : <Check />} Confirmar y guardar
              </Boton>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

function DatoLeido<T>({ etiqueta, campo, mostrar, rojo }: { etiqueta: string; campo: Campo<T>; mostrar?: (v: T) => string; rojo?: boolean }) {
  const v = campo.valor;
  return (
    <div className={cn("rounded-[10px] px-2.5 py-1.5", rojo ? "bg-alerta-fondo" : campo.confianza === "baja" && "bg-revisar-fondo")}>
      <dt className="text-[0.85rem] text-tinta-tenue">{etiqueta}</dt>
      <dd className={cn("font-semibold", rojo && "text-alerta", v === null && "font-normal text-tinta-tenue")}>{v === null ? "No se leyó" : mostrar ? mostrar(v) : String(v)}</dd>
    </div>
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
  tipo: "fecha" | "texto" | "largo" | "lista";
  onFoco?: () => void;
}) {
  const pendiente = r.baja && !r.revisado;
  const cambiar = (valor: string) => onCambio({ ...r, valor, revisado: true });
  const comunes = {
    id,
    value: r.valor,
    onFocus: onFoco,
    placeholder: r.baja && !r.valor ? "No se pudo leer. Escríbelo si aparece." : undefined,
    "aria-describedby": pendiente ? `${id}-ayuda` : undefined,
    className: cn(pendiente && "border-revisar bg-revisar-fondo", tipo === "fecha" && "num"),
  };
  return (
    <div data-pendiente={pendiente} className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[0.9rem] font-semibold text-tinta-suave">
          {etiqueta}
        </label>
        {r.baja &&
          (pendiente ? (
            <button type="button" onClick={() => onCambio({ ...r, revisado: true })} className="min-h-9 rounded-full border border-revisar/70 bg-revisar-fondo px-3 text-[0.85rem] font-semibold text-revisar-tinta hover:bg-revisar/30">
              Está bien
            </button>
          ) : (
            <span className="flex items-center gap-1 text-[0.85rem] font-semibold text-confirmado">
              <Check className="h-4 w-4" aria-hidden="true" /> Revisado
            </span>
          ))}
      </div>
      {tipo === "largo" ? (
        <AreaTexto rows={2} {...comunes} onChange={(e) => cambiar(e.target.value)} />
      ) : (
        <Entrada type={tipo === "fecha" ? "date" : "text"} {...comunes} onChange={(e) => cambiar(e.target.value)} />
      )}
      {pendiente && (
        <p id={`${id}-ayuda`} className="text-[0.85rem] text-revisar-tinta">
          La lectura es dudosa. Compárala con el original.
        </p>
      )}
    </div>
  );
}

"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CircleAlert, CircleCheck, Check, ZoomIn, ShieldCheck, FolderOpen, UserPlus, TriangleAlert, Info } from "lucide-react";
import { Boton } from "@/components/ui/button";
import { AreaTexto, Entrada } from "@/components/ui/input";
import { Insignia } from "@/components/ui/badge";
import { Dialogo, DialogoContenido, DialogoTitulo } from "@/components/ui/dialog";
import { type EstadoCampo, necesitaRevision, valorDe } from "./campos";
import { PACIENTES, CONSULTAS } from "@/datos/demo";
import { similitudNombre } from "@/lib/union";
import { cn, edadTexto, formatearDPI, soloDigitos } from "@/lib/utils";

export function Revision({
  fotos,
  campos,
  setCampos,
  eleccion,
  setEleccion,
  onConfirmar,
}: {
  fotos: string[];
  campos: EstadoCampo[];
  setCampos: (c: EstadoCampo[]) => void;
  eleccion: string | null;
  setEleccion: (id: string | null) => void;
  onConfirmar: () => void;
}) {
  const [zoom, setZoom] = useState<string | null>(null);
  const pendientes = campos.filter((c) => !c.revisado).length;
  const porRevisar = useMemo(() => campos.filter((c) => necesitaRevision(c)), [campos]);
  const claros = useMemo(() => campos.filter((c) => !necesitaRevision(c)), [campos]);

  const actualizar = (clave: string, cambios: Partial<EstadoCampo>) =>
    setCampos(campos.map((c) => (c.def.clave === clave ? { ...c, ...cambios } : c)));

  return (
    <div className="pb-32">
      <p className="ceja">Paso 2 de 2 · Revisión</p>
      <h1 className="mt-4 text-[1.9rem] font-semibold leading-tight sm:text-[2.2rem]">Revisa lo que se leyó</h1>
      <p className="mt-1.5 flex items-start gap-2 text-tinta-suave">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primario" />
        La IA solo transcribe. Nada se guarda hasta que tú confirmes.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
        {/* Foto original */}
        <div className="lg:sticky lg:top-6">
          <div className="papel-kraft rounded-[18px] p-2">
            <div className="flex snap-x gap-2 overflow-x-auto">
              {fotos.map((f, i) => (
                <button key={f} onClick={() => setZoom(f)} className="group relative w-full shrink-0 snap-center overflow-hidden rounded-[12px] bg-tinta" aria-label={`Ampliar página ${i + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f} alt={`Foto original, página ${i + 1}`} className="max-h-[38dvh] w-full object-contain lg:max-h-[74dvh]" />
                  <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-superficie/95 px-3 py-2 text-[0.82rem] font-semibold text-tinta shadow-calida">
                    <ZoomIn className="h-4 w-4" /> Tocar para ampliar
                  </span>
                </button>
              ))}
            </div>
            <p className="px-2 pb-1 pt-2.5 text-[0.82rem] font-semibold text-kraft-tinta">Original · se guarda junto a los datos</p>
          </div>
        </div>

        {/* Campos */}
        <div className="space-y-6">
          <Coincidencia campos={campos} eleccion={eleccion} setEleccion={setEleccion} />

          {porRevisar.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 font-sans text-[1rem] font-bold text-revisar-tinta">
                <CircleAlert className="h-5 w-5" /> Revisar primero ({porRevisar.length})
              </h2>
              <div className="mt-3 space-y-3">
                {porRevisar.map((c) => (
                  <Campo key={c.def.clave} campo={c} onCambio={(cambios) => actualizar(c.def.clave, cambios)} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="flex items-center gap-2 font-sans text-[1rem] font-bold text-tinta-suave">
              <CircleCheck className="h-5 w-5 text-confirmado" /> Leído con claridad ({claros.length})
            </h2>
            <div className="mt-3 space-y-3">
              {claros.map((c) => (
                <Campo key={c.def.clave} campo={c} onCambio={(cambios) => actualizar(c.def.clave, cambios)} />
              ))}
            </div>
          </section>
        </div>
      </div>

      <Dialogo open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogoContenido className="max-w-5xl bg-tinta p-2 sm:p-3">
          <DialogoTitulo className="sr-only">Foto original ampliada</DialogoTitulo>
          {zoom && <ImagenZoom src={zoom} />}
        </DialogoContenido>
      </Dialogo>

      {/* Barra de confirmación fija */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-superficie/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <p className={cn("flex items-center gap-2 text-[0.95rem] font-semibold", pendientes ? "text-revisar-tinta" : "text-confirmado")} aria-live="polite">
            {pendientes ? <CircleAlert className="h-5 w-5" /> : <CircleCheck className="h-5 w-5" />}
            {pendientes ? `Falta${pendientes === 1 ? "" : "n"} ${pendientes} campo${pendientes === 1 ? "" : "s"} por revisar` : "Todo revisado. Listo para guardar."}
          </p>
          <Boton tamaño="xl" className="w-full sm:ml-auto sm:w-auto" disabled={pendientes > 0} onClick={onConfirmar}>
            <Check strokeWidth={3} /> Confirmar y guardar
          </Boton>
        </div>
      </div>
    </div>
  );
}

function ImagenZoom({ src }: { src: string }) {
  const [grande, setGrande] = useState(false);
  return (
    <div className="max-h-[86dvh] overflow-auto rounded-[12px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Foto original"
        onClick={() => setGrande(!grande)}
        className={cn("mx-auto transition-[width] duration-200", grande ? "w-[220%] max-w-none cursor-zoom-out sm:w-[160%]" : "w-full cursor-zoom-in")}
      />
    </div>
  );
}

function Campo({ campo, onCambio }: { campo: EstadoCampo; onCambio: (c: Partial<EstadoCampo>) => void }) {
  const { def, valor, confianza, revisado, editado } = campo;
  const dudoso = necesitaRevision(campo);
  const pendiente = !revisado;
  const id = `campo-${def.clave}`;
  const cambiar = (v: string) => onCambio({ valor: v, revisado: true, editado: true });

  return (
    <motion.div
      layout="position"
      className={cn(
        "rounded-[16px] border p-3.5 transition-colors duration-200 sm:p-4",
        pendiente ? "border-revisar bg-revisar-fondo shadow-[0_0_0_3px_rgba(245,197,66,.18)]" : "border-linea bg-superficie"
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-[0.92rem] font-bold text-tinta">
          {def.etiqueta}
        </label>
        {def.alertaClinica && valor && <Insignia tono="alerta"><TriangleAlert /> Alerta clínica</Insignia>}
        <span className="ml-auto">
          {pendiente ? (
            <Insignia tono="revisar"><CircleAlert /> Revisar</Insignia>
          ) : dudoso || editado ? (
            <Insignia tono="confirmado"><Check /> {editado ? "Corregido" : "Revisado"}</Insignia>
          ) : (
            <Insignia tono="neutro">Claro</Insignia>
          )}
        </span>
      </div>

      {def.tipo === "sexo" ? (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={id}>
          {[["F", "Femenino"], ["M", "Masculino"]].map(([v, t]) => (
            <button key={v} id={v === "F" ? id : undefined} type="button" role="radio" aria-checked={valor === v} onClick={() => cambiar(v)} className={cn("min-h-12 rounded-[12px] border font-semibold transition-colors", valor === v ? "border-primario bg-primario-suave text-primario-tinta" : "border-linea-fuerte bg-superficie text-tinta-suave")}>
              {t}
            </button>
          ))}
        </div>
      ) : def.tipo === "largo" || def.tipo === "lista" ? (
        <AreaTexto
          id={id}
          rows={def.tipo === "lista" ? Math.max(2, valor.split("\n").length) : 2}
          value={valor}
          onChange={(e) => cambiar(e.target.value)}
          placeholder={def.tipo === "lista" ? "Uno por línea" : "No se leyó. Escríbelo si aparece en la ficha."}
          className={cn(def.alertaClinica && valor && "font-semibold text-alerta")}
        />
      ) : (
        <Entrada
          id={id}
          type={def.tipo === "fecha" ? "date" : "text"}
          inputMode={def.tipo === "dpi" ? "numeric" : undefined}
          value={def.tipo === "dpi" ? formatearDPI(valor) : valor}
          onChange={(e) => cambiar(def.tipo === "dpi" ? soloDigitos(e.target.value).slice(0, 13) : e.target.value)}
          className={cn((def.tipo === "dpi" || def.tipo === "fecha") && "num", def.tipo === "dpi" && "font-mono tracking-wide")}
          placeholder={def.tipo === "dpi" ? "0000 00000 0000" : "No se leyó"}
        />
      )}

      {pendiente && (
        <div className="mt-2.5 flex items-center gap-3">
          <p className="flex-1 text-[0.85rem] text-revisar-tinta">
            {confianza === "baja" && !valor ? "No se pudo leer. Escríbelo si aparece, o déjalo vacío." : "Compáralo con la foto y corrígelo si hace falta."}
          </p>
          <Boton variante="secundario" className="shrink-0" onClick={() => onCambio({ revisado: true })}>
            <Check /> Está bien
          </Boton>
        </div>
      )}
    </motion.div>
  );
}

/** Unión por DPI: muestra a qué expediente se va a agregar la ficha. */
function Coincidencia({ campos, eleccion, setEleccion }: { campos: EstadoCampo[]; eleccion: string | null; setEleccion: (id: string | null) => void }) {
  const dpi = soloDigitos(valorDe(campos, "dpi_cui"));
  const nombre = valorDe(campos, "nombre");
  const fnac = valorDe(campos, "fecha_nacimiento");
  const porDpi = dpi.length === 13 ? PACIENTES.find((p) => p.dpi_cui === dpi) : null;

  if (porDpi) {
    const n = CONSULTAS.filter((c) => c.paciente_id === porDpi.id).length;
    return (
      <div className="flex gap-3.5 rounded-[16px] border border-primario/25 bg-primario-suave p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primario text-white">
          <FolderOpen className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-primario-tinta">Este DPI ya tiene expediente</p>
          <p className="mt-0.5 font-display text-[1.15rem] font-semibold">{porDpi.nombre}</p>
          <p className="text-[0.88rem] text-tinta-suave">
            {edadTexto(porDpi.fecha_nacimiento)} · {porDpi.comunidad} · {n} consultas
          </p>
          <p className="mt-2 text-[0.88rem] text-tinta-suave">La ficha se agrega a su expediente. Alergias y condiciones se unen sin duplicar.</p>
        </div>
      </div>
    );
  }

  const candidatos = nombre
    ? PACIENTES.map((p) => ({ p, s: similitudNombre(p.nombre, nombre) * 62 + (fnac && p.fecha_nacimiento === fnac ? 38 : 0) }))
        .filter((x) => x.s >= 40)
        .sort((a, b) => b.s - a.s)
        .slice(0, 3)
    : [];

  if (!candidatos.length) {
    return (
      <div className="flex gap-3.5 rounded-[16px] border border-linea bg-superficie p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-papel text-tinta-suave">
          <UserPlus className="h-5 w-5" />
        </span>
        <div>
          <p className="font-bold">Persona nueva</p>
          <p className="text-[0.88rem] text-tinta-suave">No encontramos un expediente con estos datos. Se creará uno nuevo.</p>
        </div>
      </div>
    );
  }

  return (
    <fieldset className="rounded-[16px] border border-revisar bg-revisar-fondo p-4">
      <legend className="sr-only">Elegir expediente</legend>
      <p className="flex items-center gap-2 font-bold text-revisar-tinta">
        <Info className="h-5 w-5" /> La ficha no tiene DPI. ¿Es alguna de estas personas?
      </p>
      <div className="mt-3 space-y-2">
        {candidatos.map(({ p }) => (
          <OpcionPersona key={p.id} activo={eleccion === p.id} onClick={() => setEleccion(p.id)} titulo={p.nombre} detalle={`${formatearDPI(p.dpi_cui)} · ${edadTexto(p.fecha_nacimiento)} · ${p.comunidad}`} />
        ))}
        <OpcionPersona activo={eleccion === null} onClick={() => setEleccion(null)} titulo="Es una persona nueva" detalle="Crear un expediente nuevo" />
      </div>
    </fieldset>
  );
}

function OpcionPersona({ activo, onClick, titulo, detalle }: { activo: boolean; onClick: () => void; titulo: string; detalle: string }) {
  return (
    <button type="button" role="radio" aria-checked={activo} onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-[12px] border bg-superficie p-3 text-left", activo ? "border-primario shadow-[0_0_0_3px_rgba(40,54,89,.14)]" : "border-linea")}>
      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", activo ? "border-primario bg-primario" : "border-linea-fuerte")}>{activo && <span className="h-2 w-2 rounded-full bg-white" />}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{titulo}</span>
        <span className="num block truncate text-[0.82rem] text-tinta-tenue">{detalle}</span>
      </span>
    </button>
  );
}

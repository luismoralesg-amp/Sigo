"use client";
/**
 * /puesto · enfermera. Buscar paciente por DPI o TMP-; si no existe, formulario para crearlo (con o sin DPI)
 * y mostrar su PIN inicial una sola vez.
 * Endpoints: GET /pacientes/buscar (lista vacía si no existe, nunca 404), POST /pacientes.
 * Además lista las fichas pendientes del centro (GET /fichas?estado=lista), para abrir las que subió la cola sin señal.
 */
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Baby, ChevronRight, FileSpreadsheet, LoaderCircle, Search, TriangleAlert, UserPlus } from "lucide-react";
import type { Ficha } from "@/lib/types";
import { contarConfianzaBaja } from "@/lib/ficha-revision";
import { Shell } from "@/components/shell";
import { Boton, BarraAccion } from "@/components/ui/button";
import { Entrada, Etiqueta } from "@/components/ui/input";
import { MensajeError } from "@/components/estado";
import { api, esIdentificador, normalizarIdentificador, type DatosNuevoPaciente, type PacienteCreado } from "@/lib/api/cliente";
import { aErrorApi, ErrorApi } from "@/lib/api/errores";
import { useUsuario } from "@/lib/api/sesion";
import { useDatos } from "@/lib/api/usar";
import { cn, dpiParcial, edadTexto, mostrarIdentificador } from "@/lib/utils";

type Paso = { tipo: "buscar" } | { tipo: "crear"; dpi: string | null } | { tipo: "creado"; r: PacienteCreado };
const rutaPaciente = (id: string) => `/puesto/pacientes/${encodeURIComponent(id)}`;

export default function PaginaPuesto() {
  return (
    <Shell>
      <Suspense>
        <Puesto />
      </Suspense>
    </Shell>
  );
}

function Puesto() {
  const { usuario } = useUsuario();
  const params = useSearchParams();
  const [paso, setPaso] = useState<Paso>({ tipo: "buscar" });

  if (paso.tipo === "crear") return <FormularioCrear dpi={paso.dpi} onCreado={(r) => setPaso({ tipo: "creado", r })} onCancelar={() => setPaso({ tipo: "buscar" })} />;
  if (paso.tipo === "creado") return <PinInicial r={paso.r} />;

  return (
    <>
      <h1 className="titulo">Buscar paciente</h1>
      <p className="mt-1.5 text-tinta-suave">{usuario.centro?.nombre}</p>
      <Buscador inicial={params.get("dpi") ?? ""} onNoExiste={(dpi) => setPaso({ tipo: "crear", dpi })} />
      <button onClick={() => setPaso({ tipo: "crear", dpi: null })} className="-ml-2 mt-3 inline-flex min-h-12 items-center gap-2 rounded-[10px] px-2 font-semibold text-primario hover:bg-primario-suave">
        <Baby className="h-5 w-5" aria-hidden="true" /> Registrar sin DPI (niño o ficha vieja)
      </button>
      <FichasPendientes />
      <Link href="/puesto/importar" className="tarjeta mt-6 flex min-h-16 items-center gap-3 p-4 hover:border-linea-fuerte">
        <FileSpreadsheet className="h-6 w-6 shrink-0 text-primario" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Importar un archivo viejo</span>
          <span className="block text-[0.95rem] text-tinta-suave">Excel, CSV o Access del sistema anterior</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-tinta-suave" aria-hidden="true" />
      </Link>
    </>
  );
}

function Buscador({ inicial, onNoExiste }: { inicial: string; onNoExiste: (dpi: string | null) => void }) {
  const router = useRouter();
  const [valor, setValor] = useState(inicial);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [tmpNoExiste, setTmpNoExiste] = useState(false);
  const esTmp = valor.trim().toUpperCase().startsWith("T");

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setTmpNoExiste(false);
    const dpi = normalizarIdentificador(valor);
    if (!esIdentificador(dpi)) return setError(new ErrorApi(400, "identificador_invalido", "Escribe los 13 dígitos del DPI, o el identificador TMP- completo."));
    setBuscando(true);
    setError(null);
    try {
      const { pacientes } = await api.buscarPacientes(dpi);
      if (pacientes[0]) return router.push(rutaPaciente(pacientes[0].id));
      setBuscando(false);
      // Un TMP- lo genera el backend: si no existe, no se puede crear con ese mismo identificador.
      if (dpi.startsWith("TMP-")) setTmpNoExiste(true);
      else onNoExiste(dpi);
    } catch (err) {
      setError(aErrorApi(err));
      setBuscando(false);
    }
  }

  return (
    <form onSubmit={buscar} className="mt-6" noValidate>
      <Etiqueta htmlFor="dpi">DPI o identificador TMP-</Etiqueta>
      <Entrada
        id="dpi"
        inputMode={esTmp ? "text" : "numeric"}
        autoComplete="off"
        autoCapitalize="characters"
        placeholder="2547 89633 0801"
        value={esTmp ? valor.toUpperCase() : valor}
        onChange={(e) => setValor(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "dpi-error" : undefined}
        className={cn("cifra mt-1.5 text-[1.3rem] tracking-[0.06em]", error && "border-alerta")}
      />
      {error?.codigo === "rol_no_permitido" ? (
        <div id="dpi-error" role="alert" className="tarjeta mt-3 p-4">
          <p className="font-semibold">No tienes acceso a este paciente</p>
          <p className="mt-1 text-tinta-suave">Solo ves pacientes con consultas en tu centro o que tú registraste.</p>
        </div>
      ) : (
        error && <MensajeError id="dpi-error" className="mt-2">{error.mensaje}</MensajeError>
      )}
      {tmpNoExiste && (
        <p role="status" className="mt-2 text-tinta-suave">
          No hay nadie con ese identificador. Revísalo, o registra a la persona sin DPI para que Sigo le asigne uno.
        </p>
      )}
      <BarraAccion>
        <Boton type="submit" tamaño="accion" disabled={buscando}>
          {buscando ? <LoaderCircle className="animate-spin" /> : <Search />} Buscar paciente
        </Boton>
      </BarraAccion>
    </form>
  );
}

/** Fichas en "lista" del centro: las fotos que subió la cola sin señal y las de importaciones sin revisar. */
function FichasPendientes() {
  const r = useDatos(() => api.fichasPorRevisar(), []);
  if (r.estado !== "listo" || r.datos.fichas.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="titulo-pendientes">
      <h2 id="titulo-pendientes" className="subtitulo">
        Fichas por revisar
      </h2>
      <ul className="tarjeta mt-3 divide-y divide-linea overflow-hidden">
        {r.datos.fichas.slice(0, 8).map((f) => (
          <FilaFicha key={f.id} f={f} />
        ))}
      </ul>
    </section>
  );
}

function FilaFicha({ f }: { f: Ficha }) {
  const p = f.extraccion?.paciente;
  const nombre = p?.nombre.valor ?? "Sin nombre leído";
  const edad = edadTexto(p?.fecha_nacimiento.valor);
  const bajas = contarConfianzaBaja(f.extraccion);
  return (
    <li>
      <Link href={`/puesto/fichas/${encodeURIComponent(f.id)}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-papel">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{nombre}</span>
          <span className="cifra block text-[0.95rem] text-tinta-suave">{[p?.dpi.valor ? dpiParcial(p.dpi.valor) : null, edad].filter(Boolean).join(", ") || "Sin DPI"}</span>
        </span>
        <span className="etiqueta-dudoso shrink-0 text-right">
          {bajas > 0 ? `${bajas} con confianza baja` : f.origen === "foto" ? "Foto por revisar" : "Archivo por revisar"}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-tinta-suave" aria-hidden="true" />
      </Link>
    </li>
  );
}

function FormularioCrear({ dpi, onCreado, onCancelar }: { dpi: string | null; onCreado: (r: PacienteCreado) => void; onCancelar: () => void }) {
  const router = useRouter();
  const [datos, setDatos] = useState({ nombre: "", fecha_nacimiento: "", sexo: "" as "" | "F" | "M", comunidad: "", telefono: "" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorApi | null>(null);
  const set = (k: keyof typeof datos) => (e: React.ChangeEvent<HTMLInputElement>) => setDatos({ ...datos, [k]: e.target.value });
  const sinDpi = dpi === null;

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!datos.nombre.trim()) return setError(new ErrorApi(400, "validacion", "Escribe el nombre completo."));
    setEnviando(true);
    setError(null);
    const cuerpo: DatosNuevoPaciente = {
      dpi,
      nombre: datos.nombre.trim(),
      fecha_nacimiento: datos.fecha_nacimiento || null,
      sexo: datos.sexo || null,
      comunidad: datos.comunidad.trim() || null,
      telefono: datos.telefono.trim() || null,
    };
    try {
      onCreado(await api.crearPaciente(cuerpo));
    } catch (err) {
      const ea = aErrorApi(err);
      // 409 dpi_ya_existe: abre el paciente que ya existe.
      if (ea.codigo === "dpi_ya_existe" && dpi) {
        try {
          const { pacientes } = await api.buscarPacientes(dpi);
          if (pacientes[0]) return router.push(rutaPaciente(pacientes[0].id));
        } catch {
          /* cae al mensaje */
        }
      }
      setError(ea);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={crear} noValidate>
      <h1 className="titulo">{sinDpi ? "Registrar sin DPI" : "Crear paciente"}</h1>
      <p className="mt-1.5 text-tinta-suave">
        {sinDpi ? (
          "Para un niño o una ficha vieja sin DPI. Sigo le asigna un identificador temporal TMP-."
        ) : (
          <>
            No hay nadie con el DPI <span className="cifra font-semibold text-tinta">{mostrarIdentificador(dpi)}</span>. Llena los datos para crear el registro.
          </>
        )}
      </p>

      <div className="tarjeta mt-6 grid gap-5 p-4 sm:grid-cols-2 sm:p-5">
        <div className="space-y-1.5 sm:col-span-2">
          <Etiqueta htmlFor="nombre">Nombre completo</Etiqueta>
          <Entrada id="nombre" autoComplete="off" value={datos.nombre} onChange={set("nombre")} aria-invalid={error?.codigo === "validacion"} className={cn(error?.codigo === "validacion" && "border-alerta")} />
        </div>
        <div className="space-y-1.5">
          <Etiqueta htmlFor="nacimiento">Fecha de nacimiento</Etiqueta>
          <Entrada id="nacimiento" type="date" className="cifra" value={datos.fecha_nacimiento} onChange={set("fecha_nacimiento")} />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="etiqueta-campo">Sexo</legend>
          <div className="flex gap-2">
            {(["F", "M"] as const).map((s) => (
              <label
                key={s}
                className={cn(
                  "flex min-h-[52px] flex-1 cursor-pointer items-center justify-center rounded-[12px] border font-semibold",
                  datos.sexo === s ? "border-primario bg-primario-suave text-primario" : "border-linea-fuerte bg-superficie text-tinta-suave"
                )}
              >
                <input type="radio" name="sexo" value={s} checked={datos.sexo === s} onChange={() => setDatos({ ...datos, sexo: s })} className="sr-only" />
                {s === "F" ? "Femenino" : "Masculino"}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Etiqueta htmlFor="comunidad">Comunidad</Etiqueta>
          <Entrada id="comunidad" value={datos.comunidad} onChange={set("comunidad")} placeholder="Chichicastenango" />
        </div>
        <div className="space-y-1.5">
          <Etiqueta htmlFor="telefono">Teléfono, para mandar el código por SMS</Etiqueta>
          <Entrada id="telefono" type="tel" inputMode="tel" value={datos.telefono} onChange={set("telefono")} className="cifra" />
        </div>
      </div>

      {error && <MensajeError className="mt-4">{error.mensaje}</MensajeError>}
      <button type="button" onClick={onCancelar} disabled={enviando} className="-ml-2 mt-4 inline-flex min-h-12 items-center rounded-[10px] px-2 font-semibold text-primario hover:bg-primario-suave">
        Volver a buscar
      </button>

      <BarraAccion>
        <Boton type="submit" tamaño="accion" disabled={enviando}>
          {enviando ? <LoaderCircle className="animate-spin" /> : <UserPlus />} {sinDpi ? "Registrar sin DPI" : "Crear paciente"}
        </Boton>
      </BarraAccion>
    </form>
  );
}

/** El PIN se muestra una sola vez (regla 9). dpi_dudoso es advertencia, no error: va en amarillo. */
function PinInicial({ r }: { r: PacienteCreado }) {
  const dudoso = r.advertencias.includes("dpi_dudoso");
  return (
    <section aria-labelledby="titulo-pin">
      <h1 id="titulo-pin" className="titulo">
        {r.paciente.nombre} ya está en Sigo
      </h1>
      <p className="mt-1.5 text-tinta-suave">
        {r.paciente.dpi.startsWith("TMP-") ? "Identificador temporal" : "DPI"} <span className="cifra font-semibold text-tinta">{mostrarIdentificador(r.paciente.dpi)}</span>
      </p>

      {dudoso && (
        <div className="aviso-dudoso mt-5 flex gap-3 p-4" role="status">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-semibold">Revisa el DPI con el documento.</span> El dígito verificador o el municipio no cuadran. El registro se creó igual.
          </p>
        </div>
      )}

      <div className="tarjeta mt-5 p-5 text-center">
        <p className="font-semibold text-tinta-suave">PIN inicial para entrar a Sigo</p>
        <p className="cifra mt-2 text-[2.75rem] font-semibold tracking-[0.3em] text-primario" aria-label={`PIN ${r.pin_inicial.split("").join(" ")}`}>
          {r.pin_inicial}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-tinta-suave">Entrégalo ahora: no se vuelve a mostrar. La primera vez que se entre con este PIN, Sigo pide cambiarlo.</p>
      </div>

      <BarraAccion>
        <Boton asChild tamaño="accion">
          <Link href={rutaPaciente(r.paciente.id)}>Ya entregué el PIN, abrir expediente</Link>
        </Boton>
      </BarraAccion>
    </section>
  );
}

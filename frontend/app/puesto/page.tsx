"use client";
/**
 * /puesto · enfermera. Buscar paciente por DPI; si no existe (404 no_existe), formulario para crearlo
 * (o niño sin DPI) y mostrar su PIN inicial una sola vez.
 * Endpoints: GET /pacientes/{dpi}, POST /pacientes.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Baby, FileSpreadsheet, LoaderCircle, Search, TriangleAlert, UserPlus } from "lucide-react";
import { Shell } from "@/components/shell";
import { Boton } from "@/components/ui/button";
import { Entrada, Etiqueta } from "@/components/ui/input";
import { MensajeError } from "@/components/estado";
import { api, esIdentificador, normalizarIdentificador, type DatosNuevoPaciente, type PacienteCreado } from "@/lib/api/cliente";
import { aErrorApi, ErrorApi } from "@/lib/api/errores";
import { useUsuario } from "@/lib/api/sesion";
import { cn, mostrarIdentificador } from "@/lib/utils";

type Paso = { tipo: "buscar" } | { tipo: "crear"; dpi: string | null } | { tipo: "creado"; r: PacienteCreado };

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
  const [inicial] = useState(params.get("dpi") ?? "");

  return (
    <>
      <h1 className="text-[2rem] leading-[1.06] text-primario sm:text-[2.4rem]">Buscar paciente</h1>
      <p className="mt-2 text-tinta-suave">{usuario.centro?.nombre}. Escribe el DPI de la persona; si no está registrada, la creas aquí.</p>

      {paso.tipo === "buscar" && <Buscador inicial={inicial} onNoExiste={(dpi) => setPaso({ tipo: "crear", dpi })} onSinDPI={() => setPaso({ tipo: "crear", dpi: null })} />}
      {paso.tipo === "crear" && <FormularioCrear dpi={paso.dpi} onCreado={(r) => setPaso({ tipo: "creado", r })} onCancelar={() => setPaso({ tipo: "buscar" })} />}
      {paso.tipo === "creado" && <PinInicial r={paso.r} />}

      {paso.tipo === "buscar" && (
        <Link
          href="/puesto/importar"
          className="papel-kraft mt-10 flex items-center gap-4 rounded-[16px] p-4 text-kraft-tinta shadow-calida transition-[filter] hover:brightness-[.98] sm:p-5"
        >
          <FileSpreadsheet className="h-7 w-7 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>
            <span className="block font-semibold text-primario">Importar un archivo viejo</span>
            <span className="block text-[0.92rem]">Excel, CSV o Access del sistema anterior. Cada paciente queda como una ficha para revisar.</span>
          </span>
        </Link>
      )}
    </>
  );
}

function Buscador({ inicial, onNoExiste, onSinDPI }: { inicial: string; onNoExiste: (dpi: string) => void; onSinDPI: () => void }) {
  const router = useRouter();
  const [valor, setValor] = useState(inicial);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<ErrorApi | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const dpi = normalizarIdentificador(valor);
    if (!esIdentificador(dpi)) {
      setError(new ErrorApi(400, "identificador_invalido", "Escribe los 13 dígitos del DPI, o el identificador TMP- de un niño."));
      return;
    }
    setBuscando(true);
    setError(null);
    try {
      await api.buscarPaciente(dpi);
      router.push(`/puesto/pacientes/${encodeURIComponent(dpi)}`);
    } catch (err) {
      const ea = aErrorApi(err);
      setBuscando(false);
      if (ea.codigo === "no_existe" && /^\d{13}$/.test(dpi)) return onNoExiste(dpi);
      setError(ea);
    }
  }

  return (
    <div className="mt-7">
      <form onSubmit={buscar} className="flex flex-col gap-3 sm:flex-row" noValidate>
        <div className="flex-1">
          <Etiqueta htmlFor="dpi" className="sr-only">
            DPI o identificador
          </Etiqueta>
          <Entrada
            id="dpi"
            inputMode={valor.toUpperCase().startsWith("T") ? "text" : "numeric"}
            autoComplete="off"
            autoFocus
            placeholder="2547 89631 0801"
            value={valor.toUpperCase().startsWith("T") ? valor.toUpperCase() : valor}
            onChange={(e) => setValor(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "dpi-error" : undefined}
            className={cn("num min-h-14 font-mono text-[1.15rem] tracking-[0.04em]", error && "border-alerta")}
          />
        </div>
        <Boton type="submit" tamaño="lg" disabled={buscando}>
          {buscando ? <LoaderCircle className="animate-spin" /> : <Search />} Buscar
        </Boton>
      </form>
      {error && (
        <ErrorBusqueda error={error} id="dpi-error" />
      )}
      <button onClick={onSinDPI} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[10px] px-2 -ml-2 font-semibold text-primario hover:bg-primario-suave">
        <Baby className="h-5 w-5" /> Registrar a un niño sin DPI
      </button>
    </div>
  );
}

function ErrorBusqueda({ error, id }: { error: ErrorApi; id: string }) {
  if (error.codigo === "rol_no_permitido")
    return (
      <div id={id} role="alert" className="mt-4 rounded-[14px] border border-linea bg-superficie p-4">
        <p className="font-semibold">No tienes acceso a este paciente</p>
        <p className="mt-1 text-tinta-suave">{error.mensaje} Solo ves pacientes con consultas en tu centro o que tú registraste.</p>
      </div>
    );
  return <MensajeError id={id} className="mt-3">{error.mensaje}</MensajeError>;
}

function FormularioCrear({ dpi, onCreado, onCancelar }: { dpi: string | null; onCreado: (r: PacienteCreado) => void; onCancelar: () => void }) {
  const router = useRouter();
  const [datos, setDatos] = useState({ nombre: "", fecha_nacimiento: "", sexo: "" as "" | "F" | "M", comunidad: "", telefono: "" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorApi | null>(null);
  const set = (k: keyof typeof datos) => (e: React.ChangeEvent<HTMLInputElement>) => setDatos({ ...datos, [k]: e.target.value });
  const nino = dpi === null;

  async function crear(e: React.FormEvent) {
    e.preventDefault();
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
      if (ea.codigo === "dpi_ya_existe" && dpi) return router.push(`/puesto/pacientes/${encodeURIComponent(dpi)}`);
      setError(ea);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={crear} className="mt-7 rounded-[18px] border border-linea bg-superficie p-4 shadow-calida sm:p-6" noValidate>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primario-suave text-primario">{nino ? <Baby className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}</span>
        <div>
          <h2 className="text-[1.35rem] font-semibold">{nino ? "Registrar a un niño sin DPI" : "Esta persona no está registrada"}</h2>
          <p className="mt-0.5 text-tinta-suave">
            {nino ? "Sigo le asigna un identificador temporal TMP- que sirve en cualquier centro." : <>DPI <span className="num font-mono font-semibold text-tinta">{mostrarIdentificador(dpi)}</span>. Llena los datos para crear el registro.</>}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Etiqueta htmlFor="nombre">Nombre completo</Etiqueta>
          <Entrada id="nombre" autoComplete="off" value={datos.nombre} onChange={set("nombre")} required />
        </div>
        <div className="space-y-1.5">
          <Etiqueta htmlFor="nacimiento">Fecha de nacimiento</Etiqueta>
          <Entrada id="nacimiento" type="date" className="num" value={datos.fecha_nacimiento} onChange={set("fecha_nacimiento")} />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-[0.9rem] font-semibold text-tinta-suave">Sexo</legend>
          <div className="flex gap-2">
            {(["F", "M"] as const).map((s) => (
              <label key={s} className={cn("flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-[12px] border font-semibold transition-colors", datos.sexo === s ? "border-primario bg-primario-suave text-primario" : "border-linea-fuerte bg-superficie text-tinta-suave hover:border-primario/40")}>
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
          <Etiqueta htmlFor="telefono">Teléfono para el código por SMS</Etiqueta>
          <Entrada id="telefono" type="tel" inputMode="tel" value={datos.telefono} onChange={set("telefono")} className="num" />
        </div>
      </div>

      {error && <MensajeError className="mt-4">{error.mensaje}</MensajeError>}

      <div className="mt-6 flex flex-wrap gap-2.5">
        <Boton type="submit" tamaño="lg" disabled={enviando}>
          {enviando && <LoaderCircle className="animate-spin" />} {nino ? "Registrar niño" : "Crear paciente"}
        </Boton>
        <Boton type="button" tamaño="lg" variante="secundario" onClick={onCancelar} disabled={enviando}>
          Volver a buscar
        </Boton>
      </div>
    </form>
  );
}

/** El PIN se muestra una sola vez (regla 9). dpi_dudoso es advertencia, no error: va en amarillo. */
function PinInicial({ r }: { r: PacienteCreado }) {
  const dudoso = r.advertencias.includes("dpi_dudoso");
  const ruta = `/puesto/pacientes/${encodeURIComponent(r.paciente.dpi)}`;
  return (
    <section className="mt-7 overflow-hidden rounded-[18px] border border-linea bg-superficie shadow-calida-lg" aria-labelledby="titulo-pin">
      <div className="p-5 sm:p-6">
        <h2 id="titulo-pin" className="text-[1.35rem] font-semibold">
          {r.paciente.nombre} ya está en Sigo
        </h2>
        <p className="mt-1 text-tinta-suave">
          {r.paciente.dpi.startsWith("TMP-") ? "Identificador temporal" : "DPI"}{" "}
          <span className="num font-mono font-semibold text-tinta">{mostrarIdentificador(r.paciente.dpi)}</span>
        </p>

        {dudoso && (
          <div className="mt-4 flex gap-3 rounded-[12px] border border-revisar/70 bg-revisar-fondo p-3.5 text-revisar-tinta" role="status">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              <span className="font-semibold">Revisa el DPI con el documento.</span> El dígito verificador o el municipio no cuadran con la tabla de la SAT. El registro se creó igual.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-linea bg-primario px-5 py-6 text-center text-[#EEEAE5] sm:px-6">
        <p className="font-semibold">PIN inicial para entrar a Sigo</p>
        <p className="num mt-2 font-mono text-[2.8rem] font-semibold tracking-[0.25em] text-white" aria-label={`PIN ${r.pin_inicial.split("").join(" ")}`}>
          {r.pin_inicial}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-[0.92rem] text-[#EEEAE5]/85">Entrégalo ahora: no se vuelve a mostrar. La primera vez que se entre con este PIN, Sigo pide cambiarlo.</p>
      </div>

      <div className="p-5 sm:p-6">
        <Boton asChild tamaño="lg" className="w-full sm:w-auto">
          <Link href={ruta}>Ya entregué el PIN, abrir expediente</Link>
        </Boton>
      </div>
    </section>
  );
}

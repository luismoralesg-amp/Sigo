"use client";
/**
 * /hospital · médico. Escribir el código o escanear el QR; botón "Acceso de emergencia" que pide DPI y motivo.
 * Endpoints: POST /consentimientos/activar, POST /emergencia.
 * Regla 3: el médico solo entra con código o por emergencia.
 */
import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, LoaderCircle, Siren, TimerOff } from "lucide-react";
import { Shell } from "@/components/shell";
import { Boton } from "@/components/ui/button";
import { AreaTexto, Entrada, Etiqueta } from "@/components/ui/input";
import { MensajeError } from "@/components/estado";
import { EscanerQR } from "@/components/expediente/escaner-qr";
import { api, esIdentificador, normalizarCodigo, normalizarIdentificador } from "@/lib/api/cliente";
import { aErrorApi } from "@/lib/api/errores";
import { cn } from "@/lib/utils";

export default function PaginaHospital() {
  return (
    <Shell>
      <Suspense>
        <Hospital />
      </Suspense>
    </Shell>
  );
}

const MENSAJE_CODIGO: Partial<Record<string, string>> = {
  codigo_vencido: "Este código ya venció. Pide uno nuevo a la paciente.",
  codigo_ya_usado: "Este código ya se usó. Pide uno nuevo a la paciente.",
  demasiados_intentos: "Demasiados códigos equivocados. Espera 15 minutos.",
};

function Hospital() {
  const router = useRouter();
  const params = useSearchParams();
  const vencido = params.get("vencido") === "1";
  const [codigo, setCodigo] = useState(() => normalizarCodigo(params.get("codigo") ?? ""));
  const [activando, setActivando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emergencia, setEmergencia] = useState(false);

  const activar = useCallback(
    async (valor: string) => {
      const c = normalizarCodigo(valor);
      if (c.length !== 9) return setError("El código tiene 8 caracteres, como K7P4-Q2XM.");
      setActivando(true);
      setError(null);
      try {
        const r = await api.activarCodigo(c);
        router.push(`/hospital/pacientes/${encodeURIComponent(r.dpi)}`);
      } catch (e) {
        const ea = aErrorApi(e);
        setError(MENSAJE_CODIGO[ea.codigo] ?? ea.mensaje);
        setActivando(false);
      }
    },
    [router]
  );

  const desdeQR = useCallback(
    (c: string) => {
      setCodigo(c);
      void activar(c);
    },
    [activar]
  );

  return (
    <>
      {vencido && (
        <div className="mb-6 flex items-start gap-3 rounded-[14px] border border-linea bg-superficie p-4" role="status">
          <TimerOff className="mt-0.5 h-5 w-5 shrink-0 text-kraft-tinta" aria-hidden="true" />
          <p>
            <span className="font-semibold">El acceso a ese expediente venció.</span> Pide un código nuevo a la paciente.
          </p>
        </div>
      )}

      <h1 className="text-[2rem] leading-tight text-primario sm:text-[2.4rem]">Abrir un expediente</h1>
      <p className="mt-2 max-w-[60ch] text-tinta-suave">Pide a la paciente el código de Sigo o escanea su QR. Solo verás su historial mientras el acceso esté vigente.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void activar(codigo);
        }}
        className="mt-7"
        noValidate
      >
        <Etiqueta htmlFor="codigo">Código de la paciente</Etiqueta>
        <div className="mt-1.5 flex flex-col gap-3 sm:flex-row">
          <Entrada
            id="codigo"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="K7P4-Q2XM"
            value={codigo}
            onChange={(e) => setCodigo(normalizarCodigo(e.target.value))}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "codigo-error" : undefined}
            className={cn("num min-h-14 flex-1 font-mono text-[1.4rem] uppercase tracking-[0.18em]", error && "border-alerta")}
          />
          <Boton type="submit" tamaño="lg" disabled={activando}>
            {activando ? <LoaderCircle className="animate-spin" /> : <KeyRound />} Abrir
          </Boton>
        </div>
        {error && <MensajeError id="codigo-error" className="mt-2">{error}</MensajeError>}
      </form>
      <div className="mt-3">
        <EscanerQR onCodigo={desdeQR} />
      </div>

      <section className="mt-12 border-t border-linea pt-8" aria-labelledby="titulo-emergencia">
        <h2 id="titulo-emergencia" className="text-[1.25rem] font-semibold">
          ¿La paciente no puede darte el código?
        </h2>
        <p className="mt-1.5 max-w-[60ch] text-tinta-suave">Si llega inconsciente o no puede hablar, abre un acceso de emergencia. Solo muestra alergias, condiciones crónicas y medicamentos, dura 1 hora y queda en rojo en su bitácora, con el motivo.</p>
        {emergencia ? (
          <FormularioEmergencia onCancelar={() => setEmergencia(false)} />
        ) : (
          <Boton variante="secundario" tamaño="lg" className="mt-4 border-alerta/40 text-alerta hover:border-alerta/60 hover:bg-alerta-fondo" onClick={() => setEmergencia(true)}>
            <Siren /> Acceso de emergencia
          </Boton>
        )}
      </section>
    </>
  );
}

function FormularioEmergencia({ onCancelar }: { onCancelar: () => void }) {
  const router = useRouter();
  const [dpi, setDpi] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ campo: "dpi" | "motivo" | "general"; mensaje: string } | null>(null);

  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    const id = normalizarIdentificador(dpi);
    if (!esIdentificador(id)) return setError({ campo: "dpi", mensaje: "Escribe los 13 dígitos del DPI, o el identificador TMP-." });
    if (motivo.trim().length < 10) return setError({ campo: "motivo", mensaje: "Escribe el motivo, con al menos 10 caracteres." });
    setEnviando(true);
    setError(null);
    try {
      const r = await api.emergencia({ dpi: id, motivo: motivo.trim() });
      router.push(`/hospital/pacientes/${encodeURIComponent(r.dpi)}`);
    } catch (err) {
      const ea = aErrorApi(err);
      setError({ campo: ea.codigo === "motivo_requerido" ? "motivo" : ea.codigo === "identificador_invalido" || ea.codigo === "no_existe" ? "dpi" : "general", mensaje: ea.mensaje });
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={abrir} className="mt-5 space-y-4 rounded-[18px] border-2 border-alerta/40 bg-superficie p-4 sm:p-6" noValidate aria-label="Acceso de emergencia">
      <div className="space-y-1.5">
        <Etiqueta htmlFor="e-dpi">DPI de la paciente</Etiqueta>
        <Entrada
          id="e-dpi"
          inputMode="numeric"
          autoComplete="off"
          value={dpi}
          onChange={(e) => setDpi(e.target.value)}
          aria-invalid={error?.campo === "dpi"}
          aria-describedby={error?.campo === "dpi" ? "e-dpi-error" : undefined}
          className={cn("num font-mono text-[1.1rem] tracking-[0.04em]", error?.campo === "dpi" && "border-alerta")}
        />
        {error?.campo === "dpi" && <MensajeError id="e-dpi-error">{error.mensaje}</MensajeError>}
      </div>
      <div className="space-y-1.5">
        <Etiqueta htmlFor="e-motivo">Motivo de la emergencia</Etiqueta>
        <AreaTexto
          id="e-motivo"
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Llega inconsciente a emergencias"
          aria-invalid={error?.campo === "motivo"}
          aria-describedby={error?.campo === "motivo" ? "e-motivo-error" : "e-motivo-ayuda"}
          className={cn(error?.campo === "motivo" && "border-alerta")}
        />
        {error?.campo === "motivo" ? (
          <MensajeError id="e-motivo-error">{error.mensaje}</MensajeError>
        ) : (
          <p id="e-motivo-ayuda" className="text-[0.88rem] text-tinta-tenue">
            La paciente lo verá en su bitácora.
          </p>
        )}
      </div>
      {error?.campo === "general" && <MensajeError>{error.mensaje}</MensajeError>}
      <div className="flex flex-wrap gap-2.5">
        <Boton type="submit" variante="alerta" tamaño="lg" disabled={enviando}>
          {enviando ? <LoaderCircle className="animate-spin" /> : <Siren />} Abrir acceso de emergencia
        </Boton>
        <Boton type="button" variante="secundario" tamaño="lg" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

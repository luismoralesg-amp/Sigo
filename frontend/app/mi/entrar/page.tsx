"use client";
/**
 * /mi/entrar · paciente. Entrar con DPI y PIN.
 * Endpoint: POST /auth/paciente. 401 pin_incorrecto → "DPI o PIN incorrectos", sin decir cuál; 429 → espera 15 minutos.
 * Después de entrar, si GET /me dice debe_cambiar_pin, va a /mi/pin.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Logo } from "@/components/marca/logo";
import { PanelMarca } from "@/components/marca/panel";
import { Boton, BarraAccion } from "@/components/ui/button";
import { Entrada, Etiqueta } from "@/components/ui/input";
import { MensajeError } from "@/components/estado";
import { esIdentificador, normalizarIdentificador, USA_MOCKS } from "@/lib/api/cliente";
import { aErrorApi } from "@/lib/api/errores";
import { entrarPaciente } from "@/lib/api/sesion";
import { cn } from "@/lib/utils";

export default function PaginaEntrarPaciente() {
  const router = useRouter();
  const [dpi, setDpi] = useState("");
  const [pin, setPin] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<{ campo: "dpi" | "pin" | "general"; mensaje: string } | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    const id = normalizarIdentificador(dpi);
    if (!esIdentificador(id)) return setError({ campo: "dpi", mensaje: "Escribe los 13 dígitos de tu DPI." });
    if (!/^\d{6}$/.test(pin)) return setError({ campo: "pin", mensaje: "El PIN tiene 6 dígitos." });
    setEntrando(true);
    setError(null);
    try {
      const u = await entrarPaciente(id, pin);
      router.replace(u.debe_cambiar_pin ? "/mi/pin" : "/mi");
    } catch (err) {
      const ea = aErrorApi(err);
      setError({
        campo: "general",
        mensaje: ea.codigo === "pin_incorrecto" ? "DPI o PIN incorrectos." : ea.codigo === "demasiados_intentos" ? "Demasiados intentos. Espera 15 minutos y vuelve a probar." : ea.mensaje,
      });
      setPin("");
      setEntrando(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <PanelMarca titulo="Tu historial, contigo. Tú decides quién lo ve." />
      <main className="flex flex-col px-4 py-8 sm:px-10 lg:justify-center lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="lg:hidden">
            <Logo tamaño="lg" animado />
          </div>
          <h1 className="titulo mt-8 lg:mt-0">Ver mi historial</h1>
          <p className="mt-2 text-tinta-suave">Entra con tu DPI y el PIN de 6 números que te dieron en el puesto de salud.</p>

          <form onSubmit={entrar} className="mt-7 space-y-5" noValidate>
            <div className="space-y-1.5">
              <Etiqueta htmlFor="dpi">DPI</Etiqueta>
              <Entrada
                id="dpi"
                inputMode="numeric"
                autoComplete="username"
                placeholder="2547 89633 0801"
                value={dpi}
                onChange={(e) => setDpi(e.target.value)}
                aria-invalid={error?.campo === "dpi"}
                aria-describedby={error?.campo === "dpi" ? "error-dpi" : undefined}
                className={cn("num min-h-14 text-[1.15rem] tracking-[0.04em]", error?.campo === "dpi" && "border-alerta")}
              />
              {error?.campo === "dpi" && <MensajeError id="error-dpi">{error.mensaje}</MensajeError>}
            </div>
            <div className="space-y-1.5">
              <Etiqueta htmlFor="pin">PIN</Etiqueta>
              <Entrada
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                aria-invalid={error?.campo === "pin"}
                aria-describedby={error?.campo === "pin" ? "error-pin" : undefined}
                className={cn("num min-h-14 text-[1.4rem] tracking-[0.5em]", error?.campo === "pin" && "border-alerta")}
              />
              {error?.campo === "pin" && <MensajeError id="error-pin">{error.mensaje}</MensajeError>}
            </div>
            {error?.campo === "general" && <MensajeError>{error.mensaje}</MensajeError>}
            <BarraAccion soloMovil>
              <Boton type="submit" tamaño="accion" disabled={entrando}>
                {entrando && <LoaderCircle className="animate-spin" />} {entrando ? "Entrando…" : "Ver mi historial"}
              </Boton>
            </BarraAccion>
          </form>

          <p className="mt-6 text-[0.92rem] text-tinta-suave">¿No tienes PIN? Pídelo en tu puesto de salud.</p>
          {USA_MOCKS && <p className="cifra mt-2 text-[0.92rem] text-tinta-suave">Demo: DPI 2547 89633 0801, PIN 482193.</p>}
          <p className="mt-8 border-t border-linea pt-5 text-[0.92rem] text-tinta-suave">
            ¿Trabajas en un puesto u hospital?{" "}
            <Link href="/login" className="inline-flex min-h-12 items-center font-semibold text-primario underline">
              Entrada del personal
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

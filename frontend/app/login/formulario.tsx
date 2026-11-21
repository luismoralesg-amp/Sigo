"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Boton, BarraAccion } from "@/components/ui/button";
import { Entrada, Etiqueta } from "@/components/ui/input";
import { MensajeError } from "@/components/estado";
import { entrarPersonal, INICIO_POR_ROL } from "@/lib/api/sesion";
import { USA_MOCKS } from "@/lib/api/cliente";
import { aErrorApi } from "@/lib/api/errores";
import { cn } from "@/lib/utils";

const DEMO = [
  { correo: "ana.tzul@sigo.demo", titulo: "Ana Tzul", detalle: "Enfermera, Puesto de Salud de Chichicastenango" },
  { correo: "mateo.us@sigo.demo", titulo: "Dr. Mateo Us", detalle: "Médico, Hospital Regional de Quiché" },
];

export function FormularioEntrada() {
  const router = useRouter();
  const [correo, setCorreo] = useState(USA_MOCKS ? DEMO[0].correo : "");
  const [clave, setClave] = useState(USA_MOCKS ? "demostracion" : "");
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setError(null);
    try {
      const u = await entrarPersonal(correo, clave);
      router.replace(INICIO_POR_ROL[u.rol]);
    } catch (err) {
      setError(aErrorApi(err).mensaje);
      setEntrando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="mt-7 space-y-5" noValidate>
      {USA_MOCKS && (
        <fieldset>
          <legend className="mb-2.5 text-[0.92rem] font-semibold text-tinta-suave">Cuentas de demostración</legend>
          <div className="grid gap-2.5" role="radiogroup">
            {DEMO.map((d) => {
              const on = correo === d.correo;
              return (
                <button
                  key={d.correo}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setCorreo(d.correo)}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-3 rounded-[12px] border bg-superficie px-4 py-2.5 text-left",
                    on ? "border-2 border-primario" : "border-linea hover:border-linea-fuerte"
                  )}
                >
                  <span className={cn("h-5 w-5 shrink-0 rounded-full border-2", on ? "border-[6px] border-primario" : "border-linea-fuerte")} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug">{d.titulo}</span>
                    <span className="block text-[0.92rem] text-tinta-suave">{d.detalle}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="space-y-1.5">
        <Etiqueta htmlFor="correo">Correo</Etiqueta>
        <Entrada id="correo" type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Etiqueta htmlFor="clave">Contraseña</Etiqueta>
        <Entrada id="clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
      </div>

      <MensajeError>{error}</MensajeError>

      <BarraAccion soloMovil>
        <Boton type="submit" tamaño="accion" disabled={entrando}>
          {entrando && <LoaderCircle className="animate-spin" />}
          {entrando ? "Entrando…" : "Entrar"}
        </Boton>
      </BarraAccion>

      <p className="pt-2 text-center text-tinta-suave">
        ¿Eres paciente?{" "}
        <Link href="/mi/entrar" className="inline-flex min-h-12 items-center gap-1 font-semibold text-primario underline">
          Entra con tu DPI y PIN <ArrowRight className="h-4 w-4" />
        </Link>
      </p>
    </form>
  );
}

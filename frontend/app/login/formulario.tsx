"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Boton, BarraAccion } from "@/components/ui/button";
import { Entrada, Etiqueta } from "@/components/ui/input";
import { MensajeError } from "@/components/estado";
import { entrarPersonal, entrarPersonalDev, INICIO_POR_ROL } from "@/lib/api/sesion";
import { USA_SUPABASE } from "@/lib/api/cliente";
import { aErrorApi } from "@/lib/api/errores";
import { cn } from "@/lib/utils";

const CUENTAS = [
  { rol: "enfermera" as const, correo: "ana.tzul@sigo.demo", titulo: "Ana Tzul", detalle: "Enfermera" },
  { rol: "medico" as const, correo: "mateo.us@sigo.demo", titulo: "Dr. Mateo Us", detalle: "Médico" },
];

export function FormularioEntrada() {
  const router = useRouter();
  const [rol, setRol] = useState<(typeof CUENTAS)[number]["rol"]>(CUENTAS[0].rol);
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setError(null);
    try {
      const u = USA_SUPABASE ? await entrarPersonal(correo, clave) : await entrarPersonalDev(rol);
      router.replace(INICIO_POR_ROL[u.rol]);
    } catch (err) {
      const ea = aErrorApi(err);
      setError(ea.status === 404 ? "El servidor no tiene activo el acceso de demostración del personal." : ea.mensaje);
      setEntrando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="mt-7 space-y-5" noValidate>
      {USA_SUPABASE ? (
        <>
          <div className="space-y-1.5">
            <Etiqueta htmlFor="correo">Correo</Etiqueta>
            <Entrada id="correo" type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Etiqueta htmlFor="clave">Contraseña</Etiqueta>
            <Entrada id="clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
          </div>
        </>
      ) : (
        <fieldset>
          <legend className="mb-2.5 text-[0.92rem] font-semibold text-tinta-suave">Cuentas de demostración</legend>
          <div className="grid gap-2.5" role="radiogroup" aria-label="Cuenta de personal">
            {CUENTAS.map((d) => {
              const on = rol === d.rol;
              return (
                <button
                  key={d.rol}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setRol(d.rol)}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-3 rounded-[12px] border bg-superficie px-4 py-2.5 text-left",
                    on ? "border-2 border-primario" : "border-linea hover:border-linea-fuerte"
                  )}
                >
                  <span className={cn("h-5 w-5 shrink-0 rounded-full border-2", on ? "border-[6px] border-primario" : "border-linea-fuerte")} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug">{d.titulo}</span>
                    <span className="block text-[0.92rem] text-tinta-suave">{d.detalle}</span>
                    <span className="block text-[0.88rem] text-tinta-suave">{d.correo}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

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

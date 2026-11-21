"use client";
/**
 * /mi/pin · paciente. Cambiar el PIN; obligatorio la primera vez que entra (debe_cambiar_pin).
 * Endpoint: PUT /me/pin → 204.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle } from "lucide-react";
import { Shell } from "@/components/shell";
import { Boton, BarraAccion } from "@/components/ui/button";
import { Entrada, Etiqueta } from "@/components/ui/input";
import { MensajeError } from "@/components/estado";
import { api } from "@/lib/api/cliente";
import { aErrorApi } from "@/lib/api/errores";
import { useUsuario } from "@/lib/api/sesion";
import { cn } from "@/lib/utils";

type Campo = "actual" | "nuevo" | "repetir" | "general";

export default function PaginaPin() {
  const { usuario, actualizar } = useUsuario();
  const router = useRouter();
  const obligatorio = usuario.debe_cambiar_pin;
  const [v, setV] = useState({ actual: "", nuevo: "", repetir: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ campo: Campo; mensaje: string } | null>(null);
  const [listo, setListo] = useState(false);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value.replace(/\D/g, "").slice(0, 6) });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (v.actual.length !== 6) return setError({ campo: "actual", mensaje: "Escribe tu PIN actual, de 6 números." });
    if (v.nuevo.length !== 6) return setError({ campo: "nuevo", mensaje: "El PIN nuevo tiene que tener 6 números." });
    if (v.nuevo === v.actual) return setError({ campo: "nuevo", mensaje: "Elige un PIN distinto al actual." });
    if (v.repetir !== v.nuevo) return setError({ campo: "repetir", mensaje: "Los dos PIN nuevos no son iguales." });
    setGuardando(true);
    setError(null);
    try {
      await api.cambiarPin({ pin_actual: v.actual, pin_nuevo: v.nuevo });
      actualizar({ ...usuario, debe_cambiar_pin: false });
      setListo(true);
    } catch (err) {
      const ea = aErrorApi(err);
      setError({ campo: ea.codigo === "pin_incorrecto" ? "actual" : "general", mensaje: ea.codigo === "pin_incorrecto" ? "El PIN actual no es correcto." : ea.mensaje });
      setGuardando(false);
    }
  }

  const campo = (k: Exclude<Campo, "general">, etiqueta: string, ayuda?: string) => (
    <div className="space-y-1.5">
      <Etiqueta htmlFor={`pin-${k}`}>{etiqueta}</Etiqueta>
      <Entrada
        id={`pin-${k}`}
        type="password"
        inputMode="numeric"
        autoComplete={k === "actual" ? "current-password" : "new-password"}
        maxLength={6}
        value={v[k]}
        onChange={set(k)}
        aria-invalid={error?.campo === k}
        aria-describedby={error?.campo === k ? `error-${k}` : ayuda ? `ayuda-${k}` : undefined}
        className={cn("num min-h-14 text-[1.4rem] tracking-[0.5em]", error?.campo === k && "border-alerta")}
      />
      {error?.campo === k ? <MensajeError id={`error-${k}`}>{error.mensaje}</MensajeError> : ayuda && <p id={`ayuda-${k}`} className="text-[0.95rem] text-tinta-suave">{ayuda}</p>}
    </div>
  );

  if (listo)
    return (
      <Shell>
        <div className="mx-auto max-w-md py-10 text-center" role="status">
          <CircleCheck className="mx-auto h-12 w-12 text-confirmado" aria-hidden="true" />
          <h1 className="titulo mt-4">Listo, tu PIN cambió</h1>
          <p className="mt-2 text-tinta-suave">Desde ahora entras con el PIN nuevo. Nadie más lo conoce, ni el puesto de salud.</p>
          <BarraAccion>
            <Boton tamaño="accion" onClick={() => router.replace("/mi")}>
              Ver mi historial
            </Boton>
          </BarraAccion>
        </div>
      </Shell>
    );

  return (
    <Shell>
      <div className="mx-auto max-w-md">
        <h1 className="titulo">{obligatorio ? "Primero, elige tu propio PIN" : "Cambiar mi PIN"}</h1>
        <p className="mt-2 text-tinta-suave">
          {obligatorio ? "El PIN que te dieron en el puesto sirve solo para esta primera vez. Cámbialo por uno que solo tú sepas." : "Escribe tu PIN actual y el nuevo."}
        </p>
        <form onSubmit={guardar} className="mt-7 space-y-5" noValidate>
          {campo("actual", obligatorio ? "PIN que te dieron en el puesto" : "PIN actual")}
          {campo("nuevo", "PIN nuevo", "6 números. Evita tu fecha de nacimiento o 123456.")}
          {campo("repetir", "Repite el PIN nuevo")}
          {error?.campo === "general" && <MensajeError>{error.mensaje}</MensajeError>}
          <BarraAccion>
            <Boton type="submit" tamaño="accion" disabled={guardando}>
              {guardando && <LoaderCircle className="animate-spin" />} Guardar PIN nuevo
            </Boton>
          </BarraAccion>
        </form>
      </div>
    </Shell>
  );
}

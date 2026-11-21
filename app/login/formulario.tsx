"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Hospital, Check, ArrowRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { Boton } from "@/components/ui/button";
import { Entrada, Etiqueta } from "@/components/ui/input";
import { USUARIOS } from "@/datos/demo";
import { cn } from "@/lib/utils";

const OPCIONES = [
  { rol: "puesto" as const, icono: Building2, titulo: USUARIOS.puesto.centro.nombre, detalle: "Totonicapán · Digitalizar e importar" },
  { rol: "hospital" as const, icono: Hospital, titulo: USUARIOS.hospital.centro.nombre, detalle: "Quetzaltenango · Consultar expedientes" },
];

export function FormularioEntrada() {
  const router = useRouter();
  const [rol, setRol] = useState<"puesto" | "hospital">("puesto");
  const [correo, setCorreo] = useState<string>(USUARIOS.puesto.correo);
  const [entrando, setEntrando] = useState(false);

  function elegir(r: "puesto" | "hospital") {
    setRol(r);
    setCorreo(USUARIOS[r].correo);
  }

  function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setTimeout(() => router.push(rol === "puesto" ? "/puesto" : "/hospital"), 450);
  }

  return (
    <form onSubmit={entrar} className="mt-7 space-y-6">
      <fieldset>
        <legend className="mb-2.5 text-[0.9rem] font-semibold text-tinta-suave">Centro de salud</legend>
        <div className="space-y-3" role="radiogroup">
          {OPCIONES.map(({ rol: r, icono: Icono, titulo, detalle }) => {
            const activo = rol === r;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => elegir(r)}
                className={cn(
                  "flex w-full items-center gap-3.5 rounded-[16px] border bg-superficie p-3.5 text-left transition-all duration-200",
                  activo ? "border-primario shadow-[0_0_0_3px_rgba(40,54,89,.14)]" : "border-linea hover:border-linea-fuerte"
                )}
              >
                <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-[12px] transition-colors", activo ? "bg-primario text-white" : "bg-papel text-tinta-suave")}>
                  <Icono className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">{titulo}</span>
                  <span className="block text-[0.85rem] text-tinta-tenue">{detalle}</span>
                </span>
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors", activo ? "border-primario bg-primario text-white" : "border-linea-fuerte")}>
                  {activo && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.18 }}>
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </motion.span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Etiqueta htmlFor="correo">Correo</Etiqueta>
          <Entrada id="correo" type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Etiqueta htmlFor="clave">Contraseña</Etiqueta>
          <Entrada id="clave" type="password" autoComplete="current-password" defaultValue="demostracion" />
        </div>
      </div>

      <Boton type="submit" tamaño="lg" className="w-full" disabled={entrando}>
        {entrando ? <Loader2 className="animate-spin" /> : null}
        {entrando ? "Entrando…" : "Entrar"}
        {!entrando && <ArrowRight />}
      </Boton>
    </form>
  );
}

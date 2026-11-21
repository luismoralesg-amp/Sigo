"use client";
/**
 * Estados que cada pantalla con datos dibuja (contrato, "Pantallas y rutas"): cargando, vacío, error y sin señal.
 * Los errores que cambian de pantalla (sin_sesion, acceso_vencido) redirigen solos.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, FileQuestion, Lock, RotateCcw, CircleAlert, type LucideIcon } from "lucide-react";
import type { ErrorApi } from "@/lib/api/errores";
import { salir } from "@/lib/api/sesion";
import { Boton } from "@/components/ui/button";
import { Esqueleto } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function Cargando({ className, filas = 3 }: { className?: string; filas?: number }) {
  return (
    <div className={cn("space-y-4", className)} role="status" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <Esqueleto className="h-9 w-2/3" />
      <Esqueleto className="h-5 w-1/2" />
      {Array.from({ length: filas }, (_, i) => (
        <Esqueleto key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

const PRESENTACION: Partial<Record<ErrorApi["codigo"], { icono: LucideIcon; titulo: string }>> = {
  sin_senal: { icono: CloudOff, titulo: "Sin señal" },
  rol_no_permitido: { icono: Lock, titulo: "No tienes acceso" },
  solo_emergencia: { icono: Lock, titulo: "Acceso de emergencia" },
  no_existe: { icono: FileQuestion, titulo: "No encontrado" },
};

export function ErrorPantalla({ error, onReintentar, children }: { error: ErrorApi; onReintentar?: () => void; children?: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (error.codigo === "sin_sesion") void salir().then((r) => router.replace(r));
    if (error.codigo === "acceso_vencido") router.replace("/hospital?vencido=1");
  }, [error, router]);

  if (error.codigo === "sin_sesion" || error.codigo === "acceso_vencido") return <Cargando filas={1} />;

  const p = PRESENTACION[error.codigo] ?? { icono: CircleAlert, titulo: "Algo no salió bien" };
  const Icono = p.icono;
  const reintentable = error.codigo === "sin_senal" || error.status >= 500 || error.status === 0;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-14 text-center" role="alert">
      <span className={cn("grid h-14 w-14 place-items-center rounded-full", error.codigo === "sin_senal" ? "bg-revisar-fondo text-revisar-tinta" : "bg-primario-suave text-primario")}>
        <Icono className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-[1.5rem] font-semibold">{p.titulo}</h1>
      <p className="mt-2 text-tinta-suave">{error.mensaje}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {reintentable && onReintentar && (
          <Boton onClick={onReintentar}>
            <RotateCcw /> Intentar de nuevo
          </Boton>
        )}
        {children}
      </div>
    </div>
  );
}

/** Mensaje de error junto a un formulario o campo (400 de la tabla: se marca en rojo). */
export function MensajeError({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className={cn("flex items-start gap-2 text-[0.92rem] font-medium text-alerta", className)}>
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

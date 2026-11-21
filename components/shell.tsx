import Link from "next/link";
import { Building2, Hospital, LogOut, ChartColumn } from "lucide-react";
import { Logo } from "@/components/marca/logo";
import { USUARIOS } from "@/datos/demo";
import { cn } from "@/lib/utils";
import { IndicadorConexion } from "@/components/ficha/indicador-conexion";

export function Shell({ rol, children, ancho = "normal" }: { rol: "puesto" | "hospital"; children: React.ReactNode; ancho?: "normal" | "amplio" }) {
  const u = USUARIOS[rol];
  const IconoCentro = rol === "puesto" ? Building2 : Hospital;
  return (
    <div className="min-h-dvh">
      <header className="border-b border-linea bg-superficie/85 backdrop-blur supports-[backdrop-filter]:bg-superficie/75">
        <div className={cn("mx-auto flex items-center gap-3 px-4 py-2.5 sm:px-6", ancho === "amplio" ? "max-w-6xl" : "max-w-3xl")}>
          <Link href={rol === "puesto" ? "/puesto" : "/hospital"} className="shrink-0 rounded-lg" aria-label="Inicio">
            <Logo className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-2.5">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-linea bg-papel py-1.5 pl-2 pr-3.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primario-suave text-primario">
                <IconoCentro className="h-4 w-4" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[0.82rem] font-semibold text-tinta">{u.centro.nombre}</span>
                <span className="block truncate text-[0.74rem] text-tinta-tenue">{u.nombre} · {u.cargo}</span>
              </span>
            </div>
            {rol === "hospital" && (
              <Link href="/tablero" className="hidden min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.9rem] font-semibold text-tinta-suave transition-colors hover:bg-papel hover:text-tinta sm:inline-flex">
                <ChartColumn className="h-5 w-5" /> Tablero
              </Link>
            )}
            {rol === "hospital" && (
              <Link href="/tablero" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-tinta-suave hover:bg-papel sm:hidden" aria-label="Tablero">
                <ChartColumn className="h-5 w-5" />
              </Link>
            )}
            <Link href="/login" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-tinta-suave transition-colors hover:bg-papel hover:text-tinta" aria-label="Salir">
              <LogOut className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>
      {rol === "puesto" && <IndicadorConexion />}
      <main className={cn("mx-auto px-4 pb-16 pt-6 sm:px-6 sm:pt-10", ancho === "amplio" ? "max-w-6xl" : "max-w-3xl")}>{children}</main>
    </div>
  );
}

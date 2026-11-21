"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/marca/logo";
import { IndicadorConexion } from "@/components/ficha/indicador-conexion";
import { INICIO_POR_ROL, salir, useUsuario } from "@/lib/api/sesion";
import type { Rol } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAVEGACION: Record<Rol, Array<{ href: string; texto: string; exacta?: boolean }>> = {
  enfermera: [
    { href: "/puesto", texto: "Pacientes" },
    { href: "/puesto/importar", texto: "Importar archivo", exacta: true },
  ],
  paciente: [
    { href: "/mi", texto: "Mi historial", exacta: true },
    { href: "/mi/compartir", texto: "Compartir" },
    { href: "/mi/accesos", texto: "Quién lo vio" },
    { href: "/mi/pin", texto: "PIN" },
  ],
  medico: [{ href: "/hospital", texto: "Abrir expediente" }],
};

function activa(ruta: string, href: string, exacta?: boolean) {
  if (exacta) return ruta === href;
  if (href === "/puesto") return ruta === "/puesto" || (ruta.startsWith("/puesto/") && !ruta.startsWith("/puesto/importar"));
  return ruta === href || ruta.startsWith(href + "/");
}

export function Shell({ children, ancho = "normal", banda }: { children: React.ReactNode; ancho?: "normal" | "amplio"; banda?: React.ReactNode }) {
  const { usuario } = useUsuario();
  const ruta = usePathname();
  const router = useRouter();
  const nav = NAVEGACION[usuario.rol];
  const contenedor = ancho === "amplio" ? "max-w-6xl" : "max-w-3xl";

  return (
    <div className="min-h-dvh">
      {banda}
      <header className="border-b border-linea bg-superficie">
        <div className={cn("mx-auto flex items-center gap-3 px-4 pt-2.5 sm:px-6", contenedor)}>
          <Link href={INICIO_POR_ROL[usuario.rol]} className="shrink-0 rounded-lg" aria-label="Sigo, inicio">
            <Logo className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
          </Link>
          <div className="ml-auto min-w-0 text-right leading-tight">
            <p className="truncate text-[0.9rem] font-semibold text-tinta">{usuario.nombre}</p>
            <p className="truncate text-[0.8rem] text-tinta-tenue">{usuario.centro?.nombre ?? "Tu historial"}</p>
          </div>
          <button
            onClick={async () => router.replace(await salir())}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-tinta-suave transition-colors hover:bg-papel hover:text-tinta"
            aria-label="Salir"
            title="Salir"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        <nav aria-label="Secciones" className={cn("mx-auto flex gap-1 overflow-x-auto px-2 sm:px-4", contenedor)}>
          {nav.map((n) => {
            const on = activa(ruta, n.href, n.exacta);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex min-h-12 shrink-0 items-center px-3 text-[0.95rem] font-semibold transition-colors",
                  on ? "text-primario after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t after:bg-kraft-borde" : "text-tinta-suave hover:text-tinta"
                )}
              >
                {n.texto}
              </Link>
            );
          })}
        </nav>
      </header>
      <IndicadorConexion />
      <main className={cn("mx-auto px-4 pb-16 pt-6 sm:px-6 sm:pt-9", contenedor)}>{children}</main>
    </div>
  );
}

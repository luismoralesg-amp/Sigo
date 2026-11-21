import type { Metadata } from "next";
import { FormularioEntrada } from "./formulario";
import { Logo } from "@/components/marca/logo";
import { IlustracionPuente } from "./ilustracion";

export const metadata: Metadata = { title: "Entrar" };

export default function PaginaLogin() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Panel de concepto (desktop) */}
      <aside className="relative hidden overflow-hidden border-r border-kraft-borde/60 papel-kraft-fuerte lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Logo tamaño="lg" />
        <IlustracionPuente />
        <div className="max-w-md">
          <p className="font-serif text-[1.55rem] leading-snug text-kraft-tinta">
            “El país está digitalizando el futuro, pero nadie está rescatando el pasado.”
          </p>
          <p className="mt-3 text-[0.95rem] text-kraft-tinta/85">Fichas en papel y sistemas antiguos de los puestos de salud, unidos en un solo expediente ligado al DPI.</p>
        </div>
      </aside>

      {/* Formulario */}
      <main className="flex flex-col px-4 py-8 sm:px-10 lg:justify-center lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="lg:hidden">
            <Logo tamaño="lg" animado />
          </div>
          <h1 className="mt-8 text-[2.1rem] font-semibold leading-[1.1] sm:text-[2.5rem] lg:mt-0">
            Conservamos el papel.
            <br />
            <span className="italic text-primario">Le agregamos memoria.</span>
          </h1>
          <p className="mt-3 text-tinta-suave">Elige desde dónde trabajas hoy para entrar.</p>
          <FormularioEntrada />
          <p className="mt-10 text-center text-[0.8rem] text-tinta-tenue">Versión de demostración · todos los pacientes son inventados</p>
        </div>
      </main>
    </div>
  );
}

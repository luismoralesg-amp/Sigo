import type { Metadata } from "next";
import { FormularioEntrada } from "./formulario";
import { Logo } from "@/components/marca/logo";
import { PanelMarca } from "@/components/marca/panel";

export const metadata: Metadata = { title: "Entrar" };

export default function PaginaLogin() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <PanelMarca titulo="La paciente decide quién ve su historial." />
      <main className="relative flex flex-col overflow-hidden px-4 py-8 sm:px-10 lg:justify-center lg:px-16">
        <div className="relative mx-auto w-full max-w-md">
          <div className="lg:hidden">
            <Logo tamaño="lg" animado />
          </div>
          <h1 className="mt-10 text-[2.4rem] leading-[1.03] text-primario sm:text-[2.8rem] lg:mt-0">Entrar al puesto o al hospital</h1>
          <p className="mt-3 text-tinta-suave">Para el personal de salud. Usa el correo de tu centro.</p>
          <FormularioEntrada />
        </div>
      </main>
    </div>
  );
}

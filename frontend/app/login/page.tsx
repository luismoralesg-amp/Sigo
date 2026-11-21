import type { Metadata } from "next";
import { FormularioEntrada } from "./formulario";
import { Logo } from "@/components/marca/logo";
import { PanelMarca } from "@/components/marca/panel";
import { USA_SUPABASE } from "@/lib/api/cliente";

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
          <h1 className="titulo mt-8 lg:mt-0">Entrar al puesto o al hospital</h1>
          <p className="mt-2 text-tinta-suave">
            {USA_SUPABASE ? "Para el personal de salud. Usa el correo de tu centro." : "Para el personal de salud. Elige la cuenta de tu centro."}
          </p>
          <FormularioEntrada />
        </div>
      </main>
    </div>
  );
}

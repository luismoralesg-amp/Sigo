import type { Metadata } from "next";
import { FormularioEntrada } from "./formulario";
import { Logo, Manchas } from "@/components/marca/logo";

export const metadata: Metadata = { title: "Entrar" };

const PASOS = [
  { n: "01", titulo: "Foto", texto: "La enfermera fotografía la ficha con su celular." },
  { n: "02", titulo: "IA", texto: "Lee la letra y ordena los datos." },
  { n: "03", titulo: "Persona", texto: "Confirma y lo guarda con el DPI." },
];

export default function PaginaLogin() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca (desktop) */}
      <aside className="relative hidden overflow-hidden bg-primario text-[#EEEAE5] lg:flex lg:flex-col lg:justify-between lg:p-14">
        <Manchas variante="marino" />
        <div className="relative">
          <Logo tamaño="lg" invertido />
        </div>
        <div className="relative">
          <p className="ceja ceja-clara">La solución</p>
          <h2 className="mt-5 max-w-xl text-[2.8rem] font-bold leading-[1.02] text-[#EEEAE5]">Una foto. Datos. Un historial que viaja.</h2>
          <ol className="mt-9 grid grid-cols-3 gap-3">
            {PASOS.map((p, i) => (
              <li key={p.n} className={i === 2 ? "rounded-[18px] bg-kraft-borde p-5 text-primario" : "rounded-[18px] bg-[#31416a] p-5"}>
                <span className={i === 2 ? "font-display text-[1rem] font-bold text-primario/70" : "font-display text-[1rem] font-bold text-[#e3bd96]"}>{p.n}</span>
                <p className="mt-2 font-display text-[1.4rem] font-bold leading-none">{p.titulo}</p>
                <p className={i === 2 ? "mt-2 text-[0.9rem] leading-snug text-primario/85" : "mt-2 text-[0.9rem] leading-snug text-[#EEEAE5]/80"}>{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
        <p className="relative text-[0.82rem] tracking-[0.2em] text-[#EEEAE5]/70">CONSERVAMOS EL PAPEL.</p>
      </aside>

      {/* Formulario */}
      <main className="relative flex flex-col overflow-hidden px-4 py-8 sm:px-10 lg:justify-center lg:px-16">
        <div className="relative mx-auto w-full max-w-md">
          <div className="lg:hidden">
            <Logo tamaño="lg" animado />
          </div>
          <p className="ceja mt-10 lg:mt-0">Conservamos el papel</p>
          <h1 className="mt-4 text-[2.5rem] leading-[1.02] text-primario sm:text-[2.9rem]">Tu historia te sigue.</h1>
          <p className="mt-3 text-tinta-suave">Elige desde dónde trabajas hoy para entrar.</p>
          <FormularioEntrada />
          <p className="mt-10 text-center text-[0.8rem] text-tinta-tenue">Versión de demostración · todos los pacientes son inventados</p>
        </div>
      </main>
    </div>
  );
}

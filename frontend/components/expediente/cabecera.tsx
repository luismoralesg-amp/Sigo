import { MapPin } from "lucide-react";
import type { Paciente } from "@/lib/types";
import { edadTexto, fechaCorta, mostrarIdentificador } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function CabeceraPaciente({ paciente: p, className, children }: { paciente: Paciente; className?: string; children?: React.ReactNode }) {
  const edad = edadTexto(p.fecha_nacimiento);
  const sexo = p.sexo === "F" ? "Femenino" : p.sexo === "M" ? "Masculino" : null;
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-[2rem] font-semibold leading-[1.08] text-primario sm:text-[2.5rem]">{p.nombre}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-tinta-suave">
          <span className="num rounded-[8px] border border-linea bg-superficie px-2.5 py-1 font-mono text-[0.95rem] font-semibold tracking-[0.03em] text-tinta">
            <span className="mr-1.5 font-sans text-[0.75rem] font-bold tracking-normal text-tinta-tenue">{p.dpi.startsWith("TMP-") ? "ID" : "DPI"}</span>
            {mostrarIdentificador(p.dpi)}
          </span>
          {(edad || sexo) && <span className="font-semibold text-tinta">{[edad, sexo].filter(Boolean).join(", ")}</span>}
          {p.fecha_nacimiento && <span className="num text-[0.92rem]">Nació el {fechaCorta(p.fecha_nacimiento)}</span>}
          {p.comunidad && (
            <span className="flex items-center gap-1 text-[0.92rem]">
              <MapPin className="h-4 w-4" aria-hidden="true" /> {p.comunidad}
            </span>
          )}
        </div>
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2.5">{children}</div>}
    </header>
  );
}

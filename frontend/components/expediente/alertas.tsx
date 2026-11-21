import { HeartPulse, Pill, TriangleAlert } from "lucide-react";
import type { Expediente } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Banner de alergias (P-07): se ve siempre que el paciente tenga alguna, con texto neutro
 * ("Alergia: penicilina"), no solo cuando hay una receta en conflicto. Sin alergias, no se dibuja.
 */
export function BannerAlergias({ alergias, className }: { alergias: string[]; className?: string }) {
  if (!alergias.length) return null;
  const etiqueta = alergias.length === 1 ? "Alergia" : "Alergias";
  return (
    <section
      aria-label="Alergias del paciente"
      className={cn("flex items-center gap-3 rounded-[14px] border border-alerta/35 bg-alerta-fondo px-4 py-3 sm:px-5", className)}
    >
      <TriangleAlert className="h-6 w-6 shrink-0 text-alerta" strokeWidth={2.25} aria-hidden="true" />
      <p className="text-[1.08rem] leading-snug text-tinta sm:text-[1.15rem]">
        <span className="font-bold">{etiqueta}:</span> {alergias.join(", ")}
      </p>
    </section>
  );
}

/** Las tres listas de `alertas`. Es todo lo que ve el médico en un acceso de emergencia. */
export function PanelAlertas({ alertas, className }: { alertas: Expediente["alertas"]; className?: string }) {
  const grupos = [
    { icono: TriangleAlert, titulo: "Alergias", items: alertas.alergias, vacio: "Ninguna registrada", fuerte: true },
    { icono: HeartPulse, titulo: "Condiciones crónicas", items: alertas.condiciones_cronicas, vacio: "Ninguna registrada" },
    { icono: Pill, titulo: "Medicamentos actuales", items: alertas.medicamentos, vacio: "Ninguno registrado" },
  ];
  return (
    <dl className={cn("grid gap-px overflow-hidden rounded-[16px] border border-linea bg-linea sm:grid-cols-3", className)}>
      {grupos.map(({ icono: Icono, titulo, items, vacio, fuerte }) => (
        <div key={titulo} className="bg-superficie px-4 py-4 sm:px-5">
          <dt className="flex items-center gap-2 text-[0.9rem] font-semibold text-tinta-suave">
            <Icono className={cn("h-4 w-4", fuerte && items.length ? "text-alerta" : "text-tinta-tenue")} aria-hidden="true" /> {titulo}
          </dt>
          <dd className="mt-2">
            {items.length ? (
              <ul className="space-y-1">
                {items.map((i) => (
                  <li key={i} className="text-[1.02rem] font-semibold leading-snug">
                    {i}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-tinta-tenue">{vacio}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

import { cn } from "@/lib/utils";

/** Ficha de papel cuya esquina se convierte en un pulso digital. */
export function LogoIcono({ className, animado = false }: { className?: string; animado?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("h-10 w-10", className)} aria-hidden="true">
      <path
        d="M9 7.5A2.5 2.5 0 0 1 11.5 5H28l8 8v27.5A2.5 2.5 0 0 1 33.5 43h-22A2.5 2.5 0 0 1 9 40.5z"
        fill="#E9DCC3"
        stroke="#8A7450"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M28 5v6.5A1.5 1.5 0 0 0 29.5 13H36" fill="#D8C59F" stroke="#8A7450" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 15h10M14 20h14" stroke="#8A7450" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
      <path
        d="M13 31h6l2.6-6.5 3.6 12 3-8.5 1.8 3H46"
        fill="none"
        stroke="#0F5E5A"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animado ? "[stroke-dasharray:60] [animation:trazo_1.4s_ease-out_both]" : undefined}
      />
      <circle cx="46" cy="31" r="1.9" fill="#0F5E5A" />
      <style>{`@keyframes trazo{from{stroke-dashoffset:60}to{stroke-dashoffset:0}}`}</style>
    </svg>
  );
}

export function Logo({ className, tamaño = "md", animado }: { className?: string; tamaño?: "md" | "lg"; animado?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoIcono animado={animado} className={tamaño === "lg" ? "h-14 w-14" : "h-9 w-9"} />
      <span className={cn("font-serif font-semibold leading-none tracking-tight text-tinta", tamaño === "lg" ? "text-[2rem]" : "text-[1.3rem]")}>
        Expediente <span className="text-primario italic">Vivo</span>
      </span>
    </span>
  );
}

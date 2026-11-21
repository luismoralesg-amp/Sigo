import { cn } from "@/lib/utils";

/** Isotipo SIGO: la "S" es el camino que recorre la historia del paciente; el punto cobre, la persona. */
export function LogoIcono({ className, animado = false, invertido = false }: { className?: string; animado?: boolean; invertido?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("h-10 w-10", className)} aria-hidden="true">
      <rect width="48" height="48" rx="13" fill={invertido ? "#EEEAE5" : "#283659"} />
      <path
        d="M33.2 15.6c-3.4-3-15-3.6-15.6 2.4-.6 5.9 14.4 5.2 14.6 12.2.2 6.6-11.6 7.6-15.4 4.6"
        fill="none"
        stroke={invertido ? "#283659" : "#EEEAE5"}
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
        className={animado ? "[stroke-dasharray:100] [animation:trazo-s_1.1s_cubic-bezier(.6,0,.3,1)_both]" : undefined}
      />
      <circle cx="35.2" cy="14.2" r="3.4" fill="#CC9C70" className={animado ? "[animation:punto-s_.35s_1s_ease-out_both]" : undefined} />
      <circle cx="11.9" cy="31" r="1.05" fill="#CC9C70" />
      <circle cx="12.6" cy="34.3" r="1.45" fill="#CC9C70" />
      {animado && <style>{`@keyframes trazo-s{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}@keyframes punto-s{from{transform:scale(0);transform-origin:35px 14px}to{transform:scale(1);transform-origin:35px 14px}}`}</style>}
    </svg>
  );
}

export function Logo({ className, tamaño = "md", animado, invertido }: { className?: string; tamaño?: "md" | "lg"; animado?: boolean; invertido?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <LogoIcono animado={animado} invertido={invertido} className={tamaño === "lg" ? "h-14 w-14" : "h-10 w-10"} />
      <span
        className={cn(
          "font-[family-name:var(--font-poppins)] font-bold leading-none tracking-[0.2em]",
          invertido ? "text-[#EEEAE5]" : "text-primario",
          tamaño === "lg" ? "text-[1.9rem]" : "text-[1.3rem]"
        )}
      >
        SIGO
      </span>
    </span>
  );
}

/** Manchas orgánicas con contorno cobre, como en la presentación. */
export function Manchas({ className, variante = "crema" }: { className?: string; variante?: "crema" | "marino" }) {
  const relleno = variante === "crema" ? "#283659" : "#31416a";
  const suave = variante === "crema" ? "#e3dcd6" : "#2f3d63";
  return (
    <svg className={cn("pointer-events-none absolute inset-0 h-full w-full", className)} viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="M1000 640c-120 10-210 70-250 160-30 70-40 140-60 200h310z" fill={suave} />
      <path d="M760 0c20 110 90 190 190 220 20 6 34 8 50 9V0z" fill={relleno} />
      <path d="M720 0c24 130 110 222 230 246 18 4 34 5 50 5" fill="none" stroke="#CC9C70" strokeWidth="3" />
      <path d="M0 760c120-4 210 50 240 150 8 30 12 60 13 90H0z" fill={relleno} />
      <path d="M0 720c150 0 255 70 280 190 6 30 8 60 8 90" fill="none" stroke="#CC9C70" strokeWidth="3" />
    </svg>
  );
}

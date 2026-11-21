import { cn } from "@/lib/utils";

/** Bloque de carga plano, color arena. */
export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[12px] bg-linea", className)} />;
}

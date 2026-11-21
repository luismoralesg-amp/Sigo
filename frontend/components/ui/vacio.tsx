import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EstadoVacio({ icono: Icono, titulo, texto, children, className }: { icono: LucideIcon; titulo: string; texto?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <Icono className="h-9 w-9 text-tinta-suave" strokeWidth={1.75} aria-hidden="true" />
      <h1 className="subtitulo mt-4">{titulo}</h1>
      {texto && <p className="mt-2 max-w-sm text-tinta-suave">{texto}</p>}
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

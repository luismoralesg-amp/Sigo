import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EstadoVacio({ icono: Icono, titulo, texto, children, className }: { icono: LucideIcon; titulo: string; texto?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <div className="papel-kraft esquina-doblada mb-5 grid h-20 w-16 place-items-center rounded-[10px] shadow-calida">
        <Icono className="h-7 w-7 text-kraft-tinta" strokeWidth={1.75} />
      </div>
      <h3 className="text-[1.3rem] font-semibold">{titulo}</h3>
      {texto && <p className="mt-2 max-w-sm text-tinta-suave">{texto}</p>}
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

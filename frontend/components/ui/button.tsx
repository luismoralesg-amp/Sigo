import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const botonVariantes = cva(
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-[12px] text-center font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variante: {
        primario: "bg-primario text-white hover:bg-primario-hover active:bg-primario-hover",
        secundario: "border border-linea-fuerte bg-superficie text-primario hover:bg-primario-suave",
        fantasma: "text-primario hover:bg-primario-suave",
        alerta: "bg-alerta text-white hover:bg-alerta-hover",
      },
      tamaño: {
        md: "min-h-12 px-4",
        lg: "min-h-14 px-5",
        xl: "min-h-14 px-6",
        icono: "h-12 w-12",
        /** Acción principal de la pantalla: ancho completo, 56 px. */
        accion: "h-14 w-full px-6 text-[1.08rem]",
      },
    },
    defaultVariants: { variante: "primario", tamaño: "md" },
  }
);

export interface BotonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof botonVariantes> {
  asChild?: boolean;
}

export const Boton = React.forwardRef<HTMLButtonElement, BotonProps>(({ className, variante, tamaño, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(botonVariantes({ variante, tamaño }), className)} {...props} />;
});
Boton.displayName = "Boton";

/**
 * Barra fija abajo con la acción principal de la pantalla (una por pantalla).
 * El espacio para que no tape el final del contenido lo pone globals.css (main:has(.barra-accion)).
 * `soloMovil`: en computadora (lg) el botón queda dentro del flujo, para pantallas partidas en dos columnas.
 */
export function BarraAccion({ children, className, soloMovil = false }: { children: React.ReactNode; className?: string; soloMovil?: boolean }) {
  return (
    <div
      className={cn(
        "barra-accion fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-superficie px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3",
        soloMovil && "barra-accion-movil lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0",
        className
      )}
    >
      <div className={cn("mx-auto flex max-w-3xl flex-col gap-2", soloMovil && "lg:max-w-none")}>{children}</div>
    </div>
  );
}

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const botonVariantes = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[12px] font-semibold transition-[background-color,box-shadow,transform,color] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variante: {
        primario: "bg-primario text-white shadow-[0_1px_0_rgba(255,255,255,.15)_inset,0_6px_16px_-6px_rgba(15,94,90,.55)] hover:bg-primario-hover",
        secundario: "border border-linea-fuerte bg-superficie text-tinta shadow-calida hover:border-primario/40 hover:bg-primario-suave/50",
        fantasma: "text-primario hover:bg-primario-suave",
        kraft: "papel-kraft text-kraft-tinta hover:brightness-[.98]",
        alerta: "bg-alerta text-white hover:bg-alerta-hover",
      },
      tamaño: {
        md: "min-h-11 px-4 text-[0.95rem]",
        lg: "min-h-14 px-6 text-[1.05rem]",
        xl: "min-h-16 px-7 text-[1.15rem]",
        icono: "h-11 w-11",
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

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const insignia = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.78rem] font-semibold leading-none [&_svg]:size-3.5", {
  variants: {
    tono: {
      kraft: "border border-kraft-borde bg-kraft text-kraft-tinta",
      primario: "bg-primario-suave text-primario-tinta",
      revisar: "border border-revisar/70 bg-revisar-fondo text-revisar-tinta",
      alerta: "bg-alerta-fondo text-alerta",
      confirmado: "bg-confirmado-fondo text-confirmado",
      neutro: "border border-linea bg-papel text-tinta-suave",
    },
  },
  defaultVariants: { tono: "neutro" },
});

export function Insignia({ className, tono, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof insignia>) {
  return <span className={cn(insignia({ tono }), className)} {...props} />;
}

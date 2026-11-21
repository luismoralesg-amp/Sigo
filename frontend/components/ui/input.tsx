import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

export const Entrada = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "min-h-12 w-full rounded-[12px] border border-linea-fuerte bg-superficie px-3.5 text-[1rem] text-tinta shadow-[inset_0_1px_2px_rgba(92,64,28,.05)] transition-colors placeholder:text-tinta-tenue hover:border-[#c4b89f] focus-visible:border-primario focus-visible:outline-2 focus-visible:outline-offset-0",
      className
    )}
    {...props}
  />
));
Entrada.displayName = "Entrada";

export const AreaTexto = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-12 w-full resize-y rounded-[12px] border border-linea-fuerte bg-superficie px-3.5 py-3 text-[1rem] leading-snug text-tinta placeholder:text-tinta-tenue hover:border-[#c4b89f] focus-visible:border-primario focus-visible:outline-2 focus-visible:outline-offset-0",
      className
    )}
    {...props}
  />
));
AreaTexto.displayName = "AreaTexto";

export function Etiqueta({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-[0.9rem] font-semibold text-tinta-suave", className)} {...props} />;
}

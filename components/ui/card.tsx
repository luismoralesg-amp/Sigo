import * as React from "react";
import { cn } from "@/lib/utils";

export function Tarjeta({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[18px] border border-linea bg-superficie shadow-calida", className)} {...props} />;
}

/** Superficie que "viene del papel": kraft, grano y esquina doblada. */
export function TarjetaPapel({ className, doblada = true, ...props }: React.HTMLAttributes<HTMLDivElement> & { doblada?: boolean }) {
  return <div className={cn("papel-kraft rounded-[14px] shadow-calida", doblada && "esquina-doblada", className)} {...props} />;
}

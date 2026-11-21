import * as React from "react";
import { cn } from "@/lib/utils";

/** Tarjeta blanca con borde arena de 1 px y radio de 12 px. */
export function Tarjeta({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("tarjeta", className)} {...props} />;
}

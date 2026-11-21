import type { Metadata } from "next";
import { Protegida } from "@/lib/api/sesion";

export const metadata: Metadata = { title: "Puesto de salud" };

export default function LayoutPuesto({ children }: { children: React.ReactNode }) {
  return <Protegida rol="enfermera">{children}</Protegida>;
}

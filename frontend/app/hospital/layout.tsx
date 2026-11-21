import type { Metadata } from "next";
import { Protegida } from "@/lib/api/sesion";

export const metadata: Metadata = { title: "Hospital" };

export default function LayoutHospital({ children }: { children: React.ReactNode }) {
  return <Protegida rol="medico">{children}</Protegida>;
}

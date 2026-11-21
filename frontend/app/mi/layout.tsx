import type { Metadata } from "next";
import { Protegida } from "@/lib/api/sesion";

export const metadata: Metadata = { title: "Mi historial" };

/** /mi/entrar es pública; el resto pide sesión de paciente (y /mi/pin si debe_cambiar_pin). */
export default function LayoutPaciente({ children }: { children: React.ReactNode }) {
  return (
    <Protegida rol="paciente" publica={["/mi/entrar"]}>
      {children}
    </Protegida>
  );
}

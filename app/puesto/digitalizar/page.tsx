import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { FlujoDigitalizar } from "@/components/ficha/flujo";

export const metadata: Metadata = { title: "Digitalizar ficha" };

export default function PaginaDigitalizar() {
  return (
    <Shell rol="puesto" ancho="amplio">
      <FlujoDigitalizar />
    </Shell>
  );
}

import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { FlujoImportar } from "@/components/importar/flujo-importar";

export const metadata: Metadata = { title: "Importar sistema antiguo" };

export default function PaginaImportar() {
  return (
    <Shell rol="puesto" ancho="amplio">
      <FlujoImportar />
    </Shell>
  );
}

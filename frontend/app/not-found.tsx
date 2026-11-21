import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Logo } from "@/components/marca/logo";
import { Boton } from "@/components/ui/button";
import { EstadoVacio } from "@/components/ui/vacio";

export default function NoEncontrado() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4">
      <Logo />
      <EstadoVacio icono={FileQuestion} titulo="No encontramos esta página" texto="Puede que el enlace esté incompleto o que el expediente ya no exista. Vuelve a buscar por DPI.">
        <Boton asChild tamaño="lg">
          <Link href="/login">Ir al inicio</Link>
        </Boton>
      </EstadoVacio>
    </div>
  );
}

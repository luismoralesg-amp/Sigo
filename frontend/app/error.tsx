"use client";
import { CloudAlert, RotateCcw } from "lucide-react";
import { Logo } from "@/components/marca/logo";
import { Boton } from "@/components/ui/button";
import { EstadoVacio } from "@/components/ui/vacio";

export default function ErrorGeneral({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4">
      <Logo />
      <EstadoVacio icono={CloudAlert} titulo="Algo no salió bien" texto="No se perdió ningún dato. Revisa la señal e intenta otra vez; si sigue pasando, avisa al encargado del puesto.">
        <Boton tamaño="lg" onClick={reset}>
          <RotateCcw /> Intentar de nuevo
        </Boton>
      </EstadoVacio>
    </div>
  );
}

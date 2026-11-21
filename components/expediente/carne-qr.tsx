"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Printer } from "lucide-react";
import { Boton } from "@/components/ui/button";
import { Dialogo, DialogoContenido, DialogoDescripcion, DialogoDisparador, DialogoTitulo } from "@/components/ui/dialog";
import { LogoIcono } from "@/components/marca/logo";
import { edadTexto, fechaCorta, formatearDPI } from "@/lib/utils";
import type { Paciente } from "@/lib/tipos";

/** Carné con QR: para niños sin DPI o personas que llegan sin documento. */
export function CarneQR({ paciente: p }: { paciente: Paciente }) {
  const [svg, setSvg] = useState("");
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    QRCode.toString(`${window.location.origin}/hospital/expediente/${p.id}`, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#283659", light: "#00000000" },
    }).then(setSvg);
  }, [abierto, p.id]);

  const menor = (edadTexto(p.fecha_nacimiento) ?? "").includes("mes") || Number((edadTexto(p.fecha_nacimiento) ?? "99").split(" ")[0]) < 18;

  return (
    <Dialogo open={abierto} onOpenChange={setAbierto}>
      <DialogoDisparador asChild>
        <Boton variante="secundario">
          <QrCode /> Carné QR
        </Boton>
      </DialogoDisparador>
      <DialogoContenido className="max-w-md">
        <DialogoTitulo className="pr-12 font-display text-[1.45rem] font-bold">Carné con código QR</DialogoTitulo>
        <DialogoDescripcion className="mt-1 text-tinta-suave">
          {menor ? "Para niños sin DPI: el código abre su expediente en cualquier centro autorizado." : "Útil si la persona llega sin su documento."}
        </DialogoDescripcion>

        <div className="imprimible mx-auto mt-5 w-full max-w-[320px] overflow-hidden rounded-[18px] border border-linea bg-superficie shadow-calida-lg">
          <div className="flex items-center gap-2.5 bg-primario px-4 py-3">
            <LogoIcono invertido className="h-8 w-8" />
            <span className="font-[family-name:var(--font-poppins)] text-[1rem] font-bold tracking-[0.2em] text-[#EEEAE5]">SIGO</span>
            <span className="ml-auto text-[0.72rem] font-semibold tracking-[0.12em] text-[#e3bd96]">CARNÉ DE SALUD</span>
          </div>
          <div className="px-5 pb-5 pt-4 text-center">
            <p className="font-display text-[1.3rem] font-bold leading-tight text-primario">{p.nombre}</p>
            <p className="num mt-1 text-[0.85rem] text-tinta-suave">Nac. {fechaCorta(p.fecha_nacimiento)} · {edadTexto(p.fecha_nacimiento)}</p>
            <div className="mx-auto mt-4 aspect-square w-48 rounded-[12px] bg-white p-3 ring-1 ring-linea" aria-label="Código QR del expediente" role="img">
              {svg ? <div className="h-full w-full [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="h-full w-full animate-pulse rounded bg-papel" />}
            </div>
            {p.dpi_cui && <p className="num mt-3 font-mono text-[0.9rem] font-semibold tracking-[0.04em]">CUI {formatearDPI(p.dpi_cui)}</p>}
            <div className="mx-auto mt-3 h-[3px] w-10 rounded bg-kraft-borde" />
            <p className="mt-2 text-[0.8rem] text-tinta-tenue">Tu historia te sigue.</p>
          </div>
        </div>

        <Boton tamaño="lg" className="mt-5 w-full" onClick={() => window.print()}>
          <Printer /> Imprimir carné
        </Boton>
      </DialogoContenido>
    </Dialogo>
  );
}

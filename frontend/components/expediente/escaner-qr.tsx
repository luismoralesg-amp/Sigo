"use client";
/**
 * Escanear el QR de la paciente con la cámara (BarcodeDetector, sin librerías).
 * Si el navegador no lo soporta, lo dice y deja escribir el código a mano.
 */
import { useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import { Boton } from "@/components/ui/button";
import { Dialogo, DialogoContenido, DialogoDescripcion, DialogoTitulo } from "@/components/ui/dialog";
import { codigoDesdeQR } from "@/lib/api/cliente";

type Detector = { detect: (v: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type ConstructorDetector = new (o: { formats: string[] }) => Detector;

export function EscanerQR({ onCodigo }: { onCodigo: (codigo: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const BD = (window as unknown as { BarcodeDetector?: ConstructorDetector }).BarcodeDetector;
    if (!BD || !navigator.mediaDevices?.getUserMedia) {
      setMensaje("Este navegador no puede leer códigos QR. Escribe el código que te muestra la paciente.");
      return;
    }
    let stream: MediaStream | null = null;
    let vivo = true;
    const detector = new BD({ formats: ["qr_code"] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current || !vivo) return;
        video.current.srcObject = stream;
        await video.current.play();
        setMensaje(null);
        const leer = async () => {
          if (!vivo || !video.current) return;
          try {
            const [r] = await detector.detect(video.current);
            const codigo = r && codigoDesdeQR(r.rawValue);
            if (codigo) {
              onCodigo(codigo);
              setAbierto(false);
              return;
            }
            if (r) setMensaje("Ese QR no es de Sigo.");
          } catch {
            /* cuadro sin QR */
          }
          setTimeout(leer, 300);
        };
        void leer();
      } catch {
        setMensaje("No se pudo abrir la cámara. Revisa el permiso o escribe el código.");
      }
    })();
    return () => {
      vivo = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [abierto, onCodigo]);

  return (
    <Dialogo open={abierto} onOpenChange={setAbierto}>
      <Boton type="button" variante="secundario" tamaño="lg" onClick={() => setAbierto(true)}>
        <QrCode /> Escanear QR
      </Boton>
      <DialogoContenido className="max-w-md">
        <DialogoTitulo className="pr-12 font-display text-[1.35rem] font-semibold">Escanear el QR de la paciente</DialogoTitulo>
        <DialogoDescripcion className="mt-1 text-tinta-suave">Apunta la cámara al código que aparece en su celular.</DialogoDescripcion>
        <div className="mt-4 aspect-square overflow-hidden rounded-[12px] bg-tinta">
          <video ref={video} muted playsInline className="h-full w-full object-cover" />
        </div>
        {mensaje && (
          <p className="mt-3 text-[0.95rem] text-tinta-suave" role="status">
            {mensaje}
          </p>
        )}
      </DialogoContenido>
    </Dialogo>
  );
}

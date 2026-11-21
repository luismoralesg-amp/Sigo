"use client";
/**
 * Escanear el QR de la paciente con la cámara.
 * Primero BarcodeDetector; si el navegador no lo trae, copia cada fotograma a un canvas
 * y lo decodifica con jsQR (import dinámico, solo en el cliente).
 * Si falta BarcodeDetector se usa jsQR y la cámara sigue abierta.
 * El aviso de escribir el código a mano queda para cuando no hay cámara, no abre, o jsQR no arranca.
 */
import { useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import { Boton } from "@/components/ui/button";
import { Dialogo, DialogoContenido, DialogoDescripcion, DialogoTitulo } from "@/components/ui/dialog";
import { codigoDesdeQR } from "@/lib/api/cliente";

type Detector = { detect: (v: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type ConstructorDetector = new (o: { formats: string[] }) => Detector;

const SIN_CAMARA = "Este navegador no puede leer códigos QR. Escribe el código que te muestra la paciente.";
const CAMARA_CERRADA = "No se pudo abrir la cámara. Revisa el permiso o escribe el código.";
const QR_AJENO = "Ese QR no es de Sigo.";
/** Lado máximo del fotograma que ve jsQR. Una cámara de celular trae frames enormes y el hilo se traba. */
const LADO_MAX = 640;

export function EscanerQR({ onCodigo }: { onCodigo: (codigo: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!abierto) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMensaje(SIN_CAMARA);
      return;
    }

    let stream: MediaStream | null = null;
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;

    const usar = (texto: string) => {
      if (!vivo) return true;
      const codigo = codigoDesdeQR(texto);
      if (codigo) {
        onCodigo(codigo);
        setAbierto(false);
        return true;
      }
      setMensaje(QR_AJENO);
      return false;
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const el = video.current;
        if (!vivo || !el) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        el.srcObject = stream;
        await el.play();
      } catch {
        stream?.getTracks().forEach((t) => t.stop());
        if (vivo) setMensaje(CAMARA_CERRADA);
        return;
      }
      const el = video.current;
      if (!vivo || !el) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      setMensaje(null);

      const BD = (window as unknown as { BarcodeDetector?: ConstructorDetector }).BarcodeDetector;
      if (BD) {
        const detector = new BD({ formats: ["qr_code"] });
        const leer = async () => {
          if (!vivo) return;
          try {
            const [r] = await detector.detect(el);
            if (r && usar(r.rawValue)) return;
          } catch {
            /* cuadro sin QR */
          }
          if (vivo) espera = setTimeout(leer, 300);
        };
        void leer();
        return;
      }

      // Import dinámico: el servidor no carga jsQR y el navegador con BarcodeDetector tampoco.
      let jsQR: typeof import("jsqr").default;
      try {
        ({ default: jsQR } = await import("jsqr"));
      } catch {
        stream?.getTracks().forEach((t) => t.stop());
        if (vivo) setMensaje(SIN_CAMARA);
        return;
      }
      if (!vivo) return;
      const lienzo = document.createElement("canvas");
      const ctx = lienzo.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        stream?.getTracks().forEach((t) => t.stop());
        setMensaje(SIN_CAMARA);
        return;
      }
      const leer = () => {
        if (!vivo) return;
        const w = el.videoWidth;
        const h = el.videoHeight;
        if (w && h) {
          try {
            const escala = Math.min(1, LADO_MAX / Math.max(w, h));
            const dw = Math.max(1, Math.round(w * escala));
            const dh = Math.max(1, Math.round(h * escala));
            if (lienzo.width !== dw) lienzo.width = dw;
            if (lienzo.height !== dh) lienzo.height = dh;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(el, 0, 0, dw, dh);
            const imagen = ctx.getImageData(0, 0, dw, dh);
            const r = jsQR(imagen.data, imagen.width, imagen.height);
            if (r && usar(r.data)) return;
          } catch {
            /* cuadro sin QR */
          }
        }
        if (vivo) espera = setTimeout(leer, 250);
      };
      leer();
    })();

    return () => {
      vivo = false;
      clearTimeout(espera);
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

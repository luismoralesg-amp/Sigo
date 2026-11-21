"use client";
/**
 * Código y QR temporal (POST /pacientes/{id}/codigos).
 * Sirve una sola vez y se puede activar durante 10 minutos; muestra la cuenta regresiva hasta `vence_en`.
 * La paciente lo pide desde su celular, o la enfermera a pedido de la paciente sin smartphone.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { KeyRound, LoaderCircle, MessageSquareText, RefreshCw, Timer } from "lucide-react";
import type { CodigoTemporal } from "@/lib/types";
import { api, DURACION_ACCESO_TEXTO } from "@/lib/api/cliente";
import { aErrorApi, type ErrorApi } from "@/lib/api/errores";
import { formatoRestante, useCuentaRegresiva } from "@/lib/api/usar";
import { Boton, BarraAccion } from "@/components/ui/button";
import { MensajeError } from "@/components/estado";
import { cn } from "@/lib/utils";

export function GenerarCodigo({ pacienteId, para, accionFija = false }: { pacienteId: string; para: "paciente" | "enfermera"; accionFija?: boolean }) {
  const [sms, setSms] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [c, setC] = useState<CodigoTemporal | null>(null);

  async function generar() {
    setGenerando(true);
    setError(null);
    try {
      setC(await api.generarCodigo(pacienteId, { enviar_sms: sms }));
    } catch (e) {
      setError(aErrorApi(e));
    } finally {
      setGenerando(false);
    }
  }

  if (c) return <CodigoVigente c={c} para={para} onOtro={() => setC(null)} accionFija={accionFija} />;
  const boton = (
    <Boton tamaño={accionFija ? "accion" : "lg"} className={accionFija ? "" : "mt-4 w-full sm:w-auto"} onClick={generar} disabled={generando}>
      {generando ? <LoaderCircle className="animate-spin" /> : <KeyRound />} Generar código
    </Boton>
  );

  return (
    <div>
      <label className="tarjeta flex min-h-14 cursor-pointer items-start gap-3 p-4">
        <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--primario)]" />
        <span>
          <span className="block font-semibold">También mandarlo por SMS</span>
          <span className="block text-[0.92rem] text-tinta-suave">Al teléfono registrado{para === "enfermera" ? " de la paciente" : ""}. En el demo, el envío se simula.</span>
        </span>
      </label>
      {error && <MensajeError className="mt-2">{error.mensaje}</MensajeError>}
      {accionFija ? <BarraAccion>{boton}</BarraAccion> : boton}
    </div>
  );
}

function CodigoVigente({ c, para, onOtro, accionFija }: { c: CodigoTemporal; para: "paciente" | "enfermera"; onOtro: () => void; accionFija: boolean }) {
  const restante = useCuentaRegresiva(c.vence_en);
  const vencido = restante === 0;
  const [svg, setSvg] = useState("");

  useEffect(() => {
    QRCode.toString(c.qr, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#233458", light: "#00000000" } }).then(setSvg, () => setSvg(""));
  }, [c.qr]);

  return (
    <div className="overflow-hidden rounded-[12px] border border-linea bg-superficie">
      <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-6">
        <div className={cn("mx-auto aspect-square w-48 rounded-[12px] bg-white p-3 ring-1 ring-linea", vencido && "opacity-25")} role="img" aria-label={`Código QR del código ${c.codigo}`}>
          {svg ? <div className="h-full w-full [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="h-full w-full animate-pulse rounded bg-papel" />}
        </div>
        <div className="text-center sm:text-left">
          <p className="text-[0.95rem] font-semibold text-tinta-suave">{para === "paciente" ? "Muéstrale esto al médico" : "Dale este código a la paciente"}</p>
          <p className={cn("cifra mt-1 text-[2.6rem] font-semibold leading-none tracking-[0.12em] sm:text-[3rem]", vencido ? "text-tinta-suave line-through" : "text-primario")} aria-label={`Código ${c.codigo.split("").join(" ")}`}>
            {c.codigo}
          </p>
          <p className={cn("mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold", vencido ? "bg-alerta-fondo text-alerta" : "bg-papel text-tinta")} role="timer" aria-live="off">
            <Timer className="h-4 w-4" aria-hidden="true" />
            <span className="cifra">{vencido ? "Este código ya venció" : `Se puede usar durante ${formatoRestante(restante ?? 0)}`}</span>
          </p>
          {c.enviado_por_sms && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[0.92rem] text-confirmado sm:justify-start">
              <MessageSquareText className="h-4 w-4" aria-hidden="true" /> También se mandó por SMS.
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-linea px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-[0.95rem] text-tinta-suave">Sirve una sola vez. Cuando el médico lo usa, puede ver el historial durante {DURACION_ACCESO_TEXTO} y después se cierra solo.</p>
        {!accionFija && (
          <Boton variante={vencido ? "primario" : "secundario"} onClick={onOtro} className="shrink-0">
            <RefreshCw /> {vencido ? "Generar otro" : "Pedir otro código"}
          </Boton>
        )}
      </div>
      {accionFija && (
        <BarraAccion>
          <Boton tamaño="accion" variante={vencido ? "primario" : "secundario"} onClick={onOtro}>
            <RefreshCw /> {vencido ? "Generar otro código" : "Pedir otro código"}
          </Boton>
        </BarraAccion>
      )}
    </div>
  );
}

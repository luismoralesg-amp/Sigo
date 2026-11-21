"use client";
/**
 * /mi/accesos · paciente. Quién vio mi historial y cuándo; las emergencias en rojo.
 * Endpoint: GET /pacientes/{dpi}/accesos (el más reciente primero).
 */
import Link from "next/link";
import { Building2, Hospital, KeyRound, MessageCircleQuestion, Siren, Eye } from "lucide-react";
import type { Acceso } from "@/lib/types";
import { Shell } from "@/components/shell";
import { Boton } from "@/components/ui/button";
import { Cargando, ErrorPantalla } from "@/components/estado";
import { api } from "@/lib/api/cliente";
import { useUsuario } from "@/lib/api/sesion";
import { useDatos } from "@/lib/api/usar";
import { cn, fechaHora } from "@/lib/utils";

const TIPO: Record<Acceso["tipo"], { texto: string; icono: typeof Eye }> = {
  codigo: { texto: "Con tu código", icono: KeyRound },
  emergencia: { texto: "Acceso de emergencia", icono: Siren },
  enfermera: { texto: "Enfermera de tu puesto", icono: Building2 },
};

export default function PaginaAccesos() {
  const { usuario } = useUsuario();
  const dpi = usuario.dpi!;
  const r = useDatos(() => api.accesos(dpi), [dpi]);

  return (
    <Shell>
      <h1 className="text-[2rem] leading-tight text-primario sm:text-[2.4rem]">Quién vio mi historial</h1>
      <p className="mt-2 text-tinta-suave">Cada vez que alguien abre tu historial queda anotado aquí. Nadie lo puede borrar.</p>

      <div className="mt-7">
        {r.estado === "cargando" && <Cargando filas={3} />}
        {r.estado === "error" && <ErrorPantalla error={r.error} onReintentar={() => r.recargar()} />}
        {r.estado === "listo" && r.datos.accesos.length === 0 && (
          <div className="rounded-[16px] border border-linea bg-superficie p-6 text-center">
            <Eye className="mx-auto h-8 w-8 text-tinta-tenue" aria-hidden="true" />
            <p className="mt-3 text-[1.1rem] font-semibold">Nadie ha visto tu historial todavía</p>
            <p className="mt-1 text-tinta-suave">Cuando compartas un código con un médico, aquí verás quién lo usó y cuándo.</p>
            <Boton asChild className="mt-5">
              <Link href="/mi/compartir">Compartir con un médico</Link>
            </Boton>
          </div>
        )}
        {r.estado === "listo" && r.datos.accesos.length > 0 && (
          <ol className="space-y-3">
            {r.datos.accesos.map((a, i) => (
              <FilaAcceso key={`${a.desde}-${i}`} a={a} />
            ))}
          </ol>
        )}
      </div>
    </Shell>
  );
}

function FilaAcceso({ a }: { a: Acceso }) {
  const emergencia = a.tipo === "emergencia";
  const { texto, icono: Icono } = TIPO[a.tipo];
  const CentroIcono = /hospital/i.test(a.centro) ? Hospital : Building2;
  const mismoMomento = a.desde === a.hasta;
  return (
    <li className={cn("rounded-[16px] border p-4 sm:p-5", emergencia ? "border-alerta/50 bg-alerta-fondo" : "border-linea bg-superficie")}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="font-semibold">{a.quien}</p>
        <p className={cn("inline-flex items-center gap-1.5 text-[0.9rem] font-semibold", emergencia ? "text-alerta" : "text-tinta-suave")}>
          <Icono className="h-4 w-4" aria-hidden="true" /> {texto}
        </p>
      </div>
      <p className="mt-0.5 flex items-center gap-1.5 text-[0.92rem] text-tinta-suave">
        <CentroIcono className="h-4 w-4 shrink-0" aria-hidden="true" /> {a.centro}
      </p>
      <p className="num mt-2 text-[0.92rem]">{mismoMomento ? fechaHora(a.desde) : `Desde ${fechaHora(a.desde)} hasta ${fechaHora(a.hasta)}`}</p>
      {a.motivo && (
        <p className={cn("mt-2 text-[0.95rem]", emergencia && "text-tinta")}>
          <span className="font-semibold">Motivo:</span> {a.motivo}
        </p>
      )}
      {a.preguntas_hechas > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[0.9rem] text-tinta-suave">
          <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" /> Hizo {a.preguntas_hechas} {a.preguntas_hechas === 1 ? "pregunta" : "preguntas"} al asistente
        </p>
      )}
    </li>
  );
}

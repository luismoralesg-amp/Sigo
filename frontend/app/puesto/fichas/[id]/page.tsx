"use client";
/**
 * /puesto/fichas/[id] · enfermera. Revisión: foto o fila original, campos extraídos,
 * confianza baja en amarillo, consentimiento y Confirmar.
 * Endpoints: GET /fichas/{id} (cada 2 s, hasta 60 s, mientras esté en "procesando"),
 * POST /fichas/{id}/confirmar. Nada entra al expediente sin esa confirmación.
 *
 * La ficha no trae el DPI de la paciente en un campo aparte del de la extracción.
 * Llega por la URL (?dpi=) desde la captura o desde importar; si falta, se lee del expediente.
 */
import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheck, TriangleAlert } from "lucide-react";
import type { Ficha } from "@/lib/types";
import { Shell } from "@/components/shell";
import { Boton, BarraAccion } from "@/components/ui/button";
import { Cargando, ErrorPantalla } from "@/components/estado";
import { Revision } from "@/components/ficha/revision";
import { api } from "@/lib/api/cliente";
import { aErrorApi, type ErrorApi } from "@/lib/api/errores";

const INTERVALO = 2000;
const LIMITE = 60_000;

type Estado =
  | { tipo: "cargando" }
  | { tipo: "error"; error: ErrorApi }
  | { tipo: "procesando"; ficha: Ficha; agotado: boolean }
  | { tipo: "ficha"; ficha: Ficha };

const rutaPaciente = (id: string) => `/puesto/pacientes/${encodeURIComponent(id)}`;

export default function PaginaFicha({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent(use(params).id);
  return (
    <Shell ancho="amplio">
      <Suspense>
        <Contenido id={id} />
      </Suspense>
    </Shell>
  );
}

function Contenido({ id }: { id: string }) {
  const dpiUrl = useSearchParams().get("dpi");
  const [s, setS] = useState<Estado>({ tipo: "cargando" });
  const inicio = useRef(Date.now());
  const vivo = useRef(true);

  const consultar = useCallback(async () => {
    try {
      const f = await api.obtenerFicha(id);
      if (f.estado === "procesando") {
        const agotado = Date.now() - inicio.current >= LIMITE;
        setS({ tipo: "procesando", ficha: f, agotado });
        return !agotado;
      }
      setS({ tipo: "ficha", ficha: f });
    } catch (e) {
      setS({ tipo: "error", error: aErrorApi(e) });
    }
    return false;
  }, [id]);

  const ciclo = useCallback(async () => {
    if ((await consultar()) && vivo.current) setTimeout(() => vivo.current && void ciclo(), INTERVALO);
  }, [consultar]);

  useEffect(() => {
    vivo.current = true;
    inicio.current = Date.now();
    void ciclo();
    return () => {
      vivo.current = false;
    };
  }, [ciclo]);

  const reintentar = () => {
    inicio.current = Date.now();
    setS({ tipo: "cargando" });
    void ciclo();
  };

  if (s.tipo === "cargando") return <Cargando />;
  if (s.tipo === "error") return <ErrorPantalla error={s.error} onReintentar={reintentar} />;
  if (s.tipo === "procesando") return <Procesando ficha={s.ficha} agotado={s.agotado} onReintentar={reintentar} />;
  const f = s.ficha;
  if (f.estado === "confirmada")
    return (
      <Final
        ficha={f}
        titulo="Esta ficha ya se confirmó"
        texto="Sus datos ya están en el expediente, como versión nueva. Si algo quedó mal, corrígelo desde la paciente: se guarda otra versión. Nada se borra."
      />
    );
  if (f.estado === "error" || !f.extraccion || f.extraccion.error) return <FichaConError ficha={f} />;
  return <Revision ficha={f} dpiUrl={dpiUrl} />;
}

function Procesando({ ficha, agotado, onReintentar }: { ficha: Ficha; agotado: boolean; onReintentar: () => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="tarjeta overflow-hidden">
        {ficha.originales[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ficha.originales[0]} alt="Ficha que se está leyendo" className="mx-auto max-h-[32dvh] w-auto lg:max-h-[70dvh]" />
        )}
      </div>
      <div role="status" aria-live="polite">
        <h1 className="titulo">{agotado ? "La lectura está tardando" : "Leyendo la ficha…"}</h1>
        {!agotado && (
          <div className="mt-4 h-1.5 w-40 overflow-hidden rounded-full bg-linea" aria-hidden="true">
            <div className="h-full w-1/3 animate-[deslizar_1.1s_ease-in-out_infinite] rounded-full bg-primario" />
          </div>
        )}
        <p className="mt-3 text-tinta-suave">
          {agotado
            ? "Puedes esperar aquí o volver a la paciente; la ficha te espera en “Fichas por revisar”."
            : `${ficha.originales.length} ${ficha.originales.length === 1 ? "página" : "páginas"}. Cuando termine, revisas cada dato antes de guardar.`}
        </p>
        {agotado && (
          <BarraAccion>
            <Boton tamaño="accion" onClick={onReintentar}>
              Volver a consultar
            </Boton>
          </BarraAccion>
        )}
      </div>
    </div>
  );
}

function Final({ ficha, titulo, texto }: { ficha: Ficha; titulo: string; texto: string }) {
  return (
    <div className="mx-auto max-w-md pt-6 text-center" role="status">
      <CircleCheck className="mx-auto h-12 w-12 text-confirmado" aria-hidden="true" />
      <h1 className="titulo mt-4">{titulo}</h1>
      <p className="mt-2 text-tinta-suave">{texto}</p>
      <BarraAccion>
        <Boton asChild tamaño="accion">
          <Link href={rutaPaciente(ficha.paciente_id)}>Ver expediente</Link>
        </Boton>
      </BarraAccion>
    </div>
  );
}

function FichaConError({ ficha }: { ficha: Ficha }) {
  return (
    <div className="mx-auto max-w-md pt-6 text-center" role="alert">
      <TriangleAlert className="mx-auto h-12 w-12 text-revisar-tinta" aria-hidden="true" />
      <h1 className="titulo mt-4">No se pudo leer esta ficha</h1>
      <p className="mt-2 text-tinta-suave">{ficha.error ?? ficha.extraccion?.error ?? "Toma la foto otra vez, con más luz."}</p>
      <BarraAccion>
        <Boton asChild tamaño="accion">
          <Link href={`${rutaPaciente(ficha.paciente_id)}/captura`}>Tomar la foto otra vez</Link>
        </Boton>
      </BarraAccion>
    </div>
  );
}

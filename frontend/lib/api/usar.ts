"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { aErrorApi, type ErrorApi } from "./errores";

export type EstadoDatos<T> =
  | { estado: "cargando"; datos: null; error: null }
  | { estado: "listo"; datos: T; error: null }
  | { estado: "error"; datos: null; error: ErrorApi };

/** Carga datos del API y expone los estados que el contrato pide dibujar: cargando, error (incluye sin señal) y listo. */
export function useDatos<T>(cargar: () => Promise<T>, deps: React.DependencyList) {
  const [s, setS] = useState<EstadoDatos<T>>({ estado: "cargando", datos: null, error: null });
  const vigente = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fn = useCallback(cargar, deps);

  const recargar = useCallback(async (silencioso = false) => {
    const n = ++vigente.current;
    if (!silencioso) setS({ estado: "cargando", datos: null, error: null });
    try {
      const datos = await fn();
      if (n === vigente.current) setS({ estado: "listo", datos, error: null });
    } catch (e) {
      if (n === vigente.current) setS({ estado: "error", datos: null, error: aErrorApi(e) });
    }
  }, [fn]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const poner = useCallback((datos: T) => setS({ estado: "listo", datos, error: null }), []);
  return { ...s, recargar, poner };
}

/** Milisegundos que faltan para `hasta`, actualizado cada segundo. null si no hay fecha. */
export function useCuentaRegresiva(hasta: string | null | undefined): number | null {
  const objetivo = hasta ? new Date(hasta).getTime() : null;
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (objetivo === null) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [objetivo]);
  return objetivo === null ? null : Math.max(0, objetivo - ahora);
}

/** 125000 → "2:05"; 7_260_000 → "2:01:00". */
export function formatoRestante(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dos = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
}

/** Estado de la conexión del navegador, para el estado "sin señal". */
export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(true);
  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    actualizar();
    window.addEventListener("online", actualizar);
    window.addEventListener("offline", actualizar);
    return () => {
      window.removeEventListener("online", actualizar);
      window.removeEventListener("offline", actualizar);
    };
  }, []);
  return enLinea;
}

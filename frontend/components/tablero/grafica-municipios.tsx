"use client";
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Table2, ChartBar } from "lucide-react";
import { RESCATE_MUNICIPIOS } from "@/datos/demo";
import { cn } from "@/lib/utils";

// Validado con dataviz/validate_palette.js sobre #FBF9F6: todo PASS (CVD ΔE 23.4, contraste ≥ 3:1).
const SERIES = [
  { clave: "papel", nombre: "Ficha en papel", color: "#C0783A" },
  { clave: "sistema", nombre: "Sistema antiguo", color: "#3D5BA6" },
] as const;

type Depto = "Todos" | "Totonicapán" | "Quetzaltenango";
const fmt = (n: number) => n.toLocaleString("es-GT");

export function GraficaMunicipios() {
  const [depto, setDepto] = useState<Depto>("Todos");
  const [vista, setVista] = useState<"grafica" | "tabla">("grafica");
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const filas = useMemo(
    () =>
      RESCATE_MUNICIPIOS.filter((m) => depto === "Todos" || m.departamento === depto)
        .map((m) => ({ ...m, total: m.papel + m.sistema }))
        .sort((a, b) => b.total - a.total),
    [depto]
  );
  const max = Math.max(...filas.map((f) => f.total));
  const tope = max * 1.08; // deja aire para el total en la punta

  function mover(e: React.PointerEvent, i: number) {
    const r = caja.current!.getBoundingClientRect();
    setTip({ i, x: e.clientX - r.left, y: e.clientY - r.top });
  }

  return (
    <section className="rounded-[20px] border border-linea bg-superficie p-4 shadow-calida sm:p-6" aria-labelledby="titulo-grafica">
      {/* filtros en una fila, arriba de la gráfica */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 id="titulo-grafica" className="text-[1.35rem] font-bold">Fichas rescatadas por municipio</h2>
          <p className="text-[0.9rem] text-tinta-suave">Acumulado desde el inicio del piloto</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <div className="flex w-full rounded-[12px] border border-linea bg-papel p-1 sm:inline-flex sm:w-auto" role="group" aria-label="Departamento">
            {(["Todos", "Totonicapán", "Quetzaltenango"] as Depto[]).map((d) => (
              <button key={d} aria-pressed={depto === d} onClick={() => setDepto(d)} className={cn("min-h-10 flex-1 rounded-[9px] px-2 text-[0.85rem] font-semibold transition-colors sm:flex-none sm:px-3 sm:text-[0.88rem]", depto === d ? "bg-primario text-white" : "text-tinta-suave hover:text-tinta")}>
                {d}
              </button>
            ))}
          </div>
          <button onClick={() => setVista(vista === "grafica" ? "tabla" : "grafica")} className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] border border-linea bg-superficie px-3 text-[0.88rem] font-semibold text-tinta-suave hover:text-tinta">
            {vista === "grafica" ? <Table2 className="h-4 w-4" /> : <ChartBar className="h-4 w-4" />}
            {vista === "grafica" ? "Ver tabla" : "Ver gráfica"}
          </button>
        </div>
      </div>

      {/* leyenda */}
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[0.88rem] text-tinta-suave">
        {SERIES.map((s) => (
          <li key={s.clave} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-[3px]" style={{ background: s.color }} /> {s.nombre}
          </li>
        ))}
      </ul>

      {vista === "grafica" ? (
        <div ref={caja} className="relative mt-4" onPointerLeave={() => setTip(null)}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-y-1 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-x-4">
            {filas.map((f, i) => (
              <div key={f.municipio} className="contents">
                <p className="truncate pt-2 text-[0.9rem] font-semibold sm:py-3 sm:text-right">{f.municipio}</p>
                <div
                  tabIndex={0}
                  role="img"
                  aria-label={`${f.municipio}: ${fmt(f.total)} fichas, ${fmt(f.papel)} de papel y ${fmt(f.sistema)} de sistema antiguo`}
                  onPointerMove={(e) => mover(e, i)}
                  onFocus={(e) => {
                    const r = caja.current!.getBoundingClientRect();
                    const b = e.currentTarget.getBoundingClientRect();
                    setTip({ i, x: b.left - r.left + (b.width * f.total) / tope, y: b.top - r.top });
                  }}
                  onBlur={() => setTip(null)}
                  className="relative flex min-h-11 items-center rounded-[6px] focus-visible:outline-2"
                >
                  <div className="relative flex h-5 w-full items-center">
                    <motion.div className="flex h-full gap-[2px]" initial={{ width: 0 }} animate={{ width: `${(f.total / tope) * 100}%` }} transition={{ duration: 0.45, delay: i * 0.04, ease: [0.2, 0.8, 0.2, 1] }}>
                      {f.papel > 0 && <span className={cn("h-full", f.sistema === 0 && "rounded-r-[4px]")} style={{ flex: f.papel, background: SERIES[0].color }} />}
                      {f.sistema > 0 && <span className="h-full rounded-r-[4px]" style={{ flex: f.sistema, background: SERIES[1].color }} />}
                    </motion.div>
                    <span className="num ml-2 shrink-0 text-[0.88rem] font-semibold text-tinta">{fmt(f.total)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {tip && (
            <div
              className="pointer-events-none absolute z-10 w-56 rounded-[12px] border border-linea bg-superficie p-3 text-[0.85rem] shadow-calida-lg"
              style={{ left: Math.min(tip.x + 14, (caja.current?.clientWidth ?? 400) - 232), top: tip.y + 14 }}
              role="tooltip"
            >
              <p className="font-bold text-tinta">{filas[tip.i].municipio}</p>
              <p className="text-[0.78rem] text-tinta-tenue">{filas[tip.i].departamento} · {filas[tip.i].centros} {filas[tip.i].centros === 1 ? "centro" : "centros"}</p>
              <dl className="mt-2 space-y-1">
                {SERIES.map((s) => (
                  <div key={s.clave} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
                    <dt className="text-tinta-suave">{s.nombre}</dt>
                    <dd className="num ml-auto font-semibold text-tinta">{fmt(filas[tip.i][s.clave])}</dd>
                  </div>
                ))}
                <div className="flex border-t border-linea pt-1">
                  <dt className="text-tinta-suave">Total</dt>
                  <dd className="num ml-auto font-bold text-tinta">{fmt(filas[tip.i].total)}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[0.92rem]">
            <caption className="sr-only">Fichas rescatadas por municipio</caption>
            <thead>
              <tr className="border-b border-linea text-[0.8rem] uppercase tracking-[0.06em] text-tinta-tenue">
                <th className="py-2 pr-3 font-semibold">Municipio</th>
                <th className="py-2 pr-3 font-semibold">Departamento</th>
                <th className="py-2 pr-3 text-right font-semibold">Papel</th>
                <th className="py-2 pr-3 text-right font-semibold">Sistema antiguo</th>
                <th className="py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="num">
              {filas.map((f) => (
                <tr key={f.municipio} className="border-b border-linea last:border-0">
                  <td className="py-2.5 pr-3 font-semibold">{f.municipio}</td>
                  <td className="py-2.5 pr-3 text-tinta-suave">{f.departamento}</td>
                  <td className="py-2.5 pr-3 text-right">{fmt(f.papel)}</td>
                  <td className="py-2.5 pr-3 text-right">{fmt(f.sistema)}</td>
                  <td className="py-2.5 text-right font-bold">{fmt(f.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

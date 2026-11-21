import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { GraficaMunicipios } from "@/components/tablero/grafica-municipios";
import { RESCATE_MUNICIPIOS } from "@/datos/demo";

export const metadata: Metadata = { title: "Tablero de rescate" };

const fmt = (n: number) => n.toLocaleString("es-GT");

export default function PaginaTablero() {
  const papel = RESCATE_MUNICIPIOS.reduce((a, m) => a + m.papel, 0);
  const sistema = RESCATE_MUNICIPIOS.reduce((a, m) => a + m.sistema, 0);
  const centros = RESCATE_MUNICIPIOS.reduce((a, m) => a + m.centros, 0);
  const total = papel + sistema;
  const tiles = [
    { etiqueta: "Fichas rescatadas", valor: fmt(total), detalle: `${Math.round((papel / total) * 100)}% desde papel`, destacado: true },
    { etiqueta: "Pacientes con expediente", valor: fmt(Math.round(total * 0.41)), detalle: "unidos por DPI o CUI" },
    { etiqueta: "Centros conectados", valor: String(centros), detalle: `en ${RESCATE_MUNICIPIOS.length} municipios` },
    { etiqueta: "Horas de transcripción ahorradas", valor: fmt(Math.round(total * 0.07)), detalle: "unos 4 minutos por ficha" },
  ];
  return (
    <Shell rol="hospital" ancho="amplio">
      <p className="ceja">Piloto · Área de salud de Totonicapán y Quetzaltenango</p>
      <h1 className="mt-4 text-[2.2rem] leading-[1.05] text-primario sm:text-[2.8rem]">Tablero de rescate</h1>
      <p className="mt-2 max-w-2xl text-tinta-suave">Cuántas historias ya salieron del papel y de los sistemas antiguos, municipio por municipio.</p>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.etiqueta} className={t.destacado ? "rounded-[18px] bg-primario p-4 text-white shadow-calida-lg sm:p-5" : "rounded-[18px] border border-linea bg-superficie p-4 shadow-calida sm:p-5"}>
            <p className={t.destacado ? "text-[0.85rem] font-semibold text-white/80" : "text-[0.85rem] font-semibold text-tinta-suave"}>{t.etiqueta}</p>
            <p className="num mt-2 font-display text-[2.3rem] font-bold leading-none sm:text-[2.7rem]">{t.valor}</p>
            <p className={t.destacado ? "mt-2 text-[0.82rem] text-[#e3bd96]" : "mt-2 text-[0.82rem] text-tinta-tenue"}>{t.detalle}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <GraficaMunicipios />
      </div>
      <p className="mt-3 text-[0.8rem] text-tinta-tenue">Datos de demostración.</p>
    </Shell>
  );
}

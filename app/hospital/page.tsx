import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { BuscadorDPI } from "@/components/expediente/buscador";
import { ACCESOS, PACIENTES, USUARIOS } from "@/datos/demo";
import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { formatearDPI, momentoBitacora } from "@/lib/utils";

export const metadata: Metadata = { title: "Buscar expediente" };

export default function PaginaHospital() {
  const recientes = ACCESOS.filter((a) => a.centro_id === USUARIOS.hospital.centro.id)
    .map((a) => ({ a, p: PACIENTES.find((p) => p.id === a.paciente_id)! }))
    .slice(0, 3);
  return (
    <Shell rol="hospital">
      <div className="mx-auto max-w-xl pt-4 text-center sm:pt-12">
        <p className="ceja items-center">Tu historia te sigue</p>
        <h1 className="mt-4 text-[2.3rem] leading-[1.05] text-primario sm:text-[2.9rem]">Buscar expediente</h1>
        <p className="mt-2 text-tinta-suave">Escribe el DPI o CUI del paciente. Verás su historial de todos los centros, incluido lo rescatado de papel.</p>
        <BuscadorDPI />
      </div>

      {recientes.length > 0 && (
        <section className="mx-auto mt-14 max-w-xl">
          <h2 className="flex items-center gap-2 font-sans text-[0.95rem] font-bold text-tinta-suave">
            <History className="h-5 w-5" /> Consultados recientemente desde este hospital
          </h2>
          <ul className="mt-3 divide-y divide-linea overflow-hidden rounded-[16px] border border-linea bg-superficie">
            {recientes.map(({ a, p }) => (
              <li key={a.id}>
                <Link href={`/hospital/expediente/${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-papel">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.nombre}</p>
                    <p className="num truncate font-mono text-[0.82rem] text-tinta-tenue">{formatearDPI(p.dpi_cui)}</p>
                    <p className="num text-[0.8rem] text-tinta-tenue sm:hidden">{momentoBitacora(a.fecha_hora)}</p>
                  </div>
                  <span className="num hidden shrink-0 text-[0.82rem] text-tinta-tenue sm:inline">{momentoBitacora(a.fecha_hora)}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-tinta-tenue" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}

import { Building2, Hospital, Eye } from "lucide-react";
import { CENTROS } from "@/datos/demo";
import type { AccesoDemo } from "@/datos/demo";
import { Insignia } from "@/components/ui/badge";
import { momentoBitacora } from "@/lib/utils";

export function Bitacora({ accesos, nuevoId }: { accesos: AccesoDemo[]; nuevoId?: string }) {
  return (
    <section aria-labelledby="titulo-bitacora" className="rounded-[18px] border border-linea bg-superficie shadow-calida">
      <div className="flex items-center gap-2 border-b border-linea px-4 py-3.5 sm:px-5">
        <Eye className="h-5 w-5 text-primario" />
        <h2 id="titulo-bitacora" className="font-sans text-[1rem] font-bold">Bitácora de acceso</h2>
        <span className="num ml-auto text-[0.85rem] text-tinta-tenue">{accesos.length}</span>
      </div>
      <ol className="divide-y divide-linea">
        {accesos.map((a) => {
          const centro = CENTROS[a.centro_id];
          const Icono = centro?.tipo === "hospital" ? Hospital : Building2;
          return (
            <li key={a.id} className={a.id === nuevoId ? "bg-primario-suave/60 px-4 py-3 sm:px-5" : "px-4 py-3 sm:px-5"}>
              <p className="flex items-start gap-2 text-[0.92rem]">
                <Icono className="mt-0.5 h-4 w-4 shrink-0 text-tinta-tenue" />
                <span>
                  <span className="font-semibold">Consultado por {centro?.nombre}</span>
                  <span className="num text-tinta-suave"> · {momentoBitacora(a.fecha_hora)}</span>
                </span>
              </p>
              <p className="mt-0.5 flex items-center gap-2 pl-6 text-[0.82rem] text-tinta-tenue">
                {a.usuario} · {a.rol === "hospital" ? "Hospital" : "Puesto de salud"}
                {a.id === nuevoId && <Insignia tono="primario" className="py-0.5">Tú, ahora</Insignia>}
              </p>
            </li>
          );
        })}
      </ol>
      <p className="border-t border-linea px-4 py-3 text-[0.8rem] text-tinta-tenue sm:px-5">Cada vez que alguien abre este expediente queda registrado aquí.</p>
    </section>
  );
}

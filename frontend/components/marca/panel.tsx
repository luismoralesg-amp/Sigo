import { Logo, Manchas } from "@/components/marca/logo";

const PASOS = [
  { titulo: "La enfermera digitaliza", texto: "Foto de la ficha o el archivo viejo. Nada se borra." },
  { titulo: "La paciente comparte", texto: "Un código que sirve una vez y vence solo." },
  { titulo: "El médico consulta", texto: "Solo mientras el código esté vigente." },
];

/** Panel marino de las pantallas de entrada (solo en escritorio). Los pasos son la secuencia real del flujo. */
export function PanelMarca({ titulo }: { titulo: string }) {
  return (
    <aside className="relative hidden overflow-hidden bg-primario text-[#EEEAE5] lg:flex lg:flex-col lg:justify-between lg:p-14">
      <Manchas variante="marino" />
      <div className="relative">
        <Logo tamaño="lg" invertido />
      </div>
      <div className="relative">
        <h2 className="max-w-xl text-[2.7rem] font-bold leading-[1.03] text-[#EEEAE5]">{titulo}</h2>
        <ol className="mt-9 grid grid-cols-3 gap-3">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className={i === 1 ? "rounded-[18px] bg-kraft-borde p-5 text-primario" : "rounded-[18px] bg-[#31416a] p-5"}>
              <span className={i === 1 ? "num font-display text-[1rem] font-bold text-primario/70" : "num font-display text-[1rem] font-bold text-[#e3bd96]"}>{i + 1}</span>
              <p className="mt-2 font-display text-[1.25rem] font-bold leading-tight">{p.titulo}</p>
              <p className={i === 1 ? "mt-2 text-[0.9rem] leading-snug text-primario/85" : "mt-2 text-[0.9rem] leading-snug text-[#EEEAE5]/80"}>{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
      <p className="relative text-[0.85rem] text-[#EEEAE5]/70">Tu historia te sigue. Datos de demostración, todos inventados.</p>
    </aside>
  );
}

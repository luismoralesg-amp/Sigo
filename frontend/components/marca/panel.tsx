import { Logo, Manchas } from "@/components/marca/logo";

const PASOS = [
  { titulo: "La enfermera digitaliza", texto: "Foto de la ficha o el archivo viejo. Nada se borra." },
  { titulo: "La paciente comparte", texto: "Un código que sirve una vez y vence solo." },
  { titulo: "El médico consulta", texto: "Solo mientras el código esté vigente." },
];

/**
 * Panel marino de las pantallas de entrada (solo en computadora). Es el único lugar con las formas curvas del logo.
 * Los pasos son la secuencia real del flujo. El cobre va solo como acento (raya), nunca como texto.
 */
export function PanelMarca({ titulo }: { titulo: string }) {
  return (
    <aside className="relative hidden overflow-hidden bg-primario text-[#EEEAE5] lg:flex lg:flex-col lg:justify-between lg:p-14">
      <Manchas variante="marino" />
      <div className="relative">
        <Logo tamaño="lg" invertido />
      </div>
      <div className="relative">
        <span className="block h-1 w-12 rounded-full bg-cobre" aria-hidden="true" />
        <h2 className="mt-5 max-w-xl text-[1.55rem] leading-tight text-white">{titulo}</h2>
        <ol className="mt-8 grid grid-cols-3 gap-3">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="rounded-[12px] bg-[#2f416b] p-5">
              <span className="cifra font-semibold text-[#EEEAE5]">{i + 1}</span>
              <p className="mt-2 font-semibold leading-snug text-white">{p.titulo}</p>
              <p className="mt-1.5 leading-snug text-[#EEEAE5]">{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
      <p className="relative text-[#EEEAE5]">Tu historia te sigue. Datos de demostración, todos inventados.</p>
    </aside>
  );
}

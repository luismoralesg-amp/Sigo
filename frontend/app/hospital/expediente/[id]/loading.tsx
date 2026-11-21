import { Shell } from "@/components/shell";
import { Esqueleto } from "@/components/ui/skeleton";

export default function CargandoExpediente() {
  return (
    <Shell rol="hospital" ancho="amplio">
      <div role="status" aria-label="Abriendo expediente">
        <Esqueleto className="h-5 w-32" />
        <Esqueleto className="mt-5 h-11 w-[70%] max-w-md" />
        <div className="mt-4 flex gap-3">
          <Esqueleto className="h-8 w-32" />
          <Esqueleto className="h-8 w-44" />
        </div>
        <div className="mt-6 h-[150px] animate-pulse rounded-[18px] bg-alerta/15" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="papel-kraft rounded-[16px] p-5">
                <Esqueleto className="h-6 w-40" />
                <Esqueleto className="mt-4 h-4 w-[85%]" />
                <Esqueleto className="mt-2.5 h-4 w-[60%]" />
              </div>
            ))}
          </div>
          <Esqueleto className="h-56 rounded-[18px]" />
        </div>
        <span className="sr-only">Abriendo expediente…</span>
      </div>
    </Shell>
  );
}

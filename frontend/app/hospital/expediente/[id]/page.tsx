import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Syringe, Layers } from "lucide-react";
import { Shell } from "@/components/shell";
import { AlertaClinica } from "@/components/expediente/alerta";
import { LineaTiempo } from "@/components/expediente/linea-tiempo";
import { Bitacora } from "@/components/expediente/bitacora";
import { CarneQR } from "@/components/expediente/carne-qr";
import { expediente, medicamentosActuales, USUARIOS, type AccesoDemo } from "@/datos/demo";
import { edadTexto, fechaCorta, formatearDPI } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: expediente(id)?.paciente.nombre ?? "Expediente" };
}

export default async function PaginaExpediente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = expediente(id);
  if (!datos) notFound();
  const { paciente: p, consultas } = datos;

  // Abrir el expediente registra un acceso en la bitácora.
  const nuevo: AccesoDemo = { id: "ahora", paciente_id: p.id, usuario: USUARIOS.hospital.nombre, rol: "hospital", centro_id: USUARIOS.hospital.centro.id, fecha_hora: new Date().toISOString() };
  const accesos = [nuevo, ...datos.accesos];

  const papel = consultas.filter((c) => c.origen === "foto").length;
  const antiguo = consultas.filter((c) => c.origen === "sistema_antiguo").length;
  const digital = consultas.filter((c) => c.origen === "digital").length;
  const vacunas = [...consultas].reverse().flatMap((c) => c.vacunas.map((v) => ({ v, fecha: c.fecha })));
  const desde = consultas.at(-1)?.fecha.slice(0, 4);

  return (
    <Shell rol="hospital" ancho="amplio">
      <Link href="/hospital" className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 font-semibold text-tinta-suave hover:text-tinta">
        <ArrowLeft className="h-5 w-5" /> Nueva búsqueda
      </Link>

      {/* Encabezado */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[2.1rem] font-semibold leading-[1.08] sm:text-[2.7rem]">{p.nombre}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-tinta-suave">
            <span className="font-semibold text-tinta">
              {edadTexto(p.fecha_nacimiento)} · {p.sexo === "F" ? "Femenino" : "Masculino"}
            </span>
            <span className="num rounded-[8px] border border-linea bg-superficie px-2.5 py-1 font-mono text-[0.95rem] font-semibold tracking-[0.04em] text-tinta">
              <span className="mr-1.5 font-sans text-[0.72rem] font-bold tracking-normal text-tinta-tenue">DPI</span>
              {formatearDPI(p.dpi_cui)}
            </span>
            {p.comunidad && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {p.comunidad}
              </span>
            )}
            <span className="num text-[0.9rem]">Nac. {fechaCorta(p.fecha_nacimiento)}</span>
          </div>
          <div className="mt-4">
            <CarneQR paciente={p} />
          </div>
        </div>

        {/* De dónde viene este expediente */}
        <div className="w-full rounded-[16px] border border-linea bg-superficie p-3.5 lg:w-[340px]">
          <p className="flex items-center gap-1.5 text-[0.82rem] font-bold text-tinta-suave">
            <Layers className="h-4 w-4" /> {consultas.length} consultas unidas desde {desde}
          </p>
          <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
            <span className="bg-kraft-borde" style={{ flex: papel }} />
            <span className="bg-[#dccaa6]" style={{ flex: antiguo }} />
            <span className="bg-primario" style={{ flex: digital }} />
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[0.8rem] text-tinta-suave">
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-kraft-borde" />{papel} de papel</li>
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#dccaa6]" />{antiguo} de sistema antiguo</li>
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primario" />{digital} {digital === 1 ? "digital" : "digitales"}</li>
          </ul>
        </div>
      </header>

      {/* Alerta clínica fija */}
      <div className="z-20 mt-6 lg:sticky lg:top-3">
        <AlertaClinica alergias={p.alergias} condiciones={p.condiciones_cronicas} medicamentos={medicamentosActuales(consultas)} sexo={p.sexo} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="titulo-historial" className="min-w-0">
          <h2 id="titulo-historial" className="mb-4 text-[1.45rem] font-semibold">Historial de consultas</h2>
          <LineaTiempo consultas={consultas} />
        </section>

        <aside className="min-w-0 space-y-5 lg:pt-[3.1rem]">
          <Bitacora accesos={accesos} nuevoId="ahora" />
          {vacunas.length > 0 && (
            <section className="rounded-[18px] border border-linea bg-superficie shadow-calida">
              <div className="flex items-center gap-2 border-b border-linea px-4 py-3.5 sm:px-5">
                <Syringe className="h-5 w-5 text-confirmado" />
                <h2 className="font-sans text-[1rem] font-bold">Vacunas registradas</h2>
                <span className="num ml-auto text-[0.85rem] text-tinta-tenue">{vacunas.length}</span>
              </div>
              <ul className="divide-y divide-linea">
                {vacunas.map(({ v, fecha }) => (
                  <li key={v + fecha} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[0.9rem] sm:px-5">
                    <span className="font-semibold">{v}</span>
                    <span className="num shrink-0 text-tinta-tenue">{fechaCorta(fecha)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </Shell>
  );
}

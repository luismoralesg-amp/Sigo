import type { Metadata } from "next";
import Link from "next/link";
import { Camera, FileSpreadsheet, ArrowRight, ScrollText, Database } from "lucide-react";
import { Shell } from "@/components/shell";
import { Tarjeta } from "@/components/ui/card";
import { Insignia } from "@/components/ui/badge";
import { CONTADORES_PUESTO, RECIENTES_PUESTO, USUARIOS } from "@/datos/demo";

export const metadata: Metadata = { title: "Inicio del puesto" };

function saludo() {
  const h = Number(new Intl.DateTimeFormat("es-GT", { timeZone: "America/Guatemala", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default function InicioPuesto() {
  const u = USUARIOS.puesto;
  return (
    <Shell rol="puesto">
      <p className="text-tinta-suave">{saludo()}, {u.nombre.split(" ")[0]}</p>
      <h1 className="mt-1 text-[2rem] font-semibold leading-tight sm:text-[2.4rem]">¿Qué vamos a rescatar hoy?</h1>

      {/* contadores */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Tarjeta className="p-4 sm:p-5">
          <p className="text-[0.85rem] font-semibold text-tinta-suave">Rescatadas hoy</p>
          <p className="num mt-1 font-serif text-[2.4rem] font-semibold leading-none text-primario">{CONTADORES_PUESTO.hoy}</p>
          <p className="mt-1.5 text-[0.82rem] text-tinta-tenue">fichas y registros</p>
        </Tarjeta>
        <Tarjeta className="p-4 sm:p-5">
          <p className="text-[0.85rem] font-semibold text-tinta-suave">Rescatadas en total</p>
          <p className="num mt-1 font-serif text-[2.4rem] font-semibold leading-none">{CONTADORES_PUESTO.total.toLocaleString("es-GT")}</p>
          <p className="mt-1.5 text-[0.82rem] text-tinta-tenue">desde que empezó el puesto</p>
        </Tarjeta>
      </div>

      {/* acciones principales */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <AccionGrande
          href="/puesto/digitalizar"
          icono={<Camera className="h-8 w-8" strokeWidth={1.75} />}
          titulo="Digitalizar ficha en papel"
          texto="Toma una foto. La IA lee la letra y tú revisas antes de guardar."
          tono="primario"
        />
        <AccionGrande
          href="/puesto/importar"
          icono={<FileSpreadsheet className="h-8 w-8" strokeWidth={1.75} />}
          titulo="Importar sistema antiguo"
          texto="Sube el Excel, Access o CSV tal como está. El sistema original sigue igual."
          tono="kraft"
        />
      </div>

      {/* recientes */}
      <section className="mt-10">
        <h2 className="text-[1.3rem] font-semibold">Rescatado recientemente</h2>
        <Tarjeta className="mt-3 divide-y divide-linea">
          {RECIENTES_PUESTO.map((r) => (
            <div key={r.nombre} className="flex items-center gap-3.5 p-4">
              <span className="papel-kraft grid h-11 w-11 shrink-0 place-items-center rounded-[10px]">
                {r.origen === "foto" ? <ScrollText className="h-5 w-5 text-kraft-tinta" /> : <Database className="h-5 w-5 text-kraft-tinta" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.nombre}</p>
                <p className="truncate text-[0.88rem] text-tinta-tenue">{r.detalle}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Insignia tono="confirmado">Confirmado</Insignia>
                <span className="num text-[0.8rem] text-tinta-tenue">hoy {r.hora}</span>
              </div>
            </div>
          ))}
        </Tarjeta>
      </section>
    </Shell>
  );
}

function AccionGrande({ href, icono, titulo, texto, tono }: { href: string; icono: React.ReactNode; titulo: string; texto: string; tono: "primario" | "kraft" }) {
  return (
    <Link
      href={href}
      className={
        tono === "primario"
          ? "group relative flex min-h-[190px] flex-col overflow-hidden rounded-[20px] bg-primario p-5 text-white shadow-[0_14px_34px_-14px_rgba(15,94,90,.7)] transition-transform duration-200 hover:-translate-y-0.5 sm:p-6"
          : "papel-kraft esquina-doblada group relative flex min-h-[190px] flex-col rounded-[20px] p-5 text-kraft-tinta shadow-calida transition-transform duration-200 hover:-translate-y-0.5 sm:p-6"
      }
    >
      <span className={tono === "primario" ? "grid h-14 w-14 place-items-center rounded-[14px] bg-white/12 ring-1 ring-white/20" : "grid h-14 w-14 place-items-center rounded-[14px] bg-white/55 ring-1 ring-kraft-borde"}>
        {icono}
      </span>
      <span className="mt-auto pt-6">
        <span className={tono === "primario" ? "block font-serif text-[1.45rem] font-semibold leading-tight" : "block font-serif text-[1.45rem] font-semibold leading-tight text-tinta"}>{titulo}</span>
        <span className={tono === "primario" ? "mt-1.5 block text-[0.95rem] text-white/85" : "mt-1.5 block text-[0.95rem]"}>{texto}</span>
      </span>
      <ArrowRight className="absolute right-5 top-6 h-6 w-6 opacity-70 transition-transform duration-200 group-hover:translate-x-1" />
    </Link>
  );
}

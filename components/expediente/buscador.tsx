"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, LoaderCircle, FileQuestion } from "lucide-react";
import { Boton } from "@/components/ui/button";
import { buscarPorDPI } from "@/datos/demo";
import { cn, formatearDPI, soloDigitos } from "@/lib/utils";

export function BuscadorDPI() {
  const router = useRouter();
  const [valor, setValor] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [noEncontrado, setNoEncontrado] = useState<string | null>(null);
  const digitos = soloDigitos(valor);
  const completo = digitos.length === 13;

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (!completo) return;
    setBuscando(true);
    setNoEncontrado(null);
    setTimeout(() => {
      const p = buscarPorDPI(digitos);
      if (p) router.push(`/hospital/expediente/${p.id}`);
      else {
        setBuscando(false);
        setNoEncontrado(formatearDPI(digitos));
      }
    }, 500);
  }

  return (
    <form onSubmit={buscar} className="mt-8 text-left" role="search">
      <label htmlFor="dpi" className="sr-only">DPI o CUI del paciente</label>
      <div className={cn("flex items-center gap-2 rounded-[20px] border-2 bg-superficie p-2 shadow-calida-lg transition-colors focus-within:border-primario", noEncontrado ? "border-revisar" : "border-linea")}>
        <Search className="ml-3 h-6 w-6 shrink-0 text-tinta-tenue" />
        <input
          id="dpi"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="0000 00000 0000"
          value={formatearDPI(valor)}
          onChange={(e) => {
            setValor(soloDigitos(e.target.value).slice(0, 13));
            setNoEncontrado(null);
          }}
          className="num min-h-14 w-full min-w-0 bg-transparent font-mono text-[1.45rem] font-medium tracking-[0.06em] text-tinta outline-none placeholder:text-[#c9c1b2] focus-visible:outline-none sm:text-[1.7rem]"
          aria-describedby="dpi-ayuda"
        />
        <Boton type="submit" tamaño="lg" className="hidden shrink-0 sm:inline-flex" disabled={!completo || buscando}>
          {buscando ? <LoaderCircle className="animate-spin" /> : null} Buscar
        </Boton>
      </div>
      <div className="mt-2.5 flex items-center justify-between px-2 text-[0.85rem] text-tinta-tenue" id="dpi-ayuda">
        <span>13 dígitos, sin guiones</span>
        <span className="num">{digitos.length}/13</span>
      </div>
      <Boton type="submit" tamaño="xl" className="mt-4 w-full sm:hidden" disabled={!completo || buscando}>
        {buscando ? <LoaderCircle className="animate-spin" /> : <Search />} Buscar expediente
      </Boton>

      <AnimatePresence>
        {noEncontrado && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6 flex gap-3.5 rounded-[16px] border border-revisar bg-revisar-fondo p-4" role="alert">
            <FileQuestion className="h-6 w-6 shrink-0 text-revisar-tinta" />
            <div>
              <p className="font-bold text-revisar-tinta">No hay expediente con el DPI {noEncontrado}</p>
              <p className="mt-1 text-[0.92rem] text-tinta-suave">Revisa los números con el documento. Si la persona nunca fue atendida en un centro conectado, todavía no tiene expediente.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-8 text-center text-[0.85rem] text-tinta-tenue">
        Para el demo: <button type="button" className="num rounded font-mono font-semibold text-primario underline decoration-dotted underline-offset-4" onClick={() => setValor("2456789010801")}>2456 78901 0801</button>
      </p>
    </form>
  );
}

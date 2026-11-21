/** Fichas de papel apiladas que se convierten en un expediente limpio. */
export function IlustracionPuente() {
  return (
    <div className="relative mx-auto my-8 h-[340px] w-full max-w-[520px]" aria-hidden="true">
      {/* pila de papel */}
      <div className="absolute left-2 top-16 h-56 w-44 -rotate-[9deg] rounded-[6px] border border-kraft-borde bg-[#efe3c9] shadow-calida" />
      <div className="absolute left-6 top-12 h-56 w-44 -rotate-[4deg] rounded-[6px] border border-kraft-borde bg-[#f3e9d3] shadow-calida" />
      <div className="esquina-doblada absolute left-10 top-8 h-56 w-44 rotate-[1deg] rounded-[6px] border border-kraft-borde bg-[#f7efdd] p-4 shadow-calida-lg">
        <div className="font-mono text-[9px] font-semibold tracking-wide text-[#5a4a30]">FICHA CLÍNICA · 2014</div>
        <div className="mt-3 space-y-3 font-[family-name:var(--font-caveat)] text-[19px] leading-none text-[#1f3a8a]">
          <p>Rosa E. Tzul</p>
          <p>15/4/68 · F</p>
          <p className="text-[#b3261e]">PENICILINA !!</p>
          <p>Dx: reacción alérg.</p>
        </div>
      </div>
      {/* pulso que sale del papel */}
      <svg className="absolute left-[200px] top-[130px] h-24 w-[150px]" viewBox="0 0 150 96" fill="none">
        <path d="M0 48h34l9-24 12 46 11-34 7 12h77" stroke="#0F5E5A" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="210" className="[animation:pulso_2.4s_ease-in-out_infinite]" />
        <style>{`@keyframes pulso{0%{stroke-dashoffset:210}55%,100%{stroke-dashoffset:0}}`}</style>
      </svg>
      {/* expediente digital */}
      <div className="absolute right-0 top-14 w-[200px] rounded-[14px] border border-linea bg-superficie p-3.5 shadow-calida-lg">
        <div className="rounded-[8px] bg-alerta px-2.5 py-1.5 text-[11px] font-bold tracking-wide text-white">ALÉRGICA A PENICILINA</div>
        <div className="mt-3 font-serif text-[15px] font-semibold text-tinta">Rosa Elena Tzul Batz</div>
        <div className="num font-mono text-[11px] text-tinta-tenue">2456 78901 0801</div>
        <div className="mt-3 space-y-1.5">
          {["2026 · Digital", "2018 · Excel", "2014 · Papel"].map((t, i) => (
            <div key={t} className="flex items-center gap-2 text-[11px] text-tinta-suave">
              <span className={i === 0 ? "h-2 w-2 rounded-full bg-primario" : "h-2 w-2 rounded-full bg-kraft-borde"} />
              {t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

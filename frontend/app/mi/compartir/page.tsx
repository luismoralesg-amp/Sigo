"use client";
/**
 * /mi/compartir · paciente. Código y QR temporal, con cuenta regresiva y opción de mandarlo por SMS.
 * Endpoint: POST /pacientes/{dpi}/consentimientos.
 */
import { Shell } from "@/components/shell";
import { GenerarCodigo } from "@/components/expediente/codigo";
import { DURACION_ACCESO_TEXTO } from "@/lib/api/cliente";
import { useUsuario } from "@/lib/api/sesion";

export default function PaginaCompartir() {
  const { usuario } = useUsuario();
  return (
    <Shell>
      <h1 className="text-[2rem] leading-tight text-primario sm:text-[2.4rem]">Compartir mi historial</h1>
      <p className="mt-2 max-w-[62ch] text-tinta-suave">
        Genera un código y muéstraselo al médico. Sirve una sola vez y hay que usarlo en los próximos 10 minutos. Con él, el médico puede ver tu historial durante {DURACION_ACCESO_TEXTO}; después se cierra solo. Siempre puedes ver quién lo abrió.
      </p>
      <div className="mt-7">
        <GenerarCodigo dpi={usuario.dpi!} para="paciente" />
      </div>
    </Shell>
  );
}

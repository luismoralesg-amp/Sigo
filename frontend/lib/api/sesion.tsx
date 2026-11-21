"use client";
/**
 * Sesión en el navegador.
 * - Personal (demo): POST /dev/sesion { rol } → token → Authorization Bearer → GET /me.
 * - Personal (opcional): NEXT_PUBLIC_SIGO_AUTH=supabase y variables presentes → access_token de Supabase.
 * - Paciente: POST /auth/paciente → token → GET /me.
 * - `Protegida` cuida cada sección: sin sesión manda a entrar, rol equivocado manda a su inicio,
 *   y si GET /me dice debe_cambiar_pin, manda a /mi/pin antes que a cualquier otra pantalla.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Rol, Usuario } from "@/lib/types";
import { api, sesionDevValida } from "./cliente";
import { aErrorApi, ErrorApi } from "./errores";
import { borrarSesion, guardarSesion, leerSesion, rutaDeEntrada } from "./token";

export const INICIO_POR_ROL: Record<Rol, string> = { enfermera: "/puesto", medico: "/hospital", paciente: "/mi" };

/** Usuario en memoria para no pedir GET /me en cada cambio de pantalla. */
let enCache: Usuario | null = null;

/** Login de demostración del personal. El contrato solo acepta el rol, no correo ni clave. */
export async function entrarPersonalDev(rol: "enfermera" | "medico"): Promise<Usuario> {
  const cuerpo = await api.sesionDev({ rol });
  if (!sesionDevValida(cuerpo)) {
    throw new ErrorApi(500, "validacion", "La sesión del servidor no trae token, vence_en y usuario.");
  }
  guardarSesion(cuerpo.token, "personal", "dev");
  return cargarUsuario(true);
}

/** Login secundario por Supabase. No se llama si faltan las variables: el cliente no se crea. */
export async function entrarPersonal(correo: string, clave: string): Promise<Usuario> {
  const { crearClienteNavegador, supabaseConfigurado } = await import("@/lib/supabase/cliente");
  if (!supabaseConfigurado()) {
    throw new ErrorApi(500, "validacion", "Faltan las variables de Supabase. El acceso de demostración no las necesita.");
  }
  const { data, error } = await crearClienteNavegador().auth.signInWithPassword({ email: correo.trim(), password: clave });
  if (error || !data.session) throw new ErrorApi(401, "sin_sesion", "Correo o contraseña incorrectos.");
  guardarSesion(data.session.access_token, "personal", "supabase");
  return cargarUsuario(true);
}

export async function entrarPaciente(dpi: string, pin: string): Promise<Usuario> {
  const r = await api.entrarPaciente({ dpi, pin });
  guardarSesion(r.token, "paciente");
  return cargarUsuario(true);
}

export async function cargarUsuario(forzar = false): Promise<Usuario> {
  if (enCache && !forzar) return enCache;
  enCache = await api.me();
  return enCache;
}

export async function salir() {
  const sesion = leerSesion();
  const tipo = sesion?.tipo;
  const origen = sesion?.origen;
  enCache = null;
  borrarSesion();
  if (origen === "supabase") {
    try {
      const { crearClienteNavegador, supabaseConfigurado } = await import("@/lib/supabase/cliente");
      if (supabaseConfigurado()) await crearClienteNavegador().auth.signOut();
    } catch {
      /* la sesión local ya se borró */
    }
  }
  return rutaDeEntrada(tipo);
}

// ---------------------------------------------------------------- contexto

type ContextoSesion = { usuario: Usuario; actualizar: (u: Usuario) => void };
const Contexto = createContext<ContextoSesion | null>(null);

export function useUsuario(): ContextoSesion {
  const c = useContext(Contexto);
  if (!c) throw new Error("useUsuario fuera de <Protegida>");
  return c;
}

/** Envuelve una sección. Mientras verifica la sesión no dibuja nada de la sección. */
export function Protegida({ rol, children, publica }: { rol: Rol; children: React.ReactNode; publica?: string[] }) {
  const router = useRouter();
  const ruta = usePathname();
  const esPublica = publica?.includes(ruta) ?? false;
  const [usuario, setUsuario] = useState<Usuario | null>(enCache?.rol === rol ? enCache : null);
  const [error, setError] = useState<ErrorApi | null>(null);

  const verificar = useCallback(async () => {
    setError(null);
    if (!leerSesion()) {
      router.replace(rol === "paciente" ? "/mi/entrar" : "/login");
      return;
    }
    try {
      const u = await cargarUsuario();
      if (u.rol !== rol) {
        router.replace(INICIO_POR_ROL[u.rol]);
        return;
      }
      setUsuario(u);
    } catch (e) {
      const err = aErrorApi(e);
      if (err.codigo === "sin_sesion") {
        router.replace(await salir());
        return;
      }
      setError(err);
    }
  }, [rol, router]);

  useEffect(() => {
    if (!esPublica) void verificar();
  }, [esPublica, verificar]);

  // Regla de /mi/pin: obligatoria mientras debe_cambiar_pin sea true.
  useEffect(() => {
    if (usuario?.rol === "paciente" && usuario.debe_cambiar_pin && ruta !== "/mi/pin") router.replace("/mi/pin");
  }, [usuario, ruta, router]);

  const actualizar = useCallback((u: Usuario) => {
    enCache = u;
    setUsuario(u);
  }, []);

  if (esPublica) return <>{children}</>;
  if (error) return <FalloSesion error={error} onReintentar={verificar} />;
  if (!usuario || (usuario.rol === "paciente" && usuario.debe_cambiar_pin && ruta !== "/mi/pin")) return <CargandoSesion />;
  return <Contexto.Provider value={{ usuario, actualizar }}>{children}</Contexto.Provider>;
}

function CargandoSesion() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <span className="h-1 w-24 overflow-hidden rounded-full bg-linea">
        <span className="block h-full w-1/3 animate-[deslizar_1.1s_ease-in-out_infinite] rounded-full bg-primario" />
      </span>
    </div>
  );
}

function FalloSesion({ error, onReintentar }: { error: ErrorApi; onReintentar: () => void }) {
  return (
    <div className="mx-auto grid min-h-dvh max-w-md place-items-center px-4 text-center">
      <div>
        <p className="subtitulo">{error.codigo === "sin_senal" ? "Sin señal" : "No pudimos abrir tu sesión"}</p>
        <p className="mt-2 text-tinta-suave">{error.mensaje}</p>
        <button onClick={onReintentar} className="mt-6 min-h-14 w-full rounded-[12px] bg-primario px-5 font-semibold text-white hover:bg-primario-hover">
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}

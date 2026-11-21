import "server-only";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "./supabase/server";
import type { Perfil, Rol } from "./tipos";

export async function obtenerSesion() {
  const sb = await crearClienteServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { sb, user: null, perfil: null } as const;
  const { data } = await sb.from("usuario_perfil").select("user_id, rol, centro_id, nombre_visible, centro:centro_id(*)").eq("user_id", user.id).maybeSingle();
  return { sb, user, perfil: (data as unknown as Perfil) ?? null } as const;
}

/** Para páginas: redirige si no hay sesión o el rol no corresponde. */
export async function requerirRol(rol: Rol) {
  const s = await obtenerSesion();
  if (!s.user || !s.perfil) redirect("/login");
  if (s.perfil.rol !== rol) redirect(s.perfil.rol === "puesto" ? "/puesto" : "/hospital");
  return { sb: s.sb, user: s.user, perfil: s.perfil };
}

/** Para route handlers: devuelve null si no está autorizado. */
export async function autorizar(rol: Rol) {
  const s = await obtenerSesion();
  if (!s.user || !s.perfil || s.perfil.rol !== rol) return null;
  return { sb: s.sb, user: s.user, perfil: s.perfil };
}

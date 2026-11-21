import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { autorizar } from "@/lib/sesion";
import { leerFicha, type ImagenEntrada } from "@/lib/ia";
import { LECTURA_RESPALDO_ROSA } from "@/datos/lectura-respaldo";

export const runtime = "nodejs";
export const maxDuration = 60;

const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGENES = 4;
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const sesion = await autorizar("puesto");
  if (!sesion) return NextResponse.json({ error: "Tu sesión terminó o no tienes permiso para digitalizar fichas." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No recibimos las fotos. Intenta de nuevo." }, { status: 400 });
  }

  // Respaldo para el demo: la ficha de Rosa ya procesada.
  if (form.get("respaldo") === "1") {
    await new Promise((r) => setTimeout(r, 2200));
    return NextResponse.json({ lectura: LECTURA_RESPALDO_ROSA, fuente: "respaldo", intentos: 0 });
  }

  const archivos = form.getAll("imagenes").filter((v): v is File => v instanceof File);
  if (!archivos.length) return NextResponse.json({ error: "Agrega al menos una foto de la ficha." }, { status: 400 });
  if (archivos.length > MAX_IMAGENES) return NextResponse.json({ error: `Máximo ${MAX_IMAGENES} fotos por ficha.` }, { status: 400 });

  const imagenes: ImagenEntrada[] = [];
  for (const a of archivos) {
    if (!TIPOS.has(a.type)) return NextResponse.json({ error: "La foto debe ser JPG, PNG o WEBP." }, { status: 400 });
    if (a.size > MAX_BYTES) return NextResponse.json({ error: "Una de las fotos es muy pesada. Toma la foto de nuevo." }, { status: 400 });
    imagenes.push({ base64: Buffer.from(await a.arrayBuffer()).toString("base64"), tipo: a.type as ImagenEntrada["tipo"] });
  }

  try {
    const { lectura, intentos } = await leerFicha(imagenes);
    return NextResponse.json({ lectura, fuente: "ia", intentos });
  } catch (e) {
    console.error("[leer-ficha]", e);
    let mensaje = "No pudimos leer la ficha en este momento.";
    if (e instanceof Anthropic.RateLimitError) mensaje = "El servicio de lectura está ocupado. Espera unos segundos e intenta de nuevo.";
    else if (e instanceof Anthropic.AuthenticationError) mensaje = "Falta configurar la clave del servicio de lectura.";
    else if (e instanceof Anthropic.APIConnectionError) mensaje = "No hay conexión con el servicio de lectura. Revisa la señal.";
    return NextResponse.json({ error: mensaje, puedeUsarRespaldo: true }, { status: 502 });
  }
}

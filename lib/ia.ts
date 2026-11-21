import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const MODELO_IA = "claude-sonnet-5-5";

const confianza = z.enum(["alta", "media", "baja"]);
const campoTexto = z.object({ valor: z.string(), confianza });
const campoLista = z.object({ valor: z.array(z.string()), confianza });

export const LecturaFichaSchema = z.object({
  paciente: z.object({
    dpi_cui: campoTexto,
    nombre: campoTexto,
    fecha_nacimiento: campoTexto,
    sexo: campoTexto,
    comunidad: campoTexto,
    alergias: campoLista,
    condiciones_cronicas: campoLista,
  }),
  consulta: z.object({
    fecha: campoTexto,
    motivo: campoTexto,
    diagnostico: campoTexto,
    tratamiento: campoTexto,
    vacunas: campoLista,
    medicamentos: campoLista,
  }),
});
export type LecturaFicha = z.infer<typeof LecturaFichaSchema>;

// JSON Schema escrito a mano (structured outputs): todo requerido, nada extra.
const jsTexto = {
  type: "object",
  properties: { valor: { type: "string" }, confianza: { type: "string", enum: ["alta", "media", "baja"] } },
  required: ["valor", "confianza"],
  additionalProperties: false,
};
const jsLista = {
  type: "object",
  properties: { valor: { type: "array", items: { type: "string" } }, confianza: { type: "string", enum: ["alta", "media", "baja"] } },
  required: ["valor", "confianza"],
  additionalProperties: false,
};
const objeto = (props: Record<string, object>) => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false });
const ESQUEMA_JSON = objeto({
  paciente: objeto({
    dpi_cui: jsTexto,
    nombre: jsTexto,
    fecha_nacimiento: jsTexto,
    sexo: jsTexto,
    comunidad: jsTexto,
    alergias: jsLista,
    condiciones_cronicas: jsLista,
  }),
  consulta: objeto({
    fecha: jsTexto,
    motivo: jsTexto,
    diagnostico: jsTexto,
    tratamiento: jsTexto,
    vacunas: jsLista,
    medicamentos: jsLista,
  }),
});

const INSTRUCCIONES = `Eres un transcriptor de fichas clínicas de puestos y centros de salud de Guatemala. Recibes una o varias fotos de la MISMA ficha en papel, a menudo escrita a mano, con letra difícil, tachones, sellos o mala luz.

Tu único trabajo es TRANSCRIBIR lo que está escrito a los campos indicados. Una enfermera revisará y confirmará todo después.

Reglas:
- NO inventes ni deduzcas datos que no estén escritos. Si un campo no aparece o no se lee, deja "valor" vacío ("" o []) con confianza "baja".
- Confianza: "alta" = se lee claramente; "media" = se lee pero alguna letra o número es dudoso, o tuviste que interpretar (por ejemplo un año escrito con 2 dígitos); "baja" = casi ilegible o ausente.
- dpi_cui: solo los 13 dígitos del DPI o CUI, sin espacios ni guiones. Si faltan dígitos o alguno es dudoso, transcribe lo que se lea y usa confianza "media" o "baja".
- Fechas en formato AAAA-MM-DD. En Guatemala se escribe día/mes/año.
- sexo: "F" o "M" (o vacío).
- nombre: como está escrito, con mayúscula inicial en cada nombre y apellido.
- Listas (alergias, condiciones_cronicas, vacunas, medicamentos): un elemento por cosa. En medicamentos incluye la dosis y frecuencia tal como están escritas.
- Abreviaturas frecuentes: PNC = penicilina, HTA = hipertensión arterial, DM2 = diabetes mellitus tipo 2, Dx = diagnóstico, Tx = tratamiento, c/8h = cada 8 horas, SFF = sulfato ferroso, FUR = fecha de última regla, G/P = gestas/partos, Td = toxoide tetánico-diftérico, SPR = sarampión-paperas-rubéola. Puedes escribir el nombre completo de una abreviatura estándar, pero nunca cambies dosis, números ni fechas.
- Si la ficha tiene varias consultas, transcribe la más reciente.
- condiciones_cronicas: solo enfermedades de largo plazo escritas como antecedentes (por ejemplo hipertensión, diabetes, asma, embarazo en curso).
Responde solo con el JSON.`;

export type ImagenEntrada = { base64: string; tipo: "image/jpeg" | "image/png" | "image/webp" };

const cliente = new Anthropic();

/** Lee una ficha con visión. Valida con zod y reintenta una vez si el JSON viene mal. */
export async function leerFicha(imagenes: ImagenEntrada[]): Promise<{ lectura: LecturaFicha; intentos: number }> {
  const contenido: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    ...imagenes.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.tipo, data: img.base64 } })),
    { type: "text", text: imagenes.length > 1 ? `Estas ${imagenes.length} fotos son de la misma ficha. Transcríbela.` : "Transcribe esta ficha clínica." },
  ];

  let ultimoError: unknown = null;
  for (let intento = 1; intento <= 2; intento++) {
    const mensajes: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: contenido }];
    if (intento === 2 && ultimoError) {
      mensajes[0] = {
        role: "user",
        content: [...contenido, { type: "text", text: `Tu respuesta anterior no cumplía el formato (${String(ultimoError).slice(0, 300)}). Devuelve únicamente el JSON válido.` }],
      };
    }
    const respuesta = await cliente.beta.messages.create({
      model: MODELO_IA,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: INSTRUCCIONES,
      messages: mensajes,
      output_config: { effort: (process.env.IA_ESFUERZO as "low" | "medium" | "high") || "low", format: { type: "json_schema", schema: ESQUEMA_JSON } },
    });
    if (respuesta.stop_reason === "refusal") throw new Error("La IA no pudo leer esta imagen.");
    const texto = respuesta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    try {
      const datos = LecturaFichaSchema.parse(JSON.parse(texto));
      return { lectura: datos, intentos: intento };
    } catch (e) {
      ultimoError = e instanceof z.ZodError ? z.prettifyError(e) : e;
    }
  }
  throw new Error(`La lectura no tuvo un formato válido: ${String(ultimoError).slice(0, 200)}`);
}

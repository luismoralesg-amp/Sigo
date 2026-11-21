/**
 * Errores del contrato v2 (docs/contrato-v2.md, "Errores y reglas").
 * Forma única: { "error": { "codigo": "...", "mensaje": "..." } }.
 * El frontend muestra `mensaje` tal cual; los textos de aquí solo se usan si el backend no manda uno.
 */

export type CodigoError =
  | "validacion"
  | "identificador_invalido"
  | "sin_consentimiento"
  | "motivo_requerido"
  | "sin_sesion"
  | "pin_incorrecto"
  | "rol_no_permitido"
  | "acceso_vencido"
  | "solo_emergencia"
  | "no_existe"
  | "dpi_ya_existe"
  | "ficha_ya_confirmada"
  | "codigo_ya_usado"
  | "codigo_vencido"
  | "archivo_muy_grande"
  | "ilegible"
  | "demasiados_intentos"
  | "ia_no_disponible"
  /** Solo del frontend: la petición no llegó (sin señal). No lo manda el backend. */
  | "sin_senal";

export const ERRORES: Record<CodigoError, { status: number; mensaje: string }> = {
  validacion: { status: 400, mensaje: "Revisa los datos marcados." },
  identificador_invalido: { status: 400, mensaje: "Escribe un DPI de 13 dígitos o un identificador TMP-." },
  sin_consentimiento: { status: 400, mensaje: "Falta el consentimiento de la paciente." },
  motivo_requerido: { status: 400, mensaje: "Escribe el motivo, con al menos 10 caracteres." },
  sin_sesion: { status: 401, mensaje: "Tu sesión terminó. Vuelve a entrar." },
  pin_incorrecto: { status: 401, mensaje: "DPI o PIN incorrectos." },
  rol_no_permitido: { status: 403, mensaje: "No tienes acceso a esto." },
  acceso_vencido: { status: 403, mensaje: "El acceso venció. Pide un código nuevo." },
  solo_emergencia: { status: 403, mensaje: "Para ver más, pide el código a la paciente." },
  no_existe: { status: 404, mensaje: "No encontrado." },
  dpi_ya_existe: { status: 409, mensaje: "Ese DPI ya está registrado." },
  ficha_ya_confirmada: { status: 409, mensaje: "Esta ficha ya se confirmó." },
  codigo_ya_usado: { status: 409, mensaje: "Este código ya se usó." },
  codigo_vencido: { status: 410, mensaje: "Este código ya venció. Pide un código nuevo." },
  archivo_muy_grande: { status: 413, mensaje: "El archivo es muy grande. Divide el archivo." },
  ilegible: { status: 422, mensaje: "No se pudo leer. Toma la foto otra vez, con más luz." },
  demasiados_intentos: { status: 429, mensaje: "Demasiados intentos. Espera 15 minutos." },
  ia_no_disponible: { status: 503, mensaje: "El asistente no respondió. Intenta de nuevo." },
  sin_senal: { status: 0, mensaje: "Sin señal. Revisa la conexión e intenta de nuevo." },
};

export class ErrorApi extends Error {
  readonly status: number;
  readonly codigo: CodigoError;
  readonly mensaje: string;

  constructor(status: number, codigo: CodigoError, mensaje?: string) {
    const texto = mensaje || ERRORES[codigo]?.mensaje || "Algo no salió bien.";
    super(texto);
    this.name = "ErrorApi";
    this.status = status;
    this.codigo = codigo;
    this.mensaje = texto;
  }
}

export function esErrorApi(e: unknown): e is ErrorApi {
  return e instanceof ErrorApi;
}

/** Convierte cualquier cosa lanzada en un ErrorApi, para que las pantallas solo manejen un tipo. */
export function aErrorApi(e: unknown): ErrorApi {
  if (e instanceof ErrorApi) return e;
  if (e instanceof TypeError) return new ErrorApi(0, "sin_senal");
  return new ErrorApi(500, "validacion", "Algo no salió bien. Intenta de nuevo.");
}

/** Lee el cuerpo de un error del backend. Si no trae la forma del contrato, deduce el código por el HTTP. */
export async function leerError(r: Response): Promise<ErrorApi> {
  try {
    const cuerpo = (await r.json()) as { error?: { codigo?: string; mensaje?: string } };
    const codigo = cuerpo?.error?.codigo as CodigoError | undefined;
    if (codigo) return new ErrorApi(r.status, codigo in ERRORES ? codigo : porStatus(r.status), cuerpo.error?.mensaje);
  } catch {
    /* cuerpo vacío o no JSON */
  }
  return new ErrorApi(r.status, porStatus(r.status));
}

function porStatus(status: number): CodigoError {
  switch (status) {
    case 401: return "sin_sesion";
    case 403: return "rol_no_permitido";
    case 404: return "no_existe";
    case 410: return "codigo_vencido";
    case 413: return "archivo_muy_grande";
    case 422: return "ilegible";
    case 429: return "demasiados_intentos";
    case 503: return "ia_no_disponible";
    default: return "validacion";
  }
}

/** Errores que marcan un campo en rojo (400 de la tabla). */
export const ERRORES_DE_CAMPO: CodigoError[] = ["validacion", "identificador_invalido", "sin_consentimiento", "motivo_requerido"];

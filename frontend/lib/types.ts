/**
 * Tipos del contrato v2 entre frontend y backend de Sigo.
 * Copiados tal cual de docs/contrato-v2.md, sección "Modelos de datos".
 * El backend responde con esta forma exacta. No renombrar campos: si el contrato cambia, se cambia allá primero.
 * Única diferencia con el documento: cada tipo lleva `export` para poder importarlo.
 */

// Un dato leído por la IA o por la importación. "baja" = se pinta en amarillo y se revisa primero.
export type Campo<T> = { valor: T | null; confianza: "alta" | "baja" };

// 13 dígitos, o "TMP-" + fecha AAAAMMDD + "-" + 4 caracteres aleatorios: "TMP-20261121-7KQ2"
export type Identificador = string;

export type Rol = "enfermera" | "medico" | "paciente";

export type Centro = {
  id: string;
  nombre: string;              // "Puesto de Salud de Chichicastenango"
  tipo: "puesto" | "centro" | "hospital";
  municipio: string;
  departamento: string;
};

// Para paciente, centro = null y dpi = el suyo.
export type Usuario = { id: string; nombre: string; rol: Rol; centro: Centro | null; dpi: Identificador | null; debe_cambiar_pin: boolean };

// Lo que la IA o la importación leyeron, antes de que una persona confirme.
export type Extraccion = {
  paciente: {
    nombre: Campo<string>;
    dpi: Campo<string>;
    fecha_nacimiento: Campo<string>;    // YYYY-MM-DD
    sexo: Campo<"F" | "M">;
    comunidad: Campo<string>;
    alergias: Campo<string[]>;
    condiciones_cronicas: Campo<string[]>;
  };
  consultas: Array<{
    fecha: Campo<string>;
    motivo: Campo<string>;
    diagnostico: Campo<string>;
    tratamiento: Campo<string>;
    vacunas: Campo<string[]>;
    pagina: number;                     // foto o fila de donde salió (0, 1, 2...)
  }>;
};

export type Ficha = {
  id: string;
  dpi: Identificador;                   // la ficha nace ligada al paciente buscado o creado
  origen: "foto" | "importacion";
  client_id: string | null;             // lo genera el celular; null si vino de importación
  estado: "procesando" | "lista" | "confirmada" | "error";
  originales: string[];                 // URLs firmadas de las fotos o del archivo, válidas al menos 1 hora
  extraccion: Extraccion | null;        // null mientras estado = "procesando"
  error: string | null;
  creada_en: string;
};

export type Paciente = {
  dpi: Identificador;
  nombre: string;
  fecha_nacimiento: string | null;
  sexo: "F" | "M" | null;
  comunidad: string | null;
  alergias: string[];
  condiciones_cronicas: string[];
  version: number;                      // sube con cada corrección
};

export type Consulta = {
  id: string;
  version: number;                      // 1 al confirmar; 2, 3... con cada corrección
  fecha: string | null;
  centro: Centro;
  motivo: string | null;
  diagnostico: string | null;
  tratamiento: string | null;
  vacunas: string[];
  original_url: string;                 // la foto o el archivo de donde salió
  editada_por: string;
  editada_en: string;
};

export type Version = {
  version: number;
  datos: Omit<Consulta, "id" | "version" | "editada_por" | "editada_en">;
  motivo_cambio: string | null;         // null en la versión 1
  editada_por: string;
  editada_en: string;
};

export type Expediente = {
  paciente: Paciente;
  alertas: { alergias: string[]; condiciones_cronicas: string[]; medicamentos: string[] }; // siempre presentes
  consultas: Consulta[];                // versión vigente, de la más reciente a la más antigua; [] en emergencia
  tipo_acceso: "codigo" | "emergencia" | null;  // null para paciente y enfermera
  acceso_vence_en: string | null;
};

export type Consentimiento = {
  codigo: string;                       // 8 caracteres aleatorios, sin 0, O, 1 ni I: "K7P4-Q2XM"
  qr: string;                           // texto que el frontend convierte en QR
  vence_en: string;                     // hasta cuándo se puede activar (10 minutos)
  enviado_por_sms: boolean;
};

export type Acceso = {
  quien: string;                        // médico o enfermera
  centro: string;
  tipo: "codigo" | "emergencia" | "enfermera";
  motivo: string | null;                // obligatorio en emergencia
  desde: string;
  hasta: string;
  preguntas_hechas: number;
};

export type Fuente = { consulta_id: string; version: number; original_url: string; campo: string };

export type Importacion = {
  id: string;
  archivo: string;
  filas: number;
  columnas: string[];                   // como vienen en el archivo
  mapeo_sugerido: Record<string, string | null>; // columna → campo ("DPI" → "dpi"); null = se ignora
  muestra: Record<string, string>[];    // las primeras 5 filas, tal cual
};

export type Rol = "puesto" | "hospital";
export type Origen = "foto" | "sistema_antiguo" | "digital";
export type Confianza = "alta" | "media" | "baja";

export interface Centro {
  id: string;
  nombre: string;
  tipo: "puesto" | "centro" | "hospital";
  municipio: string;
  departamento: string;
}

export interface Paciente {
  id: string;
  dpi_cui: string | null;
  nombre: string;
  fecha_nacimiento: string | null;
  sexo: "F" | "M" | null;
  comunidad: string | null;
  alergias: string[];
  condiciones_cronicas: string[];
}

export interface Consulta {
  id: string;
  paciente_id: string;
  centro_id: string | null;
  fecha: string;
  motivo: string | null;
  diagnostico: string | null;
  tratamiento: string | null;
  vacunas: string[];
  medicamentos: string[];
  origen: Origen;
  fuente_detalle: string | null;
  archivo_original_url: string | null;
  archivos_originales: string[];
  fila_original: Record<string, string> | null;
  confirmado_por: string | null;
  creado_en: string;
}

export interface Perfil {
  user_id: string;
  rol: Rol;
  centro_id: string;
  nombre_visible: string | null;
  centro: Centro;
}

/** Datos de paciente + consulta en forma plana (de la IA o de una fila del sistema antiguo). */
export interface RegistroClinico {
  dpi_cui: string;
  nombre: string;
  fecha_nacimiento: string;
  sexo: string;
  comunidad: string;
  alergias: string[];
  condiciones_cronicas: string[];
  fecha: string;
  motivo: string;
  diagnostico: string;
  tratamiento: string;
  vacunas: string[];
  medicamentos: string[];
}

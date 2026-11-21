/**
 * Datos semilla del servidor simulado. Todo inventado, ningún paciente real.
 * Sale de los ejemplos de docs/contrato-v2.md: Ana Tzul (GET /me), doña Rosa (2547896310801, PIN 482193),
 * la consulta prenatal del 14 de agosto de 2025 (GET /fichas/{id}) y el niño TMP-20261121-7KQ2.
 * Lo que el contrato no trae (el médico, las otras consultas, la bitácora) sigue la misma historia:
 * Rosa de Chichicastenango, referida al Hospital Regional de Quiché.
 */
import type { Acceso, Centro, Extraccion, Paciente, Usuario, Version } from "@/lib/types";

export const CENTRO_PUESTO: Centro = {
  id: "c_01",
  nombre: "Puesto de Salud de Chichicastenango",
  tipo: "puesto",
  municipio: "Chichicastenango",
  departamento: "Quiché",
};

export const CENTRO_HOSPITAL: Centro = {
  id: "c_02",
  nombre: "Hospital Regional de Quiché",
  tipo: "hospital",
  municipio: "Santa Cruz del Quiché",
  departamento: "Quiché",
};

/** Respuesta de ejemplo de GET /me (contrato, sección "Entrar"). */
export const USUARIO_ENFERMERA: Usuario = {
  id: "u_01",
  nombre: "Ana Tzul",
  rol: "enfermera",
  dpi: null,
  debe_cambiar_pin: false,
  centro: CENTRO_PUESTO,
};

export const USUARIO_MEDICO: Usuario = {
  id: "u_02",
  nombre: "Dr. Mateo Us",
  rol: "medico",
  dpi: null,
  debe_cambiar_pin: false,
  centro: CENTRO_HOSPITAL,
};

/** Cuentas del login de personal en modo demo. */
export const CUENTAS_DEMO = [
  { correo: "ana.tzul@sigo.demo", usuario: USUARIO_ENFERMERA, token: "mock-enfermera" },
  { correo: "mateo.us@sigo.demo", usuario: USUARIO_MEDICO, token: "mock-medico" },
] as const;

export const DPI_ROSA = "2547896310801";
export const TMP_DIEGO = "TMP-20261121-7KQ2";

export type RegistroPaciente = {
  paciente: Paciente;
  telefono: string | null;
  pin: string;
  debe_cambiar_pin: boolean;
  creado_por: string | null;
};

export const PACIENTES_SEMILLA: RegistroPaciente[] = [
  {
    paciente: {
      dpi: DPI_ROSA,
      nombre: "Rosa Batz Tzoc",
      fecha_nacimiento: "1984-03-12",
      sexo: "F",
      comunidad: "Chichicastenango",
      alergias: ["penicilina"],
      condiciones_cronicas: [],
      version: 1,
    },
    telefono: "5555 0142",
    pin: "482193",
    debe_cambiar_pin: true,
    creado_por: "u_01",
  },
  {
    paciente: {
      dpi: TMP_DIEGO,
      nombre: "Diego Ixcoy Batz",
      fecha_nacimiento: "2025-11-20",
      sexo: "M",
      comunidad: "Chichicastenango",
      alergias: [],
      condiciones_cronicas: [],
      version: 1,
    },
    telefono: "5555 0142",
    pin: "615204",
    debe_cambiar_pin: true,
    creado_por: "u_01",
  },
];

type DatosConsulta = Version["datos"];
const datos = (d: Omit<DatosConsulta, "centro">): DatosConsulta => ({ ...d, centro: CENTRO_PUESTO });

export type RegistroConsulta = { id: string; dpi: string; versiones: Version[] };

export const CONSULTAS_SEMILLA: RegistroConsulta[] = [
  {
    id: "con-001",
    dpi: DPI_ROSA,
    versiones: [
      {
        version: 1,
        datos: datos({ fecha: "2026-10-20", motivo: "Dolor de garganta y fiebre", diagnostico: "Faringoamigdalitis aguda", tratamiento: "Azitromicina 500 mg al día por 3 días", vacunas: [], original_url: "/demo/ficha-rosa-2026.jpg" }),
        motivo_cambio: null,
        editada_por: "Ana Tzul",
        editada_en: "2026-10-02T11:05:00-06:00",
      },
      {
        version: 2,
        datos: datos({ fecha: "2026-10-02", motivo: "Dolor de garganta y fiebre", diagnostico: "Faringoamigdalitis aguda", tratamiento: "Azitromicina 500 mg al día por 3 días", vacunas: [], original_url: "/demo/ficha-rosa-2026.jpg" }),
        motivo_cambio: "Fecha mal leída",
        editada_por: "Ana Tzul",
        editada_en: "2026-10-02T11:12:00-06:00",
      },
    ],
  },
  {
    id: "con-002",
    dpi: DPI_ROSA,
    versiones: [
      {
        version: 1,
        datos: datos({ fecha: "2025-08-14", motivo: "Control prenatal", diagnostico: "Embarazo 24 semanas", tratamiento: "Sulfato ferroso", vacunas: ["Td"], original_url: "/demo/ficha-rosa-2025.jpg" }),
        motivo_cambio: null,
        editada_por: "Ana Tzul",
        editada_en: "2026-11-21T10:44:00-06:00",
      },
    ],
  },
  {
    id: "con-003",
    dpi: DPI_ROSA,
    versiones: [
      {
        version: 1,
        datos: datos({ fecha: "2019-05-20", motivo: "Tos y fiebre", diagnostico: "Infección respiratoria aguda", tratamiento: "Acetaminofén 500 mg cada 8 horas", vacunas: [], original_url: "/demo/ficha-rosa-2019.jpg" }),
        motivo_cambio: null,
        editada_por: "Ana Tzul",
        editada_en: "2026-11-20T09:30:00-06:00",
      },
    ],
  },
  {
    id: "con-004",
    dpi: TMP_DIEGO,
    versiones: [
      {
        version: 1,
        datos: datos({ fecha: "2026-01-20", motivo: "Control de niño sano", diagnostico: "Crecimiento adecuado para la edad", tratamiento: null, vacunas: ["Pentavalente 1", "Polio 1", "Rotavirus 1"], original_url: "/demo/ficha-diego-2026.jpg" }),
        motivo_cambio: null,
        editada_por: "Ana Tzul",
        editada_en: "2026-11-21T08:20:00-06:00",
      },
    ],
  },
];

export const BITACORA_SEMILLA: Record<string, Acceso[]> = {
  [DPI_ROSA]: [
    { quien: "Ana Tzul", centro: CENTRO_PUESTO.nombre, tipo: "enfermera", motivo: null, desde: "2026-11-20T09:15:00-06:00", hasta: "2026-11-20T09:15:00-06:00", preguntas_hechas: 0 },
    { quien: "Dr. Mateo Us", centro: CENTRO_HOSPITAL.nombre, tipo: "codigo", motivo: null, desde: "2026-10-05T10:02:00-06:00", hasta: "2026-10-05T12:02:00-06:00", preguntas_hechas: 2 },
    { quien: "Dra. Lucía Chumil", centro: CENTRO_HOSPITAL.nombre, tipo: "emergencia", motivo: "Llega inconsciente a emergencias", desde: "2026-06-11T22:40:00-06:00", hasta: "2026-06-11T23:40:00-06:00", preguntas_hechas: 0 },
  ],
  [TMP_DIEGO]: [],
};

/**
 * Extracción de ejemplo de GET /fichas/{id} (ficha f_88 del contrato), tal cual.
 * El servidor simulado la devuelve para cualquier foto: si el paciente de la ficha no es Rosa,
 * el DPI leído no coincide y la pantalla de revisión lo marca en rojo, como pide el contrato.
 */
export const EXTRACCION_EJEMPLO: Extraccion = {
  paciente: {
    nombre: { valor: "Rosa Batz Tzoc", confianza: "alta" },
    dpi: { valor: "2547896310801", confianza: "alta" },
    fecha_nacimiento: { valor: "1984-03-12", confianza: "alta" },
    sexo: { valor: "F", confianza: "alta" },
    comunidad: { valor: "Chichicastenango", confianza: "alta" },
    alergias: { valor: ["penicilina"], confianza: "alta" },
    condiciones_cronicas: { valor: [], confianza: "alta" },
  },
  consultas: [
    {
      fecha: { valor: "2025-08-14", confianza: "alta" },
      motivo: { valor: "Control prenatal", confianza: "alta" },
      diagnostico: { valor: "Embarazo 24 semanas", confianza: "baja" },
      tratamiento: { valor: "Sulfato ferroso", confianza: "alta" },
      vacunas: { valor: ["Td"], confianza: "alta" },
      pagina: 0,
    },
  ],
};

/** Foto de respaldo cuando una URL local (blob:) ya no existe después de recargar. */
export const FOTO_RESPALDO = "/demo/ficha-rosa-2025.jpg";

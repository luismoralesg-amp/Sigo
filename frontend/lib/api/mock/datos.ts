/**
 * Datos semilla del servidor simulado, tomados de contrato/mocks/*.json (una sola fuente de verdad).
 * Todo inventado, ningún paciente real: doña Rosa (p_12, DPI 2547896330801, PIN 482193), el niño Diego
 * (p_20, TMP-20261121-7KQ2), Ana Tzul (enfermera) y el Dr. Mateo Us (médico).
 * Lo único que no está en los mocks es la consulta de Diego (con-004), para que la ficha de demo del niño tenga destino.
 */
import type { Acceso, Centro, Consulta, Extraccion, Ficha, Paciente, Usuario, Version } from "@/lib/types";
import meEnfermera from "@contrato/mocks/01_GET_me.enfermera.json";
import meMedico from "@contrato/mocks/01_GET_me.medico.json";
import buscarRosa from "@contrato/mocks/04_GET_pacientes_buscar.json";
import buscarDiego from "@contrato/mocks/04_GET_pacientes_buscar.tmp.json";
import crearDiego from "@contrato/mocks/05_POST_pacientes.sin_dpi.json";
import fichaEjemplo from "@contrato/mocks/07_GET_fichas_id.json";
import expedienteRosa from "@contrato/mocks/12_GET_pacientes_id_expediente.json";
import versionesCon001 from "@contrato/mocks/13_GET_consultas_id_versiones.json";
import accesosRosa from "@contrato/mocks/18_GET_pacientes_id_accesos.json";

export const USUARIO_ENFERMERA = meEnfermera as Usuario;
export const USUARIO_MEDICO = meMedico as Usuario;
export const CENTRO_PUESTO = USUARIO_ENFERMERA.centro as Centro;

/** Cuentas que devuelve el mock de POST /dev/sesion. El contrato pide el rol, no una contraseña. */
export const CUENTAS_DEMO = [
  { correo: "ana.tzul@sigo.demo", usuario: USUARIO_ENFERMERA, token: "mock-enfermera" },
  { correo: "mateo.us@sigo.demo", usuario: USUARIO_MEDICO, token: "mock-medico" },
] as const;

const ROSA = (buscarRosa.pacientes[0] as Paciente);
const DIEGO = (buscarDiego.pacientes[0] as Paciente);

export type RegistroPaciente = {
  paciente: Paciente;
  telefono: string | null;
  pin: string;
  debe_cambiar_pin: boolean;
  creado_por: string | null;
};

export const PACIENTES_SEMILLA: RegistroPaciente[] = [
  // PIN del ejemplo de POST /auth/paciente.
  { paciente: ROSA, telefono: "5555 0142", pin: "482193", debe_cambiar_pin: true, creado_por: USUARIO_ENFERMERA.id },
  { paciente: DIEGO, telefono: "5555 0142", pin: crearDiego.pin_inicial, debe_cambiar_pin: true, creado_por: USUARIO_ENFERMERA.id },
];

export type RegistroConsulta = { id: string; paciente_id: string; versiones: Version[] };

const versionUno = (c: Consulta): Version => ({
  version: 1,
  datos: { fecha: c.fecha, centro: c.centro, motivo: c.motivo, diagnostico: c.diagnostico, tratamiento: c.tratamiento, vacunas: c.vacunas, original_url: c.original_url },
  motivo_cambio: null,
  editada_por: c.editada_por,
  editada_en: c.editada_en,
});

const consultasRosa = (expedienteRosa.consultas as Consulta[]).map<RegistroConsulta>((c) => ({
  id: c.id,
  paciente_id: ROSA.id,
  // con-001 trae su historial real de versiones (la fecha mal leída); el resto nace en versión 1.
  versiones: c.id === "con-001" ? [...(versionesCon001.versiones as Version[])].reverse() : [versionUno(c)],
}));

export const CONSULTAS_SEMILLA: RegistroConsulta[] = [
  ...consultasRosa,
  {
    id: "con-004",
    paciente_id: DIEGO.id,
    versiones: [
      versionUno({
        id: "con-004",
        version: 1,
        fecha: "2026-01-20",
        centro: CENTRO_PUESTO,
        motivo: "Control de niño sano",
        diagnostico: "Crecimiento adecuado para la edad",
        tratamiento: null,
        vacunas: ["Pentavalente 1", "Polio 1", "Rotavirus 1"],
        original_url: "/demo/ficha-diego-2026.jpg",
        editada_por: USUARIO_ENFERMERA.nombre,
        editada_en: "2026-11-21T08:20:00-06:00",
      }),
    ],
  },
];

export const BITACORA_SEMILLA: Record<string, Acceso[]> = {
  [ROSA.id]: accesosRosa.accesos as Acceso[],
  [DIEGO.id]: [],
};

/** La ficha f_88 del contrato: ya confirmada (de ella salió con-002). */
export const FICHA_SEMILLA = { ...(fichaEjemplo as Ficha), estado: "confirmada" as const };

/**
 * Extracción de ejemplo de GET /fichas/{id}. El servidor simulado la devuelve para cualquier foto:
 * si el paciente de la ficha no es Rosa, el DPI leído no coincide y la revisión lo marca en rojo.
 */
export const EXTRACCION_EJEMPLO = fichaEjemplo.extraccion as Extraccion;

/** Foto de respaldo cuando una URL local (blob:) ya no existe después de recargar. */
export const FOTO_RESPALDO = "/demo/ficha-rosa-2025.jpg";

/**
 * Datos de demo (todo inventado, ningún paciente real).
 * La interfaz funciona con estos datos mientras se conecta Supabase.
 */
import type { Centro, Consulta, Paciente } from "@/lib/tipos";

export const CENTROS: Record<string, Centro> = {
  chuicaca: { id: "chuicaca", nombre: "Puesto de Salud Aldea Chuicacá", tipo: "puesto", municipio: "Totonicapán", departamento: "Totonicapán" },
  hrq: { id: "hrq", nombre: "Hospital Regional de Quetzaltenango", tipo: "hospital", municipio: "Quetzaltenango", departamento: "Quetzaltenango" },
};

export const USUARIOS = {
  puesto: { nombre: "Marta Pú", cargo: "Enfermera auxiliar", correo: "puesto@sigo.test", centro: CENTROS.chuicaca },
  hospital: { nombre: "Dr. Andrés Xicará", cargo: "Emergencias", correo: "hospital@sigo.test", centro: CENTROS.hrq },
} as const;

export const PACIENTES: Paciente[] = [
  {
    id: "rosa",
    dpi_cui: "2456789010801",
    nombre: "Rosa Elena Tzul Batz",
    fecha_nacimiento: "1968-04-15",
    sexo: "F",
    comunidad: "Aldea Chuicacá, Totonicapán",
    alergias: ["Penicilina"],
    condiciones_cronicas: ["Hipertensión arterial"],
  },
  {
    id: "juana",
    dpi_cui: "3012456780801",
    nombre: "Juana Catarina Tzoc Pu",
    fecha_nacimiento: "2002-01-19",
    sexo: "F",
    comunidad: "Cantón Juchanep, Totonicapán",
    alergias: [],
    condiciones_cronicas: ["Embarazo en curso · 2.ª gesta · fecha probable de parto 20/12/2026"],
  },
  {
    id: "mateo",
    dpi_cui: "2987654320801",
    nombre: "Mateo Batz Tzul",
    fecha_nacimiento: "2024-03-10",
    sexo: "M",
    comunidad: "Aldea Chuicacá, Totonicapán",
    alergias: [],
    condiciones_cronicas: [],
  },
  {
    id: "francisco",
    dpi_cui: "1876543210901",
    nombre: "Francisco Ajpacajá Chox",
    fecha_nacimiento: "1966-09-02",
    sexo: "M",
    comunidad: "Paraje Xecanchavox, Totonicapán",
    alergias: ["Sulfas"],
    condiciones_cronicas: ["Diabetes mellitus tipo 2", "Hipertensión arterial"],
  },
];

type C = Omit<Consulta, "creado_en" | "confirmado_por" | "archivos_originales" | "paciente_id" | "vacunas" | "medicamentos" | "fila_original" | "archivo_original_url" | "fuente_detalle"> & Partial<Consulta> & { paciente_id: string };

const fila = (o: Record<string, string>) => o;

const BASE: C[] = [
  // ---------------- Rosa ----------------
  { id: "r1", paciente_id: "rosa", centro_id: "chuicaca", fecha: "2012-02-03", motivo: "Dolor de cabeza y mareo", diagnostico: "Cefalea tensional · presión arterial elevada (150/95)", tratamiento: "Acetaminofén 500 mg c/8h por 3 días. Control en 1 mes.", origen: "foto", fuente_detalle: "Ficha en papel · 2012", archivo_original_url: "/demo/ficha-rosa-2012.jpg", medicamentos: ["Acetaminofén 500 mg c/8h"] },
  { id: "r2", paciente_id: "rosa", centro_id: "chuicaca", fecha: "2014-09-22", motivo: "Ronchas y picazón en todo el cuerpo después de una inyección", diagnostico: "Reacción alérgica a penicilina benzatínica", tratamiento: "Loratadina 10 mg c/día por 5 días. No volver a aplicar penicilina.", origen: "foto", fuente_detalle: "Ficha en papel · 2014", archivo_original_url: "/demo/ficha-rosa-2014.jpg", medicamentos: ["Loratadina 10 mg c/día"] },
  { id: "r3", paciente_id: "rosa", centro_id: "chuicaca", fecha: "2015-06-10", motivo: "Control de presión arterial", diagnostico: "Hipertensión arterial", tratamiento: "Inicia enalapril 10 mg c/día. Dieta baja en sal.", origen: "sistema_antiguo", fuente_detalle: "Excel 2015", medicamentos: ["Enalapril 10 mg c/día"], fila_original: fila({ "No.": "0214", "NOMBRE_PAC": "TZUL BATZ ROSA ELENA", "No. DPI": "2456-78901-0801", "FEC_NAC": "15/04/68", "FECHA CONSULTA": "10/06/15", "MOTIVO": "CONTROL P/A", "DX": "HTA", "TX / MEDICAMENTO": "ENALAPRIL 10MG C/DIA", "ALERGIAS": "PNC" }) },
  { id: "r4", paciente_id: "rosa", centro_id: "chuicaca", fecha: "2016-03-25", motivo: "Ardor al orinar", diagnostico: "Infección urinaria", tratamiento: "Nitrofurantoína 100 mg c/12h por 7 días (alérgica a PNC).", origen: "sistema_antiguo", fuente_detalle: "Excel 2016", medicamentos: ["Nitrofurantoína 100 mg c/12h"], fila_original: fila({ "No.": "0388", "NOMBRE_PAC": "ROSA TZUL", "No. DPI": "2456789010801", "FEC_NAC": "", "FECHA CONSULTA": "03/25/2016", "MOTIVO": "ARDOR AL ORINAR", "DX": "IVU", "TX / MEDICAMENTO": "NITROFURANTOINA 100MG C/12H X 7D", "ALERGIAS": "penicilina" }) },
  { id: "r5", paciente_id: "rosa", centro_id: "chuicaca", fecha: "2018-11-05", motivo: "Control de presión arterial", diagnostico: "Hipertensión arterial controlada (130/85)", tratamiento: "Continuar enalapril 10 mg c/día.", origen: "sistema_antiguo", fuente_detalle: "Excel 2018", medicamentos: ["Enalapril 10 mg c/día"], fila_original: fila({ "No.": "0702", "NOMBRE_PAC": "TZUL BATZ ROSA E.", "No. DPI": "2456 78901 0801", "FEC_NAC": "15-4-1968", "FECHA CONSULTA": "5/11/18", "MOTIVO": "CONTROL HTA", "DX": "HTA CONTROLADA", "TX / MEDICAMENTO": "ENALAPRIL", "ALERGIAS": "N/A" }) },
  { id: "r6", paciente_id: "rosa", centro_id: "chuicaca", fecha: "2021-08-17", motivo: "Vacunación", diagnostico: "Persona sana", tratamiento: "Vacuna COVID-19, primera dosis.", origen: "sistema_antiguo", fuente_detalle: "Excel 2021", vacunas: ["COVID-19 (1.ª dosis)"], fila_original: fila({ "No.": "1130", "NOMBRE_PAC": "TZUL BATZ ROSA ELENA", "No. DPI": "2456789010801", "FEC_NAC": "15/04/1968", "FECHA CONSULTA": "17/08/2021", "MOTIVO": "VACUNACION", "DX": "", "VACUNA": "COVID 1RA", "ALERGIAS": "PNC" }) },
  { id: "r7", paciente_id: "rosa", centro_id: "chuicaca", fecha: "2022-05-30", motivo: "Dolor de estómago y agruras", diagnostico: "Gastritis aguda", tratamiento: "Omeprazol 20 mg c/día por 14 días.", origen: "sistema_antiguo", fuente_detalle: "Excel 2022", medicamentos: ["Omeprazol 20 mg c/día"], fila_original: fila({ "No.": "1291", "NOMBRE_PAC": "ROSA ELENA TZUL", "No. DPI": "", "FEC_NAC": "15/04/68", "FECHA CONSULTA": "30/05/22", "MOTIVO": "DOLOR ESTOMAGO, AGRURAS", "DX": "GASTRITIS", "TX / MEDICAMENTO": "OMEPRAZOL 20MG", "ALERGIAS": "" }) },
  { id: "r8", paciente_id: "rosa", centro_id: "chuicaca", fecha: "2024-08-14", motivo: "Dolor de garganta y fiebre por 3 días", diagnostico: "Faringoamigdalitis aguda", tratamiento: "Azitromicina 500 mg c/día por 3 días. Acetaminofén 500 mg c/8h si hay fiebre. Continuar enalapril.", origen: "foto", fuente_detalle: "Ficha en papel · 2024", archivo_original_url: "/demo/ficha-rosa-2024.jpg", medicamentos: ["Azitromicina 500 mg c/día", "Acetaminofén 500 mg c/8h"] },
  { id: "r9", paciente_id: "rosa", centro_id: "hrq", fecha: "2026-03-12", motivo: "Control de hipertensión, referida por el puesto", diagnostico: "Hipertensión arterial controlada (128/82)", tratamiento: "Continuar enalapril 10 mg c/día. Control en 6 meses en su puesto.", origen: "digital", fuente_detalle: "Registro digital", medicamentos: ["Enalapril 10 mg c/día"] },

  // ---------------- Juana (embarazo) ----------------
  { id: "j1", paciente_id: "juana", centro_id: "chuicaca", fecha: "2022-07-04", motivo: "Control prenatal (1.er embarazo)", diagnostico: "Embarazo de 30 semanas sin complicaciones", tratamiento: "Sulfato ferroso 300 mg c/día.", origen: "sistema_antiguo", fuente_detalle: "Excel 2022", medicamentos: ["Sulfato ferroso 300 mg c/día"], fila_original: fila({ "No.": "1305", "NOMBRE_PAC": "JUANA CATARINA TZOC", "No. DPI": "3012 45678 0801", "FEC_NAC": "19/01/02", "FECHA CONSULTA": "04/07/22", "MOTIVO": "CONTROL PRENATAL", "DX": "EMB 30 SEM", "TX / MEDICAMENTO": "SFF", "ALERGIAS": "NINGUNA" }) },
  { id: "j2", paciente_id: "juana", centro_id: "chuicaca", fecha: "2026-06-10", motivo: "Primer control prenatal · 12 semanas", diagnostico: "Embarazo de 12 semanas · 2.ª gesta, 1 parto", tratamiento: "Ácido fólico 5 mg c/día. Sulfato ferroso 300 mg c/día. Td primera dosis.", origen: "foto", fuente_detalle: "Ficha en papel · 2026", archivo_original_url: "/demo/ficha-juana-prenatal.jpg", medicamentos: ["Ácido fólico 5 mg c/día", "Sulfato ferroso 300 mg c/día"], vacunas: ["Td (1.ª dosis)"] },
  { id: "j3", paciente_id: "juana", centro_id: "chuicaca", fecha: "2026-08-12", motivo: "Control prenatal · 21 semanas", diagnostico: "Embarazo normal · presión 110/70 · latido fetal presente", tratamiento: "Continuar ácido fólico y sulfato ferroso. Td segunda dosis.", origen: "digital", fuente_detalle: "Registro digital", medicamentos: ["Ácido fólico 5 mg c/día", "Sulfato ferroso 300 mg c/día"], vacunas: ["Td (2.ª dosis)"] },
  { id: "j4", paciente_id: "juana", centro_id: "chuicaca", fecha: "2026-10-14", motivo: "Control prenatal · 30 semanas", diagnostico: "Embarazo normal · altura uterina 29 cm · presión 112/72", tratamiento: "Continuar suplementos. Plan de parto en Hospital Regional.", origen: "digital", fuente_detalle: "Registro digital", medicamentos: ["Ácido fólico 5 mg c/día", "Sulfato ferroso 300 mg c/día"] },

  // ---------------- Mateo (vacunas) ----------------
  { id: "m1", paciente_id: "mateo", centro_id: "chuicaca", fecha: "2024-03-11", motivo: "Recién nacido · primera visita", diagnostico: "Recién nacido sano · 3.1 kg", tratamiento: "Lactancia materna exclusiva.", origen: "foto", fuente_detalle: "Carné de vacunas · 2024", archivo_original_url: "/demo/carne-mateo-2024.jpg", vacunas: ["BCG", "Hepatitis B (nacimiento)"] },
  { id: "m2", paciente_id: "mateo", centro_id: "chuicaca", fecha: "2024-05-10", motivo: "Vacunas de 2 meses", diagnostico: "Niño sano · 5.4 kg", tratamiento: "—", origen: "sistema_antiguo", fuente_detalle: "Excel 2024", vacunas: ["Pentavalente (1.ª)", "Polio (1.ª)", "Rotavirus (1.ª)", "Neumococo (1.ª)"], fila_original: fila({ "No.": "1544", "NOMBRE_PAC": "MATEO BATZ TZUL", "No. DPI": "2987654320801", "FEC_NAC": "10/03/24", "FECHA CONSULTA": "10/05/24", "MOTIVO": "VACUNAS 2M", "VACUNA": "PENTA1 / POLIO1 / ROTA1 / NEUMO1" }) },
  { id: "m3", paciente_id: "mateo", centro_id: "chuicaca", fecha: "2024-07-12", motivo: "Vacunas de 4 meses", diagnostico: "Niño sano · 6.9 kg", tratamiento: "—", origen: "sistema_antiguo", fuente_detalle: "Excel 2024", vacunas: ["Pentavalente (2.ª)", "Polio (2.ª)", "Rotavirus (2.ª)", "Neumococo (2.ª)"], fila_original: fila({ "No.": "1601", "NOMBRE_PAC": "MATEO BATZ", "No. DPI": "", "FEC_NAC": "10-3-2024", "FECHA CONSULTA": "12/7/24", "MOTIVO": "VAC 4 MESES", "VACUNA": "PENTA 2, POLIO 2, ROTA 2, NEUMO 2" }) },
  { id: "m4", paciente_id: "mateo", centro_id: "chuicaca", fecha: "2024-09-13", motivo: "Vacunas de 6 meses", diagnostico: "Niño sano · 7.8 kg", tratamiento: "Inicia alimentación complementaria.", origen: "digital", fuente_detalle: "Registro digital", vacunas: ["Pentavalente (3.ª)", "Polio (3.ª)"] },
  { id: "m5", paciente_id: "mateo", centro_id: "chuicaca", fecha: "2025-03-14", motivo: "Vacunas de 12 meses", diagnostico: "Niño sano · 9.6 kg", tratamiento: "—", origen: "digital", fuente_detalle: "Registro digital", vacunas: ["SPR (1.ª)", "Neumococo (refuerzo)"] },
  { id: "m6", paciente_id: "mateo", centro_id: "chuicaca", fecha: "2025-09-12", motivo: "Vacunas de 18 meses", diagnostico: "Niño sano · 10.8 kg", tratamiento: "—", origen: "digital", fuente_detalle: "Registro digital", vacunas: ["DPT (1.er refuerzo)", "Polio (1.er refuerzo)", "SPR (2.ª)"] },

  // ---------------- Francisco (diabetes) ----------------
  { id: "f1", paciente_id: "francisco", centro_id: "chuicaca", fecha: "2016-10-03", motivo: "Mucha sed y orina frecuente", diagnostico: "Diabetes mellitus tipo 2 (glucosa 260 mg/dl)", tratamiento: "Inicia metformina 850 mg c/12h. Plan de alimentación.", origen: "sistema_antiguo", fuente_detalle: "Excel 2016", medicamentos: ["Metformina 850 mg c/12h"], fila_original: fila({ "No.": "0451", "NOMBRE_PAC": "AJPACAJA CHOX FRANCISCO", "No. DPI": "1876-54321-0901", "FEC_NAC": "02/09/66", "FECHA CONSULTA": "03/10/16", "MOTIVO": "POLIDIPSIA POLIURIA", "DX": "DM2", "TX / MEDICAMENTO": "METFORMINA 850 C/12H", "ALERGIAS": "SULFAS" }) },
  { id: "f2", paciente_id: "francisco", centro_id: "chuicaca", fecha: "2019-04-22", motivo: "Control de diabetes", diagnostico: "Diabetes tipo 2 · presión 145/92 · hipertensión", tratamiento: "Metformina 850 mg c/12h. Agrega enalapril 10 mg c/día.", origen: "sistema_antiguo", fuente_detalle: "Excel 2019", medicamentos: ["Metformina 850 mg c/12h", "Enalapril 10 mg c/día"], fila_original: fila({ "No.": "0897", "NOMBRE_PAC": "FRANCISCO AJPACAJA", "No. DPI": "1876543210901", "FEC_NAC": "", "FECHA CONSULTA": "22/04/2019", "MOTIVO": "CONTROL DM", "DX": "DM2 + HTA", "TX / MEDICAMENTO": "METFORMINA, ENALAPRIL", "ALERGIAS": "sulfas" }) },
  { id: "f3", paciente_id: "francisco", centro_id: "hrq", fecha: "2025-09-08", motivo: "Herida en el pie que no sana", diagnostico: "Pie diabético grado 1 (Wagner)", tratamiento: "Curación diaria en el puesto. Glibenclamida 5 mg c/día. Evitar sulfas (alergia).", origen: "digital", fuente_detalle: "Registro digital", medicamentos: ["Metformina 850 mg c/12h", "Glibenclamida 5 mg c/día", "Enalapril 10 mg c/día"] },
  { id: "f4", paciente_id: "francisco", centro_id: "chuicaca", fecha: "2026-07-20", motivo: "Control de diabetes", diagnostico: "Diabetes tipo 2 · hemoglobina glicosilada 7.8 % · herida cerrada", tratamiento: "Continuar metformina, glibenclamida y enalapril.", origen: "digital", fuente_detalle: "Registro digital", medicamentos: ["Metformina 850 mg c/12h", "Glibenclamida 5 mg c/día", "Enalapril 10 mg c/día"] },
];

export const CONSULTAS: Consulta[] = BASE.map((c) => ({
  vacunas: [],
  medicamentos: [],
  archivos_originales: c.archivo_original_url ? [c.archivo_original_url] : [],
  fila_original: null,
  archivo_original_url: null,
  fuente_detalle: null,
  confirmado_por: "demo",
  creado_en: c.fecha + "T15:00:00Z",
  ...c,
}));

export interface AccesoDemo {
  id: string;
  paciente_id: string;
  usuario: string;
  rol: "puesto" | "hospital";
  centro_id: string;
  fecha_hora: string;
}

export const ACCESOS: AccesoDemo[] = [
  { id: "a1", paciente_id: "rosa", usuario: "Dra. Lucía Coyoy", rol: "hospital", centro_id: "hrq", fecha_hora: "2026-03-12T16:20:00Z" },
  { id: "a2", paciente_id: "rosa", usuario: "Marta Pú", rol: "puesto", centro_id: "chuicaca", fecha_hora: "2026-11-21T14:05:00Z" },
  { id: "a3", paciente_id: "francisco", usuario: "Dr. Andrés Xicará", rol: "hospital", centro_id: "hrq", fecha_hora: "2025-09-08T19:40:00Z" },
  { id: "a4", paciente_id: "juana", usuario: "Marta Pú", rol: "puesto", centro_id: "chuicaca", fecha_hora: "2026-10-14T15:30:00Z" },
];

export function buscarPorDPI(dpi: string) {
  return PACIENTES.find((p) => p.dpi_cui === dpi.replace(/\D/g, "")) ?? null;
}

export function expediente(id: string) {
  const paciente = PACIENTES.find((p) => p.id === id);
  if (!paciente) return null;
  const consultas = CONSULTAS.filter((c) => c.paciente_id === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const accesos = ACCESOS.filter((a) => a.paciente_id === id).sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora));
  return { paciente, consultas, accesos };
}

/** Medicamentos de las consultas del último año (los más recientes primero, sin repetir). */
export function medicamentosActuales(consultas: Consulta[], hoy = new Date()): string[] {
  const limite = new Date(hoy.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const c of consultas.filter((c) => c.fecha >= limite)) {
    for (const m of c.medicamentos) {
      const k = m.toLowerCase().split(" ")[0];
      if (!vistos.has(k)) {
        vistos.add(k);
        salida.push(m);
      }
    }
  }
  return salida;
}

export const CONTADORES_PUESTO = { hoy: 14, total: 1287, pendientes: 0 };

export const RECIENTES_PUESTO = [
  { nombre: "Rosa Elena Tzul Batz", detalle: "Ficha de consulta · 2024", origen: "foto" as const, hora: "10:42" },
  { nombre: "Registro del puesto 2015–2022", detalle: "312 consultas · Excel", origen: "sistema_antiguo" as const, hora: "09:58" },
  { nombre: "Mateo Batz Tzul", detalle: "Carné de vacunas · 2024", origen: "foto" as const, hora: "09:15" },
];

/**
 * Genera public/ejemplos/registro_puesto_2015_2022.csv: un "Excel viejo" del puesto,
 * con datos inventados y desordenados (fechas mezcladas, MAYÚSCULAS, celdas vacías).
 */
import fs from "node:fs";
import path from "node:path";

let s = 20150101;
const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
const de = <T,>(a: T[]) => a[Math.floor(r() * a.length)];

const NOMBRES_F = ["MARIA", "JUANA", "ANA", "CATARINA", "MANUELA", "PETRONA", "TOMASA", "ROSARIO", "FRANCISCA", "ELENA", "LUCIA", "MARTA"];
const NOMBRES_M = ["JUAN", "JOSE", "PEDRO", "DIEGO", "MIGUEL", "SANTOS", "TOMAS", "MANUEL", "FRANCISCO", "ANDRES", "LUIS", "MARCOS"];
const APELLIDOS = ["TZUL", "BATZ", "IXCOY", "PU", "TAX", "CHOX", "AJPACAJA", "TZOC", "COYOY", "XICARA", "SAPON", "CUX", "VASQUEZ", "GARCIA", "LOPEZ", "TZUNUN", "CHAN", "YAX"];
const COMUNIDADES = ["ALDEA CHUICACA", "Chuicacá", "CANTON JUCHANEP", "PARAJE XECANCHAVOX", "aldea chuicaca", "PARAJE PACHUN", "CHUICACA, TOTO"];
const CASOS = [
  ["FIEBRE Y TOS", "IRA", "ACETAMINOFEN 500MG C/8H"],
  ["DIARREA 2 DIAS", "EDA SIN DESHIDRATACION", "SRO, ZINC"],
  ["DOLOR DE CABEZA", "CEFALEA", "ACETAMINOFEN"],
  ["CONTROL P/A", "HTA", "ENALAPRIL 10MG C/DIA"],
  ["ARDOR AL ORINAR", "IVU", "NITROFURANTOINA 100MG C/12H"],
  ["DOLOR ESTOMAGO", "GASTRITIS", "OMEPRAZOL 20MG"],
  ["CONTROL NIÑO SANO", "NIÑO SANO", ""],
  ["VACUNACION", "", ""],
  ["GRANOS EN LA PIEL", "PIODERMITIS", "DICLOXACILINA 500MG C/6H"],
  ["DOLOR DE ESPALDA", "LUMBALGIA", "IBUPROFENO 400MG C/8H"],
  ["TOS MAS DE 15 DIAS", "SINTOMATICO RESPIRATORIO", "REFERIDO A BACILOSCOPIA"],
  ["CONTROL PRENATAL", "EMBARAZO", "SFF / ACIDO FOLICO"],
];
const VACUNAS = ["", "", "", "TD", "INFLUENZA", "COVID 1RA", "COVID 2DA", "SPR"];
const ALERGIAS = ["", "", "", "", "NINGUNA", "N/A", "PNC", "SULFAS", "no refiere", "-"];

const fmtFecha = (d: Date) => {
  const dd = d.getDate(), mm = d.getMonth() + 1, a = d.getFullYear();
  const p2 = (n: number) => String(n).padStart(2, "0");
  return de([
    `${p2(dd)}/${p2(mm)}/${String(a).slice(2)}`,
    `${dd}/${mm}/${a}`,
    `${p2(dd)}-${p2(mm)}-${a}`,
    `${a}-${p2(mm)}-${p2(dd)}`,
    `${p2(dd)}/${p2(mm)}/${a}`,
    dd > 12 ? `${p2(mm)}/${p2(dd)}/${a}` : `${p2(dd)}/${p2(mm)}/${a}`, // Excel en inglés
  ]);
};
const fmtDPI = (d: string) => de([d, `${d.slice(0, 4)} ${d.slice(4, 9)} ${d.slice(9)}`, `${d.slice(0, 4)}-${d.slice(4, 9)}-${d.slice(9)}`, d, ""]);
const fecha = (desde: number, hasta: number) => new Date(desde + r() * (hasta - desde));

const COLS = ["No.", "FECHA CONSULTA", "NOMBRE_PAC", "No. DPI", "FEC_NAC", "SEXO", "COMUNIDAD", "MOTIVO", "DX", "TX / MEDICAMENTO", "VACUNA", "ALERGIAS", "ANT. PATOLOGICOS", "OBSERVACIONES"];
const filas: Record<string, string>[] = [];

// Pacientes del demo (coinciden con las fichas en papel y el expediente)
const FIJAS: Record<string, string>[] = [
  { "FECHA CONSULTA": "10/06/15", NOMBRE_PAC: "TZUL BATZ ROSA ELENA", "No. DPI": "2456-78901-0801", FEC_NAC: "15/04/68", SEXO: "F", COMUNIDAD: "ALDEA CHUICACA", MOTIVO: "CONTROL P/A", DX: "HTA", "TX / MEDICAMENTO": "ENALAPRIL 10MG C/DIA", ALERGIAS: "PNC", "ANT. PATOLOGICOS": "HTA" },
  { "FECHA CONSULTA": "03/25/2016", NOMBRE_PAC: "ROSA TZUL", "No. DPI": "2456789010801", FEC_NAC: "", SEXO: "FEM", COMUNIDAD: "Chuicacá", MOTIVO: "ARDOR AL ORINAR", DX: "IVU", "TX / MEDICAMENTO": "NITROFURANTOINA 100MG C/12H X 7D", ALERGIAS: "penicilina", OBSERVACIONES: "NO DAR PNC" },
  { "FECHA CONSULTA": "5/11/18", NOMBRE_PAC: "TZUL BATZ ROSA E.", "No. DPI": "2456 78901 0801", FEC_NAC: "15-4-1968", SEXO: "F", COMUNIDAD: "", MOTIVO: "CONTROL HTA", DX: "HTA CONTROLADA", "TX / MEDICAMENTO": "ENALAPRIL", ALERGIAS: "N/A", "ANT. PATOLOGICOS": "hipertension" },
  { "FECHA CONSULTA": "17/08/2021", NOMBRE_PAC: "TZUL BATZ ROSA ELENA", "No. DPI": "2456789010801", FEC_NAC: "15/04/1968", SEXO: "F", COMUNIDAD: "ALDEA CHUICACA", MOTIVO: "VACUNACION", DX: "", VACUNA: "COVID 1RA", ALERGIAS: "PNC" },
  { "FECHA CONSULTA": "30/05/22", NOMBRE_PAC: "ROSA ELENA TZUL", "No. DPI": "", FEC_NAC: "15/04/68", SEXO: "F", COMUNIDAD: "ALDEA CHUICACA", MOTIVO: "DOLOR ESTOMAGO, AGRURAS", DX: "GASTRITIS", "TX / MEDICAMENTO": "OMEPRAZOL 20MG", ALERGIAS: "" },
  { "FECHA CONSULTA": "04/07/22", NOMBRE_PAC: "JUANA CATARINA TZOC", "No. DPI": "3012 45678 0801", FEC_NAC: "19/01/02", SEXO: "F", COMUNIDAD: "CANTON JUCHANEP", MOTIVO: "CONTROL PRENATAL", DX: "EMB 30 SEM", "TX / MEDICAMENTO": "SFF", ALERGIAS: "NINGUNA" },
  { "FECHA CONSULTA": "03/10/16", NOMBRE_PAC: "AJPACAJA CHOX FRANCISCO", "No. DPI": "1876-54321-0901", FEC_NAC: "02/09/66", SEXO: "M", COMUNIDAD: "PARAJE XECANCHAVOX", MOTIVO: "POLIDIPSIA POLIURIA", DX: "DM2", "TX / MEDICAMENTO": "METFORMINA 850 C/12H", ALERGIAS: "SULFAS", "ANT. PATOLOGICOS": "DM2" },
  { "FECHA CONSULTA": "22/04/2019", NOMBRE_PAC: "FRANCISCO AJPACAJA", "No. DPI": "1876543210901", FEC_NAC: "", SEXO: "MASC", COMUNIDAD: "", MOTIVO: "CONTROL DM", DX: "DM2 + HTA", "TX / MEDICAMENTO": "METFORMINA, ENALAPRIL", ALERGIAS: "sulfas", "ANT. PATOLOGICOS": "DM2, HTA" },
];
filas.push(...FIJAS);

// Relleno: 79 pacientes más con 2 a 6 consultas cada uno (2015–2022)
const desde = new Date(2015, 0, 5).getTime(), hasta = new Date(2022, 11, 20).getTime();
let objetivo = 312 - FIJAS.length;
const pacientes = 84;
for (let i = 0; i < pacientes && objetivo > 0; i++) {
  const sexo = r() < 0.55 ? "F" : "M";
  const nombre = `${de(APELLIDOS)} ${de(APELLIDOS)} ${de(sexo === "F" ? NOMBRES_F : NOMBRES_M)}${r() < 0.4 ? " " + de(sexo === "F" ? NOMBRES_F : NOMBRES_M) : ""}`;
  const nac = fecha(new Date(1950, 0, 1).getTime(), new Date(2020, 0, 1).getTime());
  const conDPI = r() < 0.8;
  const dpi = String(1000 + Math.floor(r() * 8999)) + String(10000 + Math.floor(r() * 89999)) + de(["0801", "0802", "0803", "0901"]);
  const comunidad = de(COMUNIDADES);
  const alergia = de(ALERGIAS);
  const n = i === pacientes - 1 ? objetivo : Math.min(objetivo, 2 + Math.floor(r() * 4));
  for (let k = 0; k < n; k++) {
    const [motivo, dx, tx] = de(CASOS);
    filas.push({
      "FECHA CONSULTA": r() < 0.03 ? "??/??/17" : fmtFecha(fecha(desde, hasta)),
      NOMBRE_PAC: r() < 0.25 ? nombre.toLowerCase() : nombre,
      "No. DPI": conDPI ? fmtDPI(dpi) : "",
      FEC_NAC: r() < 0.15 ? "" : fmtFecha(nac),
      SEXO: r() < 0.1 ? "" : de(sexo === "F" ? ["F", "F", "FEM", "f"] : ["M", "M", "MASC", "m"]),
      COMUNIDAD: r() < 0.15 ? "" : comunidad,
      MOTIVO: motivo,
      DX: dx,
      "TX / MEDICAMENTO": tx,
      VACUNA: de(VACUNAS),
      ALERGIAS: alergia,
      "ANT. PATOLOGICOS": dx === "HTA" ? "HTA" : "",
      OBSERVACIONES: r() < 0.08 ? de(["REFERIDO", "NO TRAJO CARNE", "VOLVER EN 1 MES", "pendiente lab"]) : "",
    });
  }
  objetivo -= n;
}

// orden "de sistema viejo": por número correlativo, no por fecha
filas.sort(() => r() - 0.5);
const csv = [COLS.join(","), ...filas.map((f, i) => COLS.map((c) => {
  const v = c === "No." ? String(i + 1).padStart(4, "0") : (f[c] ?? "");
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}).join(","))].join("\r\n");

const destino = path.join(process.cwd(), "public/ejemplos/registro_puesto_2015_2022.csv");
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, "﻿" + csv, "utf8");
console.log(`✓ ${filas.length} filas → ${path.relative(process.cwd(), destino)}`);

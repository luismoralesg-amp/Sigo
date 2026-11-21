/**
 * Genera fotos simuladas de fichas en papel (escritas "a mano") para el demo.
 * Todo es inventado. Uso: npm run fichas:generar
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SALIDA = path.join(process.cwd(), "public/demo");
fs.mkdirSync(SALIDA, { recursive: true });

type Linea = { etiqueta: string; valor: string; x?: number; ancho?: number; rojo?: boolean; tam?: number };
type Fila = Linea[];
interface Ficha {
  archivo: string;
  titulo: string;
  subtitulo?: string;
  numero: string;
  filas: Array<Fila | { seccion: string } | { parrafo: string; etiqueta: string; lineas?: number; rojo?: boolean }>;
  firma: string;
  semilla: number;
  rotacion: number;
  mancha?: boolean;
  tinta?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function azar(semilla: number) {
  let s = semilla;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function render(f: Ficha): string {
  const W = 1100, H = 1500;
  const r = azar(f.semilla);
  const tinta = f.tinta ?? "#1f3a8a";
  const mano = (x: number, y: number, t: string, tam = 34, color = tinta) => {
    // cada palabra con pequeña rotación y desplazamiento, como letra a mano
    let cx = x;
    return t
      .split(" ")
      .map((p) => {
        const rot = (r() - 0.5) * 3;
        const dy = (r() - 0.5) * 4;
        const el = `<text x="${cx.toFixed(1)}" y="${(y + dy).toFixed(1)}" font-family="Bradley Hand" font-weight="bold" font-size="${tam}" fill="${color}" opacity="${0.86 + r() * 0.12}" transform="rotate(${rot.toFixed(2)} ${cx.toFixed(1)} ${y})">${esc(p)}</text>`;
        cx += p.length * tam * 0.5 + tam * 0.34;
        return el;
      })
      .join("");
  };
  const impreso = (x: number, y: number, t: string, tam = 19, peso = "normal") =>
    `<text x="${x}" y="${y}" font-family="Courier New" font-weight="${peso}" font-size="${tam}" fill="#2b2b2b">${esc(t)}</text>`;

  let y = 230;
  const partes: string[] = [];
  for (const fila of f.filas) {
    if ("seccion" in fila) {
      y += 18;
      partes.push(`<rect x="70" y="${y - 26}" width="${W - 140}" height="34" fill="#2b2b2b" opacity=".08"/>`);
      partes.push(impreso(82, y - 2, fila.seccion, 20, "bold"));
      y += 58;
      continue;
    }
    if ("parrafo" in fila) {
      partes.push(impreso(80, y, fila.etiqueta));
      const lineas = fila.lineas ?? 2;
      for (let i = 0; i < lineas; i++) partes.push(`<line x1="80" y1="${y + 18 + i * 50}" x2="${W - 80}" y2="${y + 18 + i * 50}" stroke="#2b2b2b" stroke-width="1" opacity=".45"/>`);
      // ajustar texto a líneas
      const palabras = fila.parrafo.split(" ");
      let linea = "", li = 0;
      const maxChars = 58;
      const lineasTxt: string[] = [];
      for (const p of palabras) {
        if ((linea + " " + p).trim().length > maxChars) {
          lineasTxt.push(linea.trim());
          linea = p;
        } else linea += " " + p;
      }
      lineasTxt.push(linea.trim());
      for (const t of lineasTxt) {
        partes.push(mano(li === 0 ? 80 + fila.etiqueta.length * 11.6 + 10 : 90, y + 8 + li * 50, t, 31, fila.rojo ? "#b3261e" : tinta));
        li++;
      }
      y += Math.max(lineas, lineasTxt.length) * 50 + 30;
      continue;
    }
    let x = 80;
    for (const c of fila) {
      const ancho = c.ancho ?? W - 160;
      const xx = c.x ?? x;
      partes.push(impreso(xx, y, c.etiqueta));
      const xl = xx + c.etiqueta.length * 11.6 + 8;
      partes.push(`<line x1="${xl}" y1="${y + 6}" x2="${xx + ancho - 20}" y2="${y + 6}" stroke="#2b2b2b" stroke-width="1" opacity=".45"/>`);
      partes.push(mano(xl + 6, y - 4, c.valor, c.tam ?? 33, c.rojo ? "#b3261e" : tinta));
      x = xx + ancho;
    }
    y += 70;
  }

  const firmaY = H - 150;
  const papel = `
    <g transform="rotate(${f.rotacion} ${W / 2} ${H / 2})" filter="url(#sombra)">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#f1e8d3"/>
      <rect x="0" y="0" width="${W}" height="${H}" filter="url(#grano)" opacity=".55"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#amarillento)"/>
      <line x1="0" y1="${H * 0.52}" x2="${W}" y2="${H * 0.5}" stroke="#bfae8a" stroke-width="2" opacity=".5"/>
      ${f.mancha ? `<circle cx="${W - 230}" cy="${H - 330}" r="70" fill="none" stroke="#a7834f" stroke-width="9" opacity=".18"/><circle cx="${W - 226}" cy="${H - 326}" r="58" fill="#a7834f" opacity=".05"/>` : ""}
      ${impreso(80, 92, f.titulo, 24, "bold")}
      ${f.subtitulo ? impreso(80, 124, f.subtitulo, 18) : ""}
      ${impreso(W - 330, 92, "No. ficha:", 18)}
      ${mano(W - 205, 92, f.numero, 32)}
      <line x1="70" y1="150" x2="${W - 70}" y2="150" stroke="#2b2b2b" stroke-width="2.5" opacity=".7"/>
      <line x1="70" y1="156" x2="${W - 70}" y2="156" stroke="#2b2b2b" stroke-width="1" opacity=".6"/>
      ${partes.join("\n")}
      <line x1="${W - 470}" y1="${firmaY}" x2="${W - 90}" y2="${firmaY}" stroke="#2b2b2b" stroke-width="1" opacity=".6"/>
      ${impreso(W - 440, firmaY + 30, "Firma y sello")}
      ${mano(W - 450, firmaY - 14, f.firma, 36)}
      <circle cx="${W - 610}" cy="${firmaY - 20}" r="62" fill="none" stroke="#5b3f9e" stroke-width="4" opacity=".38"/>
      <text x="${W - 610}" y="${firmaY - 14}" text-anchor="middle" font-family="Courier New" font-size="15" font-weight="bold" fill="#5b3f9e" opacity=".45">PUESTO DE SALUD</text>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="1700" viewBox="-100 -100 1300 1700">
    <defs>
      <filter id="grano"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="${f.semilla}"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .36  0 0 0 0 .2  0 0 0 .35 0"/></filter>
      <filter id="sombra" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="6" dy="14" stdDeviation="14" flood-color="#000" flood-opacity=".45"/></filter>
      <linearGradient id="amarillento" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".7" stop-color="#c9a96a" stop-opacity=".05"/><stop offset="1" stop-color="#8a6a33" stop-opacity=".22"/></linearGradient>
      <radialGradient id="luz" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient>
      <linearGradient id="mesa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b5440"/><stop offset="1" stop-color="#3e3024"/></linearGradient>
    </defs>
    <rect x="-100" y="-100" width="1300" height="1700" fill="url(#mesa)"/>
    ${papel}
    <rect x="-100" y="-100" width="1300" height="1700" fill="url(#luz)"/>
  </svg>`;
}

const CENTRO = "PUESTO DE SALUD ALDEA CHUICACÁ";
const SUB = "Totonicapán · Consulta externa";

const FICHAS: Ficha[] = [
  {
    archivo: "ficha-rosa-2024.jpg",
    titulo: CENTRO,
    subtitulo: SUB,
    numero: "0847",
    semilla: 11,
    rotacion: -1.6,
    mancha: true,
    firma: "Enf. M. Pú",
    filas: [
      [{ etiqueta: "Fecha:", valor: "14/08/2024", ancho: 420 }, { etiqueta: "Sexo:", valor: "F", ancho: 200 }, { etiqueta: "F. nac:", valor: "15/4/68", ancho: 320 }],
      [{ etiqueta: "Nombre:", valor: "Rosa Elena Tzul Batz" }],
      [{ etiqueta: "DPI/CUI:", valor: "2456 78901 0801" }],
      [{ etiqueta: "Comunidad:", valor: "Aldea Chuicacá, Totonicapán" }],
      { seccion: "ANTECEDENTES" },
      [{ etiqueta: "Alergias:", valor: "PENICILINA (PNC) !!", rojo: true }],
      [{ etiqueta: "Ant. patológicos:", valor: "HTA - enalapril" }],
      { seccion: "CONSULTA" },
      { etiqueta: "Motivo:", parrafo: "dolor de garganta y fiebre x 3 días", lineas: 1 },
      { etiqueta: "Dx:", parrafo: "Faringoamigdalitis aguda", lineas: 1 },
      { etiqueta: "Tx:", parrafo: "Azitromicina 500 mg c/día x 3 días. Acetaminofén 500 mg c/8h si fiebre. Continuar enalapril 10 mg c/día", lineas: 3 },
      [{ etiqueta: "Vacunas:", valor: "" }],
    ],
  },
  {
    archivo: "ficha-rosa-2012.jpg",
    titulo: CENTRO,
    subtitulo: SUB,
    numero: "0112",
    semilla: 23,
    rotacion: 1.2,
    tinta: "#202020",
    firma: "Aux. E. Tax",
    filas: [
      [{ etiqueta: "Fecha:", valor: "03/02/2012", ancho: 420 }, { etiqueta: "Sexo:", valor: "F", ancho: 200 }, { etiqueta: "Edad:", valor: "43 a", ancho: 320 }],
      [{ etiqueta: "Nombre:", valor: "Rosa Tzul Batz" }],
      [{ etiqueta: "Cédula:", valor: "" }],
      [{ etiqueta: "Comunidad:", valor: "Chuicacá" }],
      { seccion: "CONSULTA" },
      { etiqueta: "Motivo:", parrafo: "dolor de cabeza y mareo", lineas: 1 },
      [{ etiqueta: "P/A:", valor: "150/95", ancho: 400 }],
      { etiqueta: "Dx:", parrafo: "Cefalea tensional. P/A elevada, control en 1 mes", lineas: 2 },
      { etiqueta: "Tx:", parrafo: "Acetaminofén 500 mg c/8h x 3 días", lineas: 2 },
    ],
  },
  {
    archivo: "ficha-rosa-2014.jpg",
    titulo: CENTRO,
    subtitulo: SUB,
    numero: "0390",
    semilla: 37,
    rotacion: -0.8,
    mancha: true,
    firma: "Dr. J. Ixcoy",
    filas: [
      [{ etiqueta: "Fecha:", valor: "22/09/2014", ancho: 420 }, { etiqueta: "Sexo:", valor: "F", ancho: 200 }, { etiqueta: "F. nac:", valor: "15-04-1968", ancho: 320 }],
      [{ etiqueta: "Nombre:", valor: "Rosa Elena Tzul" }],
      [{ etiqueta: "DPI:", valor: "2456 78901 0801" }],
      { seccion: "CONSULTA" },
      { etiqueta: "Motivo:", parrafo: "ronchas y picazón en todo el cuerpo después de inyección", lineas: 2 },
      { etiqueta: "Dx:", parrafo: "Reacción alérgica a penicilina benzatínica", lineas: 1, rojo: true },
      { etiqueta: "Tx:", parrafo: "Loratadina 10 mg c/día x 5 días. NO volver a dar PNC", lineas: 2, rojo: true },
      [{ etiqueta: "Alergias:", valor: "PENICILINA", rojo: true }],
    ],
  },
  {
    archivo: "ficha-juana-prenatal.jpg",
    titulo: CENTRO,
    subtitulo: "Control prenatal",
    numero: "1021",
    semilla: 41,
    rotacion: 1.4,
    firma: "Enf. M. Pú",
    filas: [
      [{ etiqueta: "Fecha:", valor: "10/06/2026", ancho: 420 }, { etiqueta: "Edad:", valor: "24", ancho: 200 }, { etiqueta: "FUR:", valor: "15/03/26", ancho: 320 }],
      [{ etiqueta: "Nombre:", valor: "Juana Catarina Tzoc Pu" }],
      [{ etiqueta: "DPI:", valor: "3012 45678 0801" }],
      [{ etiqueta: "G:", valor: "2", ancho: 200 }, { etiqueta: "P:", valor: "1", ancho: 200 }, { etiqueta: "Semanas:", valor: "12", ancho: 300 }],
      { etiqueta: "Motivo:", parrafo: "1er control prenatal", lineas: 1 },
      { etiqueta: "Tx:", parrafo: "Ácido fólico 5 mg c/día, sulfato ferroso 300 mg c/día", lineas: 2 },
      [{ etiqueta: "Vacunas:", valor: "Td 1a dosis" }],
    ],
  },
  {
    archivo: "carne-mateo-2024.jpg",
    titulo: CENTRO,
    subtitulo: "Carné de vacunación infantil",
    numero: "N-0233",
    semilla: 53,
    rotacion: -1.1,
    tinta: "#14532d",
    firma: "Enf. M. Pú",
    filas: [
      [{ etiqueta: "Nombre:", valor: "Mateo Batz Tzul" }],
      [{ etiqueta: "F. nac:", valor: "10/03/2024", ancho: 470 }, { etiqueta: "Sexo:", valor: "M", ancho: 200 }, { etiqueta: "Peso:", valor: "3.1 kg", ancho: 270 }],
      [{ etiqueta: "CUI:", valor: "2987 65432 0801" }],
      [{ etiqueta: "Madre:", valor: "Ana Tzul" }],
      { seccion: "VACUNAS" },
      [{ etiqueta: "BCG:", valor: "11/03/24", ancho: 470 }, { etiqueta: "Hep B:", valor: "11/03/24", ancho: 470 }],
      [{ etiqueta: "Penta 1:", valor: "", ancho: 470 }, { etiqueta: "Polio 1:", valor: "", ancho: 470 }],
      [{ etiqueta: "Rota 1:", valor: "", ancho: 470 }, { etiqueta: "Neumo 1:", valor: "", ancho: 470 }],
      { etiqueta: "Obs:", parrafo: "RN sano, lactancia materna exclusiva", lineas: 2 },
    ],
  },
];

async function main() {
  for (const f of FICHAS) {
    const svg = render(f);
    const destino = path.join(SALIDA, f.archivo);
    await sharp(Buffer.from(svg)).resize(1100).jpeg({ quality: 82, mozjpeg: true }).toFile(destino);
    console.log("✓", path.relative(process.cwd(), destino));
  }
}
main();

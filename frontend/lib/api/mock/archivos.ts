/**
 * Archivos de GET /pacientes/{dpi}/exportar para el servidor simulado.
 * Regla 11 del contrato: las notas se escapan y el PDF no carga recursos externos.
 * Sin dependencias: PDF y DOCX se arman a mano (texto plano, Helvetica, ZIP sin compresión).
 */
import type { Expediente } from "@/lib/types";
import { fechaCorta } from "@/lib/utils";

type Linea = { texto: string; tipo?: "titulo" | "subtitulo" };

function lineas(e: Expediente): Linea[] {
  const p = e.paciente;
  const out: Linea[] = [
    { texto: `Historial clínico de ${p.nombre}`, tipo: "titulo" },
    { texto: `Identificador: ${p.dpi}` },
    { texto: `Nacimiento: ${fechaCorta(p.fecha_nacimiento)} · Sexo: ${p.sexo ?? "—"} · Comunidad: ${p.comunidad ?? "—"}` },
    { texto: "" },
    { texto: "Alertas", tipo: "subtitulo" },
    { texto: `Alergias: ${e.alertas.alergias.join(", ") || "ninguna registrada"}` },
    { texto: `Condiciones crónicas: ${e.alertas.condiciones_cronicas.join(", ") || "ninguna registrada"}` },
    { texto: `Medicamentos actuales: ${e.alertas.medicamentos.join(", ") || "ninguno registrado"}` },
    { texto: "" },
    { texto: `Consultas (${e.consultas.length})`, tipo: "subtitulo" },
  ];
  for (const c of e.consultas) {
    out.push({ texto: `${fechaCorta(c.fecha)} · ${c.centro.nombre} · versión ${c.version}` });
    if (c.motivo) out.push({ texto: `  Motivo: ${c.motivo}` });
    if (c.diagnostico) out.push({ texto: `  Diagnóstico: ${c.diagnostico}` });
    if (c.tratamiento) out.push({ texto: `  Tratamiento: ${c.tratamiento}` });
    if (c.vacunas.length) out.push({ texto: `  Vacunas: ${c.vacunas.join(", ")}` });
    out.push({ texto: "" });
  }
  out.push({ texto: "Generado por Sigo. Datos de demostración, todos inventados." });
  return out;
}

const escaparHTML = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const escaparMD = (s: string) => s.replace(/([\\`*_{}[\]()#+\-!|<>])/g, "\\$1");
const escaparXML = escaparHTML;

export function exportarTexto(e: Expediente): string {
  return lineas(e).map((l) => l.texto).join("\n");
}

export function exportarMarkdown(e: Expediente): string {
  return lineas(e)
    .map((l) => (l.tipo === "titulo" ? `# ${escaparMD(l.texto)}` : l.tipo === "subtitulo" ? `\n## ${escaparMD(l.texto)}` : escaparMD(l.texto)))
    .join("\n");
}

export function exportarHTML(e: Expediente): string {
  const cuerpo = lineas(e)
    .map((l) => (l.tipo === "titulo" ? `<h1>${escaparHTML(l.texto)}</h1>` : l.tipo === "subtitulo" ? `<h2>${escaparHTML(l.texto)}</h2>` : l.texto ? `<p>${escaparHTML(l.texto)}</p>` : ""))
    .join("\n");
  // Sin scripts ni recursos externos.
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escaparHTML(e.paciente.nombre)} · Sigo</title><style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1f2b47;background:#fbf9f6}h1,h2{color:#283659}</style></head><body>${cuerpo}</body></html>`;
}

/** Resumen estructurado para sistemas oficiales (MSPAS, X-Road). Simulado en el demo. */
export function exportarJSON(e: Expediente): string {
  return JSON.stringify(
    {
      formato: "sigo-resumen-clinico",
      version: 1,
      simulado: true,
      generado_en: new Date().toISOString(),
      paciente: e.paciente,
      alertas: e.alertas,
      consultas: e.consultas.map(({ id, version, fecha, centro, motivo, diagnostico, tratamiento, vacunas }) => ({ id, version, fecha, centro: centro.nombre, motivo, diagnostico, tratamiento, vacunas })),
    },
    null,
    2
  );
}

// ---------------------------------------------------------------- PDF (texto, Helvetica, WinAnsi)

function aLatin1(s: string): number[] {
  const bytes: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 0xb7) bytes.push(0xb7);
    else if (c < 256) bytes.push(c);
    else if (c === 0x2014 || c === 0x2013) bytes.push(0x2d);
    else bytes.push(0x3f);
  }
  return bytes;
}

function textoPDF(s: string): string {
  return aLatin1(s)
    .map((b) => (b === 0x28 || b === 0x29 || b === 0x5c ? "\\" + String.fromCharCode(b) : b > 126 ? "\\" + b.toString(8).padStart(3, "0") : String.fromCharCode(b)))
    .join("");
}

function partir(texto: string, max: number): string[] {
  if (texto.length <= max) return [texto];
  const out: string[] = [];
  let actual = "";
  for (const palabra of texto.split(" ")) {
    if ((actual + " " + palabra).trim().length > max) {
      out.push(actual);
      actual = "  " + palabra;
    } else actual = (actual + " " + palabra).trimStart();
  }
  if (actual) out.push(actual);
  return out;
}

export function exportarPDF(e: Expediente): Blob {
  const paginas: string[][] = [[]];
  let y = 790;
  for (const l of lineas(e)) {
    const tam = l.tipo === "titulo" ? 16 : l.tipo === "subtitulo" ? 12.5 : 10.5;
    const fuente = l.tipo ? "F2" : "F1";
    for (const parte of partir(l.texto, l.tipo ? 60 : 92)) {
      if (y < 60) {
        paginas.push([]);
        y = 790;
      }
      paginas.at(-1)!.push(`BT /${fuente} ${tam} Tf 50 ${y} Td (${textoPDF(parte)}) Tj ET`);
      y -= tam + 6;
    }
  }

  const objetos: string[] = [];
  const n = paginas.length;
  // 1 catálogo, 2 páginas, 3-4 fuentes, luego (página, contenido) por cada página
  objetos[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objetos[2] = `<< /Type /Pages /Count ${n} /Kids [${paginas.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] >>`;
  objetos[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objetos[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  paginas.forEach((ops, i) => {
    const contenido = ops.join("\n");
    objetos[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
    objetos[6 + i * 2] = `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objetos.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objetos[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objetos.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  // Todo el contenido ya es ASCII (lo no-ASCII va como \ooo), así que length == bytes.
  return new Blob([pdf], { type: "application/pdf" });
}

// ---------------------------------------------------------------- DOCX (ZIP sin compresión)

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of datos) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(archivos: Array<{ nombre: string; contenido: string }>): Blob {
  const cod = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const a of archivos) {
    const nombre = cod.encode(a.nombre);
    const datos = cod.encode(a.contenido);
    const crc = crc32(datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombre.length, true);
    partes.push(new Uint8Array(local.buffer), nombre, datos);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, datos.length, true);
    c.setUint32(24, datos.length, true);
    c.setUint16(28, nombre.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nombre);
    offset += 30 + nombre.length + datos.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)] as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export function exportarDOCX(e: Expediente): Blob {
  const parrafos = lineas(e)
    .map((l) => {
      const estilo = l.tipo === "titulo" ? '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>' : l.tipo === "subtitulo" ? '<w:rPr><w:b/><w:sz w:val="26"/></w:rPr>' : "";
      return `<w:p><w:r>${estilo}<w:t xml:space="preserve">${escaparXML(l.texto)}</w:t></w:r></w:p>`;
    })
    .join("");
  return zip([
    {
      nombre: "[Content_Types].xml",
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      nombre: "_rels/.rels",
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    {
      nombre: "word/document.xml",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parrafos}</w:body></w:document>`,
    },
  ]);
}

export async function exportarXLSX(e: Expediente): Promise<Blob> {
  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();
  const filas = e.consultas.map((c) => ({
    Fecha: c.fecha ?? "",
    Centro: c.centro.nombre,
    Motivo: c.motivo ?? "",
    Diagnóstico: c.diagnostico ?? "",
    Tratamiento: c.tratamiento ?? "",
    Vacunas: c.vacunas.join(", "),
    Versión: c.version,
  }));
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Consultas");
  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.json_to_sheet([
      { Dato: "Nombre", Valor: e.paciente.nombre },
      { Dato: "Identificador", Valor: e.paciente.dpi },
      { Dato: "Alergias", Valor: e.alertas.alergias.join(", ") },
      { Dato: "Condiciones crónicas", Valor: e.alertas.condiciones_cronicas.join(", ") },
    ]),
    "Paciente"
  );
  const datos = XLSX.write(libro, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([datos], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

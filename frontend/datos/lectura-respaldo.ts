import type { LecturaFicha } from "@/lib/ia";

/**
 * Lectura ya procesada de la ficha de Rosa (public/demo/ficha-rosa-2024.jpg).
 * Respaldo para el demo si la API tarda o no hay señal.
 */
export const LECTURA_RESPALDO_ROSA: LecturaFicha = {
  paciente: {
    dpi_cui: { valor: "2456789010801", confianza: "alta" },
    nombre: { valor: "Rosa Elena Tzul Batz", confianza: "alta" },
    fecha_nacimiento: { valor: "1968-04-15", confianza: "media" },
    sexo: { valor: "F", confianza: "alta" },
    comunidad: { valor: "Aldea Chuicacá, Totonicapán", confianza: "alta" },
    alergias: { valor: ["Penicilina"], confianza: "alta" },
    condiciones_cronicas: { valor: ["Hipertensión arterial"], confianza: "alta" },
  },
  consulta: {
    fecha: { valor: "2024-08-14", confianza: "alta" },
    motivo: { valor: "Dolor de garganta y fiebre por 3 días", confianza: "alta" },
    diagnostico: { valor: "Faringoamigdalitis aguda", confianza: "alta" },
    tratamiento: { valor: "Azitromicina 500 mg c/día x 3 días. Acetaminofén 500 mg c/8h si hay fiebre. Continuar enalapril.", confianza: "alta" },
    vacunas: { valor: [], confianza: "alta" },
    medicamentos: { valor: ["Azitromicina 500 mg c/día x 3 días", "Acetaminofén 500 mg c/8h", "Enalapril 10 mg c/día"], confianza: "alta" },
  },
};

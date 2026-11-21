# Frontend SIGO — grupo de 2

Aquí va la app Next.js (PWA). Esta carpeta está vacía a propósito: creen el proyecto aquí.

```bash
cd frontend
npx create-next-app@latest . --ts --tailwind --app --eslint
```

## Qué construir
- **Pantallas y flujo:** `docs/contrato-phil-flujo-y-api.txt` (12 pantallas: 5 enfermera, 5 paciente, 2 médico; rutas `/login`, `/puesto…`, `/mi…`, `/hospital…`). Ese documento de Phil **es el contrato**.
- **Tipos:** los de la sección "Modelos de datos" de Phil → `frontend/src/types.ts`.
- **Estados por pantalla:** cargando, vacío, error, sin señal (+ "acceso vencido" en las del médico).
- **Errores:** siempre `{ "error": { "codigo", "mensaje" } }`; mostrá `mensaje` tal cual.

## Cómo arrancar sin esperar al backend
1. Usen las respuestas de prueba de `contrato/mocks/` como datos fijos (un `fetch` falso o MSW).
   Ojo: hoy `contrato/` es la v0; la v1 alineada a Phil (18 endpoints bajo `/api/v1`) se sube antes de las 12:00. Mientras, guíense por los ejemplos JSON del documento de Phil.
2. Cuando el backend esté arriba: `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1` (local) o la URL del túnel de Cloudflare.
3. Usuarios de prueba (inventados): enfermera Ana Tzul (Puesto de Salud Aldea Chuicacá), médico Dr. Mario Xicará (Hospital Regional de Quetzaltenango), paciente Rosa Batz Tzoc, DPI 2547896310801, PIN 4821.
   El backend de prueba guarda a Rosa con el CUI inventado `2547896330801` (mismo PIN): el `2547896310801` del contrato no pasa el dígito verificador módulo 11 (se espera 3).

## Pendientes que son del frontend (reporte de Arturo)
- **C-04** pantalla de importar Excel/Access (subir, ver filas, revisar y confirmar igual que una ficha).
- **P-04** cola de fotos sin señal (`client_id` UUID + reintento).
- **P-07** banda de alergias siempre visible en rojo; emergencias en rojo en `/mi/accesos`.

Hablen del contrato solo con Luis. Nada de pacientes reales.

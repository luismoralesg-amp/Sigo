# Mocks del contrato v3

Un JSON por respuesta de `docs/contrato-v3.md`. Reemplazan a los de la v0 (rutas por DPI), que ya no cuentan.

- El nombre sigue el número de la ruta en la tabla "Contrato de API": `NN_METODO_ruta[.variante].json`.
- Datos del demo, todos inventados: doña Rosa (`p_12`, DPI `2547896330801`, PIN `482193`), el niño Diego (`p_20`, `TMP-20261121-7KQ2`), Ana Tzul (enfermera, `c_01`) y el Dr. Mateo Us (médico, `c_02`).
- `03 PUT /me/pin` responde `204` sin cuerpo, así que no tiene archivo.
- `14 GET /pacientes/{id}/exportar` devuelve un archivo; solo el formato `json` tiene ejemplo aquí.
- `errores.json` trae un ejemplo de cada código de la tabla de errores.
- Las horas de los ejemplos son fijas. El servidor simulado del frontend (`frontend/lib/api/mock/`) parte de estos datos, pero calcula `vence_en` y `acceso_vence_en` desde la hora actual para que las cuentas regresivas funcionen.
- Las `original_url` apuntan a `/demo/*.jpg` del frontend. En el backend real son URLs firmadas.

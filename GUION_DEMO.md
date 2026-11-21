# Guion del demo · SIGO

Duración objetivo: **5 minutos de pitch**, con un demo en vivo de unos 2½ minutos entre la diapositiva “La solución” y “Quién paga”.

Personajes en pantalla: **Marta Pú** (enfermera del Puesto de Salud Aldea Chuicacá, en el celular) y el **Dr. Andrés Xicará** (Hospital Regional de Quetzaltenango, en la laptop).

---

## Antes de subir al escenario

**Equipos**
- [ ] Laptop con la app abierta en `/login`, el zoom del navegador al 110–125 % y la ventana a pantalla completa.
- [ ] Celular con la app abierta en `/login`, el brillo al máximo y el modo “no molestar” activado.
- [ ] Los dos en la misma URL: la de Vercel o, en local, `npm run dev -- -H 0.0.0.0` abriendo `http://IP-DE-LA-LAPTOP:3000` en el celular.
- [ ] La ficha de Rosa escrita a mano sobre la mesa, con buena luz (contenido abajo).
- [ ] El archivo `registro_puesto_2015_2022.csv` descargado en la laptop, o usa el botón “Probar con el archivo de ejemplo”.

**Para empezar limpio**
- Recarga cada pantalla antes de empezar: los flujos vuelven al inicio.
- Si probaste el modo sin señal, en la consola del navegador ejecuta `localStorage.removeItem("sigo:pendientes")`.

### La ficha escrita a mano (cópiala así)

La versión actual de la interfaz siempre muestra la lectura de esta ficha, sin importar la foto. Si la ficha en papel dice lo mismo, lo que aparece en pantalla coincide con lo que ve el jurado. La referencia visual está en `public/demo/ficha-rosa-2024.jpg`.

| Campo | Escribir |
|---|---|
| Fecha | 14/08/2024 |
| Nombre | Rosa Elena Tzul Batz |
| DPI/CUI | 2456 78901 0801 |
| F. nac. | 15/4/68 ← año con 2 dígitos: es el campo que saldrá en amarillo |
| Sexo | F |
| Comunidad | Aldea Chuicacá, Totonicapán |
| Alergias | **PENICILINA (PNC) !!** (en rojo, si tienes) |
| Ant. patológicos | HTA – enalapril |
| Motivo | dolor de garganta y fiebre x 3 días |
| Dx | Faringoamigdalitis aguda |
| Tx | Azitromicina 500 mg c/día x 3 días. Acetaminofén 500 mg c/8h si fiebre. Continuar enalapril 10 mg c/día |
| Vacunas | (vacío) |
| Firma | Enf. M. Pú |

---

## El pitch, minuto a minuto

### 0:00 · Diapositivas 1–3 (SIGO · El problema · La solución) — 1 min

> “En Guatemala, el historial de un paciente se queda en un fólder del puesto de salud. Y los sistemas digitales nuevos arrancan vacíos: nadie está pasando el papel de antes. El país está digitalizando el futuro, pero nadie está rescatando el pasado.”

> “SIGO lo resuelve en tres pasos: una foto, la IA lee la letra y una persona confirma. Les mostramos.”

### 1:00 · Demo 1 — Digitalizar la ficha en el celular (≈ 60 s)

| Haz | Di |
|---|---|
| En el celular: elige **Puesto de Salud Aldea Chuicacá** → **Entrar**. | “Soy Marta, enfermera en Chuicacá, Totonicapán.” |
| Toca **Digitalizar ficha en papel** → **Tomar foto de la ficha** → fotografía la ficha de Rosa. | “Esta es la ficha de Rosa, escrita a mano en 2024.” |
| Toca **Leer ficha**. Deja correr la animación de escaneo (unos 4 s). | “La IA lee la letra, aunque sea a mano, y ordena los datos.” |
| En la revisión, muestra la tarjeta azul **“Este DPI ya tiene expediente”**. | “Por el DPI, SIGO ya sabe que Rosa tiene expediente. Esta ficha se suma, no se duplica.” |
| Señala el campo amarillo **Fecha de nacimiento · Revisar**. Compáralo con la foto (tócala para ampliarla) y toca **Está bien** o corrígelo. | “La IA solo transcribe. Si no está segura, lo marca en amarillo: aquí el año venía con dos dígitos. Nada se guarda sin que una persona lo confirme.” |
| Toca **Confirmar y guardar**. Deja ver la animación de la ficha entrando al fólder. | “Expediente de Rosa actualizado. Y la foto original queda junto al dato.” |

### 2:00 · Demo 2 — Importar el sistema antiguo en la laptop (≈ 40 s)

| Haz | Di |
|---|---|
| En la laptop: **Puesto de Salud Aldea Chuicacá** → **Importar sistema antiguo** → elige `registro_puesto_2015_2022.csv` (o **Probar con el archivo de ejemplo**). | “Este puesto también tiene un Excel de 2015 a 2022. Así viene: fechas mezcladas, todo en mayúsculas, celdas vacías.” |
| Muestra la tabla kraft de **Como viene** y luego toca **Limpio**. | “No hay que arreglarlo antes. SIGO sugiere qué es cada columna y limpia los formatos.” |
| Señala el resumen: **304 consultas de 87 pacientes listas para rescatar**. | “304 consultas de 87 pacientes. Las que no tienen DPI se unen por nombre y fecha de nacimiento.” |
| Toca **Confirmar y rescatar 304** → espera el conteo → muestra **Rosa Elena Tzul Batz · Expediente completado**. | “Y el sistema original del puesto sigue funcionando igual. No lo reemplazamos: lo conectamos.” |

### 2:40 · Demo 3 — El hospital consulta el expediente (≈ 50 s)

| Haz | Di |
|---|---|
| Toca el ícono de salir → **Hospital Regional de Quetzaltenango** → **Entrar**. | “Ahora Rosa llega a emergencias del Hospital Regional de Quetzaltenango.” |
| Escribe el DPI `2456789010801`; se formatea solo. También puedes tocar el atajo “Para el demo”. → **Buscar**. | |
| Pausa 2 segundos en la **alerta roja: ALÉRGICA A PENICILINA**. | “Lo primero que ve el médico: alérgica a la penicilina. Ese dato estaba en una ficha de papel de 2014, en un fólder de otro municipio.” |
| Baja por la línea de tiempo: una tarjeta **Digital** (2026), una **Papel · 2024** (abre la miniatura) y una **Sistema antiguo · Excel 2016** (abre la fila original). | “Todo su historial, sin importar de dónde venía: papel, el Excel viejo del puesto y registros nuevos. Y siempre se puede ver el original.” |
| Señala la **Bitácora de acceso: Consultado por Hospital Regional de Quetzaltenango · hoy HH:MM · Tú, ahora**. | “Y cada vez que alguien abre un expediente, queda registrado. Rosa sabe quién vio su historia.” |

> “Tu historia te sigue.”

### 3:30 · Diapositivas 4–9 (Quién paga · Cómo ganamos · Números · Crecimiento · Impacto · Cierre) — 1½ min

Cierra con la diapositiva 9: **“Conservamos el papel. Tu historia te sigue.”**

---

## Si sobra tiempo o preguntan (extras de 15–20 s cada uno)

- **“¿Y sin internet?”** Pon el celular en modo avión y digitaliza otra ficha: la franja amarilla dice “Sin señal” y el final dice “Ficha guardada en el celular”. Quita el modo avión: “Subiendo 1 ficha…” → “1 ficha subida al expediente”.
- **“¿Y los niños sin DPI?”** En el hospital busca `2987654320801` (Mateo) → **Carné QR**. “Un carné que abre su expediente en cualquier centro, con su esquema de vacunas.”
- **“¿Cuál es el impacto?”** Botón **Tablero** en el encabezado del hospital: 7,556 fichas rescatadas por municipio, separando papel y sistema antiguo.
- **“¿Y si la IA se equivoca?”** “Por eso nunca guarda sola: marca lo dudoso en amarillo, la enfermera confirma y la foto original queda como evidencia.”
- **“¿Qué pasa con los datos?”** “Solo centros autorizados, por rol, y con bitácora de cada acceso. El paciente nunca paga.”

---

## Plan B

| Si pasa esto | Haz esto |
|---|---|
| La cámara del celular no abre | En la misma pantalla, toca **Probar con la ficha de ejemplo de Rosa**. |
| El celular no carga la app | Haz el Demo 1 en la laptop con **Probar con la ficha de ejemplo de Rosa**. |
| No encuentra el CSV | Usa **Probar con el archivo de ejemplo**. |
| Algo se traba | Recarga la página: el flujo vuelve al inicio sin perder nada. |

## Frases clave para el jurado

- “La IA solo transcribe; la persona confirma.”
- “No reemplazamos el sistema antiguo: lo conectamos.”
- “La foto original queda junto a cada dato.”
- “Conservamos el papel. Le agregamos memoria.”

## Ojo: lo que todavía es demostración

En la versión actual de la interfaz la lectura con IA está simulada: cualquier foto devuelve la ficha de Rosa. La importación cuenta y limpia el archivo real, pero no lo guarda. El expediente muestra datos de demostración. Si el jurado pregunta, la respuesta honesta es que el endpoint con Claude, la unión por DPI y las migraciones con RLS ya están escritos, y falta conectarlos.

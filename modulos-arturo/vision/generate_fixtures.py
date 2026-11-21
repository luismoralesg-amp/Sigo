#!/usr/bin/env python3
"""Genera 6 imágenes INVENTADAS (PNG + ground truth JSON).

Cinco son fichas clínicas. ficha_06 es una lista de mercado y no es una ficha.
No usa datos de pacientes reales. Solo para evaluar el extractor de SIGO Visión.
Volver a generar cambia el hash del PNG y el mock deja de reconocer la fixture.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent / "fixtures"

FONTS = {
    "sans": "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "sans_bold": "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "serif": "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
    "mono": "/usr/share/fonts/truetype/sand-box/google/Lekton/Lekton-Regular.ttf",
    "kalam": "/usr/share/fonts/truetype/sand-box/google/Kalam/Kalam-Regular.ttf",
    "patrick": "/usr/share/fonts/truetype/sand-box/google/Patrick Hand/PatrickHand-Regular.ttf",
    "caveat": "/usr/share/fonts/truetype/sand-box/google/Caveat/Caveat-VariableFont_wght.ttf",
    "handlee": "/usr/share/fonts/truetype/sand-box/google/Handlee/Handlee-Regular.ttf",
    "gochi": "/usr/share/fonts/truetype/sand-box/google/Gochi Hand/GochiHand-Regular.ttf",
    "architects": "/usr/share/fonts/truetype/sand-box/google/Architects Daughter/ArchitectsDaughter-Regular.ttf",
}

INK = (35, 32, 48)
INK_BLUE = (25, 45, 110)
INK_FAINT = (90, 80, 70)
RULE = (160, 145, 120)
HEADER_BG = (92, 48, 42)
HEADER_FG = (248, 240, 226)
BAND = (210, 186, 150)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONTS[name], size=size)


def campo(valor, confianza=None):
    if confianza is None:
        confianza = "baja" if valor is None else "alta"
    return {"valor": valor, "confianza": confianza}


def make_paper(w: int, h: int, seed: int) -> Image.Image:
    rng = random.Random(seed)
    base = (rng.randint(230, 240), rng.randint(218, 230), rng.randint(190, 205))
    # grano a baja resolución para que el PNG comprima (no es ruido por píxel)
    gw, gh = w // 4, h // 4
    grain = Image.new("RGB", (gw, gh), base)
    px = grain.load()
    for y in range(gh):
        for x in range(gw):
            d = rng.randint(-7, 7)
            r, g, b = base
            px[x, y] = (
                max(0, min(255, r + d)),
                max(0, min(255, g + d - 1)),
                max(0, min(255, b + d - 2)),
            )
    img = grain.resize((w, h), Image.Resampling.BILINEAR)
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for _ in range(8):
        cx, cy = rng.randint(0, w), rng.randint(0, h)
        rw, rh = rng.randint(40, 180), rng.randint(20, 90)
        color = (rng.randint(90, 140), rng.randint(70, 110), rng.randint(40, 80), rng.randint(12, 28))
        od.ellipse((cx - rw, cy - rh, cx + rw, cy + rh), fill=color)
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=12))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    return img


def draw_hand_text(draw, xy, text, fnt, fill, rng, jitter=True):
    x, y = xy
    for ch in text:
        dx = rng.randint(-1, 1) if jitter else 0
        dy = rng.randint(-2, 2) if jitter else 0
        draw.text((x + dx, y + dy), ch, font=fnt, fill=fill)
        x += fnt.getlength(ch) + (rng.randint(-1, 2) if jitter else 0)
    return x, y


def text_size(fnt, text: str) -> tuple[int, int]:
    bbox = fnt.getbbox(text)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def underline_field(draw, x, y, w, color=RULE):
    draw.line((x, y, x + w, y), fill=color, width=1)


def strikethrough(draw, x, y, w, rng, color=(140, 30, 30)):
    mid = y
    points = []
    cx = x
    while cx <= x + w:
        points.append((cx, mid + rng.randint(-3, 3)))
        cx += rng.randint(8, 16)
    if len(points) >= 2:
        draw.line(points, fill=color, width=3)


def header(draw, w, titulo_extra: str):
    draw.rectangle((0, 0, w, 168), fill=HEADER_BG)
    t1 = font("sans_bold", 22)
    t2 = font("sans_bold", 34)
    t3 = font("sans", 16)
    draw.text((48, 18), "PUESTO DE SALUD COMUNITARIO", font=t1, fill=HEADER_FG)
    draw.text((48, 50), "FICHA CLINICA", font=t2, fill=HEADER_FG)
    draw.text((48, 100), "EJEMPLAR DE PRUEBA  ·  DATOS INVENTADOS  ·  no es un paciente real", font=t3, fill=(232, 210, 190))
    draw.text((48, 128), titulo_extra, font=t3, fill=(220, 200, 180))
    draw.rectangle((0, 168, w, 176), fill=BAND)


def footer(draw, w, h, codigo: str):
    fnt = font("sans", 14)
    y = h - 48
    draw.line((48, y, w - 48, y), fill=RULE, width=1)
    draw.text((48, y + 8), f"{codigo}  ·  DATOS INVENTADOS PARA DEMO SIGO  ·  no confirmar como expediente real", font=fnt, fill=INK_FAINT)


def section(draw, x, y, text):
    fnt = font("sans_bold", 18)
    draw.rectangle((x, y, x + 24, y + 18), fill=HEADER_BG)
    draw.text((x + 36, y - 2), text, font=fnt, fill=HEADER_BG)
    return y + 32


def label_value(draw, x, y, label, value, value_font, label_font, ink, line_w, rng=None, handwritten=False, blank=False):
    draw.text((x, y), label, font=label_font, fill=INK_FAINT)
    vx = x + 8 + label_font.getlength(label)
    underline_field(draw, vx, y + 22, line_w)
    bbox = None
    if not blank and value:
        if handwritten and rng is not None:
            endx, _ = draw_hand_text(draw, (vx + 4, y - 4), value, value_font, ink, rng)
            bbox = (vx + 2, y - 6, endx + 2, y + 26)
        else:
            draw.text((vx + 4, y - 2), value, font=value_font, fill=ink)
            tw, th = text_size(value_font, value)
            bbox = (vx + 2, y - 4, vx + 6 + tw, y + th + 4)
    return bbox, y + 40


def build_form(seed: int, codigo: str, titulo_extra: str, size=(1275, 1750)):
    w, h = size
    img = make_paper(w, h, seed)
    draw = ImageDraw.Draw(img)
    # margen tipo foto
    draw.rectangle((18, 18, w - 19, h - 19), outline=(120, 100, 80), width=2)
    header(draw, w, titulo_extra)
    footer(draw, w, h, codigo)
    return img, draw, w, h


def save_pair(img: Image.Image, truth: dict, stem: str, seed: int):
    rng = random.Random(seed + 99)
    # ligera rotación y recorte para simular foto de papel
    angle = rng.uniform(-0.7, 0.7)
    rotated = img.rotate(angle, resample=Image.Resampling.BICUBIC, fillcolor=(80, 70, 60))
    # un poco de blur de cámara barata
    if rng.random() < 0.4:
        rotated = rotated.filter(ImageFilter.UnsharpMask(radius=1, percent=60, threshold=2))
    path = OUT / f"{stem}.png"
    rotated.save(path, format="PNG", optimize=True)
    truth_path = OUT / f"{stem}.truth.json"
    truth_path.write_text(json.dumps(truth, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"escribió {path.name} y {truth_path.name}")


def ficha_01():
    """Tipografía de máquina, todos los campos claros."""
    img, draw, w, h = build_form(
        101, "FICHA-INV-01",
        "Llenada a maquina  ·  Puesto de prueba El Encinal",
    )
    lf, vf = font("sans", 20), font("mono", 26)
    ink = INK_BLUE
    y = 210
    y = section(draw, 48, y, "DATOS DEL PACIENTE")
    label_value(draw, 48, y, "Nombre completo:", "Ana Beatriz Cumes Palala", vf, lf, ink, 820)
    y += 52
    label_value(draw, 48, y, "DPI (CUI, 13 digitos):", "9112233445566", vf, lf, ink, 520)
    y += 52
    label_value(draw, 48, y, "Fecha de nacimiento:", "22/08/1986", vf, lf, ink, 280)
    label_value(draw, 720, y, "Sexo (F/M):", "F", vf, lf, ink, 80)
    y += 52
    label_value(draw, 48, y, "Comunidad:", "Aldea El Encinal, San Raymundo", vf, lf, ink, 780)
    y += 52
    label_value(draw, 48, y, "Alergias:", "Sulfas", vf, lf, ink, 860)
    y += 52
    label_value(draw, 48, y, "Condiciones cronicas:", "Asma", vf, lf, ink, 760)
    y += 70
    y = section(draw, 48, y, "CONSULTAS")
    # tabla
    cols = [48, 200, 470, 760, 1040, 1220]
    headers = ["Fecha", "Motivo", "Diagnostico", "Tratamiento", "Vacunas"]
    hf = font("sans_bold", 16)
    for i, title in enumerate(headers):
        draw.text((cols[i] + 6, y), title, font=hf, fill=INK_FAINT)
    y += 28
    draw.line((48, y, 1220, y), fill=RULE, width=1)
    y += 14
    row = ["03/05/2025", "Tos y silbido de pecho", "Exacerbacion asmatica", "Salbutamol inhalado", "—"]
    for i, val in enumerate(row):
        draw.text((cols[i] + 6, y), val, font=font("mono", 20), fill=ink)
    save_pair(
        img,
        {
            "paciente": {
                "nombre": campo("Ana Beatriz Cumes Palala"),
                "dpi": campo("9112233445566"),
                "fecha_nacimiento": campo("1986-08-22"),
                "sexo": campo("F"),
                "comunidad": campo("Aldea El Encinal, San Raymundo"),
                "alergias": campo(["Sulfas"]),
                "condiciones_cronicas": campo(["Asma"]),
            },
            "consultas": [
                {
                    "fecha": campo("2025-05-03"),
                    "motivo": campo("Tos y silbido de pecho"),
                    "diagnostico": campo("Exacerbacion asmatica"),
                    "tratamiento": campo("Salbutamol inhalado"),
                    "vacunas": campo([]),  # escrito "—" de forma explícita = ninguna
                    "pagina": 0,
                }
            ],
        },
        "ficha_01",
        101,
    )


def ficha_02():
    """Manuscrita; alergias y condiciones en blanco."""
    rng = random.Random(202)
    img, draw, w, h = build_form(
        202, "FICHA-INV-02",
        "Llenada a mano  ·  Puesto de prueba Paquix",
    )
    lf, vf = font("sans", 20), font("patrick", 30)
    ink = INK
    y = 210
    y = section(draw, 48, y, "DATOS DEL PACIENTE")
    label_value(draw, 48, y, "Nombre completo:", "Jose Tomas Xiloj Perez", vf, lf, ink, 820, rng, True)
    y += 56
    label_value(draw, 48, y, "DPI (CUI, 13 digitos):", "9223344556677", vf, lf, ink, 520, rng, True)
    y += 56
    label_value(draw, 48, y, "Fecha de nacimiento:", "11 nov 1965", vf, lf, ink, 300, rng, True)
    label_value(draw, 720, y, "Sexo (F/M):", "M", vf, lf, ink, 80, rng, True)
    y += 56
    label_value(draw, 48, y, "Comunidad:", "Canton Paquix, Huehuetenango", vf, lf, ink, 780, rng, True)
    y += 56
    label_value(draw, 48, y, "Alergias:", "", vf, lf, ink, 860, rng, True, blank=True)
    y += 56
    label_value(draw, 48, y, "Condiciones cronicas:", "", vf, lf, ink, 760, rng, True, blank=True)
    y += 74
    y = section(draw, 48, y, "CONSULTAS")
    cols = [48, 200, 470, 760, 1040, 1220]
    headers = ["Fecha", "Motivo", "Diagnostico", "Tratamiento", "Vacunas"]
    hf = font("sans_bold", 16)
    for i, title in enumerate(headers):
        draw.text((cols[i] + 6, y), title, font=hf, fill=INK_FAINT)
    y += 28
    draw.line((48, y, 1220, y), fill=RULE, width=1)
    y += 16
    row = ["14-08-2024", "Dolor de rodilla", "Artrosis de rodilla", "Paracetamol 500 mg", ""]
    for i, val in enumerate(row):
        if val:
            draw_hand_text(draw, (cols[i] + 6, y), val, font("kalam", 24), ink, rng)
    save_pair(
        img,
        {
            "paciente": {
                "nombre": campo("Jose Tomas Xiloj Perez"),
                "dpi": campo("9223344556677"),
                "fecha_nacimiento": campo("1965-11-11"),
                "sexo": campo("M"),
                "comunidad": campo("Canton Paquix, Huehuetenango"),
                "alergias": campo(None),
                "condiciones_cronicas": campo(None),
            },
            "consultas": [
                {
                    "fecha": campo("2024-08-14"),
                    "motivo": campo("Dolor de rodilla"),
                    "diagnostico": campo("Artrosis de rodilla"),
                    "tratamiento": campo("Paracetamol 500 mg"),
                    "vacunas": campo(None),
                    "pagina": 0,
                }
            ],
        },
        "ficha_02",
        202,
    )


def ficha_03():
    """Tratamiento tachado y reemplazado; alergia a penicilina clara."""
    rng = random.Random(303)
    img, draw, w, h = build_form(
        303, "FICHA-INV-03",
        "Llenada a mano  ·  un dato tachado y corregido",
    )
    lf, vf = font("sans", 20), font("handlee", 28)
    ink = INK
    y = 210
    y = section(draw, 48, y, "DATOS DEL PACIENTE")
    label_value(draw, 48, y, "Nombre completo:", "Elena Ruth Sac Lopez", vf, lf, ink, 820, rng, True)
    y += 56
    label_value(draw, 48, y, "DPI (CUI, 13 digitos):", "9334455667788", font("kalam", 28), lf, ink, 520, rng, True)
    y += 56
    label_value(draw, 48, y, "Fecha de nacimiento:", "03-12-1990", vf, lf, ink, 300, rng, True)
    label_value(draw, 720, y, "Sexo (F/M):", "F", vf, lf, ink, 80, rng, True)
    y += 56
    label_value(draw, 48, y, "Comunidad:", "Aldea Las Flores, Chimaltenango", vf, lf, ink, 780, rng, True)
    y += 56
    label_value(draw, 48, y, "Alergias:", "Penicilina", vf, lf, ink, 860, rng, True)
    y += 56
    label_value(draw, 48, y, "Condiciones cronicas:", "Ninguna", vf, lf, ink, 760, rng, True)
    y += 74
    y = section(draw, 48, y, "CONSULTAS")
    cols = [48, 200, 470, 720, 1040, 1220]
    headers = ["Fecha", "Motivo", "Diagnostico", "Tratamiento", "Vacunas"]
    hf = font("sans_bold", 16)
    for i, title in enumerate(headers):
        draw.text((cols[i] + 6, y), title, font=hf, fill=INK_FAINT)
    y += 28
    draw.line((48, y, 1220, y), fill=RULE, width=1)
    y += 16
    draw_hand_text(draw, (cols[0] + 6, y), "21/01/2026", font("handlee", 24), ink, rng)
    draw_hand_text(draw, (cols[1] + 6, y), "Dolor de garganta", font("handlee", 24), ink, rng)
    draw_hand_text(draw, (cols[2] + 6, y), "Faringitis", font("handlee", 24), ink, rng)
    # tachado + reemplazo
    old = "Amoxicilina 500 mg"
    fnt_old = font("handlee", 22)
    ox, oy = cols[3] + 6, y
    endx, _ = draw_hand_text(draw, (ox, oy), old, fnt_old, (70, 60, 60), rng)
    strikethrough(draw, ox, oy + 16, endx - ox + 4, rng)
    draw_hand_text(draw, (ox, oy + 32), "Azitromicina 500 mg", font("kalam", 24), (20, 20, 20), rng)
    draw_hand_text(draw, (cols[4] + 6, y), "—", font("handlee", 24), ink, rng)
    save_pair(
        img,
        {
            "paciente": {
                "nombre": campo("Elena Ruth Sac Lopez"),
                "dpi": campo("9334455667788"),
                "fecha_nacimiento": campo("1990-12-03"),
                "sexo": campo("F"),
                "comunidad": campo("Aldea Las Flores, Chimaltenango"),
                "alergias": campo(["Penicilina"]),
                "condiciones_cronicas": campo([]),  # escrito "Ninguna"
            },
            "consultas": [
                {
                    "fecha": campo("2026-01-21"),
                    "motivo": campo("Dolor de garganta"),
                    "diagnostico": campo("Faringitis"),
                    "tratamiento": campo("Azitromicina 500 mg"),
                    "vacunas": campo([]),
                    "pagina": 0,
                }
            ],
        },
        "ficha_03",
        303,
    )


def ficha_04():
    """Niño inventado, DPI en blanco, diagnostico vacío, una vacuna."""
    rng = random.Random(404)
    img, draw, w, h = build_form(
        404, "FICHA-INV-04",
        "Llenada a mano  ·  menor de edad sin DPI  ·  campos vacios",
    )
    lf, vf = font("sans", 20), font("architects", 28)
    ink = INK
    y = 210
    y = section(draw, 48, y, "DATOS DEL PACIENTE")
    label_value(draw, 48, y, "Nombre completo:", "Diego Andres Pu Tun", vf, lf, ink, 820, rng, True)
    y += 56
    label_value(draw, 48, y, "DPI (CUI, 13 digitos):", "", vf, lf, ink, 520, rng, True, blank=True)
    y += 56
    label_value(draw, 48, y, "Fecha de nacimiento:", "15/09/2020", vf, lf, ink, 300, rng, True)
    label_value(draw, 720, y, "Sexo (F/M):", "M", vf, lf, ink, 80, rng, True)
    y += 56
    label_value(draw, 48, y, "Comunidad:", "Caserio El Tablon", vf, lf, ink, 780, rng, True)
    y += 56
    label_value(draw, 48, y, "Alergias:", "", vf, lf, ink, 860, rng, True, blank=True)
    y += 56
    label_value(draw, 48, y, "Condiciones cronicas:", "", vf, lf, ink, 760, rng, True, blank=True)
    y += 74
    y = section(draw, 48, y, "CONSULTAS")
    cols = [48, 200, 470, 760, 1040, 1220]
    headers = ["Fecha", "Motivo", "Diagnostico", "Tratamiento", "Vacunas"]
    hf = font("sans_bold", 16)
    for i, title in enumerate(headers):
        draw.text((cols[i] + 6, y), title, font=hf, fill=INK_FAINT)
    y += 28
    draw.line((48, y, 1220, y), fill=RULE, width=1)
    y += 16
    draw_hand_text(draw, (cols[0] + 6, y), "10/02/2026", font("gochi", 26), ink, rng)
    draw_hand_text(draw, (cols[1] + 6, y), "Fiebre y tos", font("gochi", 26), ink, rng)
    # diagnostico en blanco (raya vacía)
    underline_field(draw, cols[2] + 6, y + 28, 250)
    draw_hand_text(draw, (cols[3] + 6, y), "Suero oral", font("gochi", 26), ink, rng)
    draw_hand_text(draw, (cols[4] + 6, y), "SRP", font("gochi", 26), ink, rng)
    save_pair(
        img,
        {
            "paciente": {
                "nombre": campo("Diego Andres Pu Tun"),
                "dpi": campo(None),
                "fecha_nacimiento": campo("2020-09-15"),
                "sexo": campo("M"),
                "comunidad": campo("Caserio El Tablon"),
                "alergias": campo(None),
                "condiciones_cronicas": campo(None),
            },
            "consultas": [
                {
                    "fecha": campo("2026-02-10"),
                    "motivo": campo("Fiebre y tos"),
                    "diagnostico": campo(None),
                    "tratamiento": campo("Suero oral"),
                    "vacunas": campo(["SRP"]),
                    "pagina": 0,
                }
            ],
        },
        "ficha_04",
        404,
    )


def ficha_05():
    """Dos consultas en la misma hoja; diagnostico de la primera, borroso."""
    rng = random.Random(505)
    img, draw, w, h = build_form(
        505, "FICHA-INV-05",
        "Mixta (maquina + mano)  ·  dos consultas  ·  un renglón borroso",
    )
    lf, typed, hand = font("sans", 20), font("mono", 24), font("caveat", 32)
    ink = INK_BLUE
    y = 210
    y = section(draw, 48, y, "DATOS DEL PACIENTE")
    label_value(draw, 48, y, "Nombre completo:", "Carmen Yolanda Ixcotajay", typed, lf, ink, 820)
    y += 52
    label_value(draw, 48, y, "DPI (CUI, 13 digitos):", "9556677889900", typed, lf, ink, 520)
    y += 52
    label_value(draw, 48, y, "Fecha de nacimiento:", "07/04/1979", typed, lf, ink, 280)
    label_value(draw, 720, y, "Sexo (F/M):", "F", typed, lf, ink, 80)
    y += 52
    label_value(draw, 48, y, "Comunidad:", "Paraje Chuwi, Solola", font("kalam", 28), lf, INK, 780, rng, True)
    y += 52
    label_value(draw, 48, y, "Alergias:", "Ninguna", font("kalam", 28), lf, INK, 860, rng, True)
    y += 52
    label_value(draw, 48, y, "Condiciones cronicas:", "Diabetes tipo 2", font("kalam", 28), lf, INK, 760, rng, True)
    y += 70
    y = section(draw, 48, y, "CONSULTAS")
    cols = [48, 200, 470, 760, 1040, 1220]
    headers = ["Fecha", "Motivo", "Diagnostico", "Tratamiento", "Vacunas"]
    hf = font("sans_bold", 16)
    for i, title in enumerate(headers):
        draw.text((cols[i] + 6, y), title, font=hf, fill=INK_FAINT)
    y += 28
    draw.line((48, y, 1220, y), fill=RULE, width=1)
    y += 16

    # consulta 1 (2019) — diagnostico borroso a propósito
    draw.text((cols[0] + 6, y), "18/06/2019", font=typed, fill=ink)
    draw.text((cols[1] + 6, y), "Control general", font=typed, fill=ink)
    diag = "Glucosa elevada"
    df = font("mono", 22)
    dx, dy = cols[2] + 6, y
    draw.text((dx, dy), diag, font=df, fill=ink)
    tw, th = text_size(df, diag)
    blur_box = (dx - 4, dy - 6, dx + tw + 10, dy + th + 10)

    draw.text((cols[3] + 6, y), "Dieta y control", font=typed, fill=ink)
    draw.text((cols[4] + 6, y), "Influenza", font=typed, fill=ink)

    # aplicar blur sobre el diagnostico de 2019
    crop = img.crop(blur_box).filter(ImageFilter.GaussianBlur(radius=7))
    # mancha extra
    stain = Image.new("RGB", crop.size, (180, 160, 120))
    crop = Image.blend(crop, stain, 0.35).filter(ImageFilter.GaussianBlur(radius=5))
    img.paste(crop, blur_box[:2])
    draw = ImageDraw.Draw(img)  # redraw handle after paste; header/footer already drawn

    y += 70
    draw.line((48, y - 16, 1220, y - 16), fill=RULE, width=1)
    # consulta 2 (2023) clara, a mano
    draw_hand_text(draw, (cols[0] + 6, y), "09/11/2023", hand, INK, rng)
    draw_hand_text(draw, (cols[1] + 6, y), "Revision de azucar", hand, INK, rng)
    draw_hand_text(draw, (cols[2] + 6, y), "Diabetes tipo 2", hand, INK, rng)
    draw_hand_text(draw, (cols[3] + 6, y), "Metformina 850 mg", hand, INK, rng)
    draw_hand_text(draw, (cols[4] + 6, y), "Td", hand, INK, rng)

    save_pair(
        img,
        {
            "paciente": {
                "nombre": campo("Carmen Yolanda Ixcotajay"),
                "dpi": campo("9556677889900"),
                "fecha_nacimiento": campo("1979-04-07"),
                "sexo": campo("F"),
                "comunidad": campo("Paraje Chuwi, Solola"),
                "alergias": campo([]),
                "condiciones_cronicas": campo(["Diabetes tipo 2"]),
            },
            "consultas": [
                {
                    "fecha": campo("2019-06-18"),
                    "motivo": campo("Control general"),
                    "diagnostico": campo(None),  # borroso a propósito
                    "tratamiento": campo("Dieta y control"),
                    "vacunas": campo(["Influenza"]),
                    "pagina": 0,
                },
                {
                    "fecha": campo("2023-11-09"),
                    "motivo": campo("Revision de azucar"),
                    "diagnostico": campo("Diabetes tipo 2"),
                    "tratamiento": campo("Metformina 850 mg"),
                    "vacunas": campo(["Td"]),
                    "pagina": 0,
                },
            ],
        },
        "ficha_05",
        505,
    )



def ficha_06():
    """No es una ficha clínica: lista de mercado inventada, para probar ilegible."""
    rng = random.Random(606)
    w, h = 1275, 1750
    img = make_paper(w, h, 606)
    draw = ImageDraw.Draw(img)
    draw.rectangle((18, 18, w - 19, h - 19), outline=(60, 90, 60), width=2)
    draw.rectangle((0, 0, w, 168), fill=(46, 90, 58))
    draw.text((48, 22), "CASA DE DOÑA LINA", font=font("sans_bold", 22), fill=(240, 245, 230))
    draw.text((48, 54), "LISTA DEL MERCADO", font=font("sans_bold", 34), fill=(240, 245, 230))
    draw.text((48, 104), "EJEMPLAR DE PRUEBA  ·  DATOS INVENTADOS  ·  no es una ficha clinica", font=font("sans", 16), fill=(210, 230, 200))
    draw.text((48, 128), "No pertenece a ningun paciente  ·  para probar el extractor", font=font("sans", 16), fill=(210, 230, 200))
    draw.rectangle((0, 168, w, 176), fill=(170, 200, 150))
    y = 220
    draw.text((48, y), "Para el almuerzo del domingo (inventado)", font=font("sans_bold", 20), fill=(46, 80, 50))
    y += 50
    items = [
        "2 libras de frijol negro",
        "1 cubeta de tomate de cocina",
        "3 aguacates",
        "pan frances (una bolsa)",
        "cafe en grano, medio kilo",
        "jabon de bola",
        "velas de cebo",
    ]
    for i, item in enumerate(items, start=1):
        draw_hand_text(draw, (70, y), f"{i}. {item}", font("kalam", 32), INK, rng)
        y += 52
    y += 20
    draw.text((48, y), "Notas:", font=font("sans", 18), fill=INK_FAINT)
    draw_hand_text(draw, (140, y - 4), "pasar a la tienda de don Chepe, no al mercado grande", font("patrick", 28), INK, rng)
    y += 70
    draw_hand_text(draw, (48, y), "si no hay aguacate, traer guisquil", font("handlee", 28), INK, rng)
    footer(draw, w, h, "FICHA-INV-06  ·  NO ES UNA FICHA CLINICA")
    vacio = {"valor": None, "confianza": "baja"}
    save_pair(
        img,
        {
            "paciente": {
                "nombre": dict(vacio),
                "dpi": dict(vacio),
                "fecha_nacimiento": dict(vacio),
                "sexo": dict(vacio),
                "comunidad": dict(vacio),
                "alergias": dict(vacio),
                "condiciones_cronicas": dict(vacio),
            },
            "consultas": [],
            "error": "no es una ficha clinica",
        },
        "ficha_06",
        606,
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # comprobar fuentes antes de dibujar
    missing = [k for k, p in FONTS.items() if not Path(p).is_file()]
    if missing:
        raise SystemExit(f"Faltan fuentes: {missing}")
    ficha_01()
    ficha_02()
    ficha_03()
    ficha_04()
    ficha_05()
    ficha_06()
    print(f"listo en {OUT}")


if __name__ == "__main__":
    main()

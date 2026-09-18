#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the subject cover plates that the one-page site uses as its clickable
"manual" images.

Two layers, deliberately kept apart:

  1. cover-art/<slug>.png  — AI-generated, text-free background artwork
     (brief: flat vector poster in the site's indigo/violet palette). Committed
     to the repo, downscaled to keep the checkout small.
  2. The typographic plate drawn *here* with PyMuPDF on top of that artwork —
     eyebrow, rule, title, course-code chip, kind line and the author credit.
     Vector-sharp at any size, no misspelled AI text, regenerable in one command.

Output: static/covers/<slug>.jpg (720x1000, ~150 KB each).

    python3 covers.py            # rebuild every cover
    python3 covers.py 1BCS304    # rebuild one (by slug)
"""
import os
import sys

import pymupdf

ROOT = os.path.dirname(os.path.abspath(__file__))
ART_DIR = os.path.join(ROOT, "cover-art")
OUT_DIR = os.path.join(ROOT, "static", "covers")
W, H = 720, 1000

INK = (0.055, 0.07, 0.16)
WHITE = (1, 1, 1)
AMBER = (0.949, 0.663, 0.231)
GREY = (0.78, 0.81, 0.92)

# slug, eyebrow, title, kind line, chip text, accent
SUBJECTS = [
    ("1BPOPL107-207", "Laboratory course · Semester I / II", "C Programming Lab",
     "Course book · 14 experiments · PDF", "1BPOPL107/207", AMBER),
    ("1BPLC105B-205B", "Integrated theory & practical · Semester I / II", "Python Programming",
     "Course book · 77 pages · PDF", "1BPLC105B/205B", (0.24, 0.83, 0.75)),
    ("1BCS302", "Integrated theory & practical · Semester III", "Object Oriented Programming with Java",
     "Course book · 78 pages · PDF", "1BCS302", AMBER),
    ("1BCS303", "Theory course with Verilog activity · Semester III", "Digital Design & Computer Organization",
     "Course book · 84 pages · PDF", "1BCS303", (0.34, 0.78, 0.94)),
    ("1BCS304", "Theory course with C-programming activity · Semester III", "Operating Systems",
     "Course book · 95 pages · PDF", "1BCS304", AMBER),
    ("1BMATCS301", "Analytical skills & competency course · Semester III", "Probability Distributions & Statistics",
     "Course book · 77 pages · PDF", "1BMATCS301", (0.72, 0.62, 1.0)),
    ("1BAIL307A", "Laboratory course (AEC) · Semester III", "Exploratory Data Analysis",
     "Course book · 12 experiments · PDF", "1BAIL307A", (0.37, 0.84, 0.65)),
    ("1BCP308", "AEC / SDC · Semester III · Project-based learning", "Community Project",
     "Notes + the offline tool it documents", "1BCP308", AMBER),
    ("GEN-RES", "Departmental resource cell · All semesters", "Guides, Sheets & Tools",
     "Manual · rubric · timetable · practice sets", "GEN-RES", AMBER),
]


# ------------------------------------------------------------------ drawing
def text_at(page, x, y, s, size, font="hebo", color=WHITE, tracking=0.0):
    """insert_text with optional letter-spacing (drawn char by char)."""
    if tracking <= 0:
        page.insert_text((x, y), s, fontsize=size, fontname=font, color=color)
        return
    cx = x
    for ch in s:
        page.insert_text((cx, y), ch, fontsize=size, fontname=font, color=color)
        cx += pymupdf.get_text_length(ch, fontname=font, fontsize=size) + tracking


def width_of(s, size, font="hebo", tracking=0.0):
    w = pymupdf.get_text_length(s, fontname=font, fontsize=size)
    return w + tracking * max(0, len(s) - 1)


def tracked_center(page, y, s, size, font="hebo", color=WHITE, tracking=1.6):
    text_at(page, (W - width_of(s, size, font, tracking)) / 2, y, s, size, font, color, tracking)


def vgradient(page, rect, c0, c1, a0, a1, steps=90):
    h = rect.y1 - rect.y0
    for i in range(steps):
        t = i / (steps - 1)
        band = pymupdf.Rect(rect.x0, rect.y0 + h * i / steps,
                            rect.x1, rect.y0 + h * (i + 1) / steps)
        col = tuple(c0[k] + (c1[k] - c0[k]) * t for k in range(3))
        page.draw_rect(band, color=None, fill=col,
                       fill_opacity=a0 + (a1 - a0) * t, width=0)


def wrap(s, size, maxw, font="hebo"):
    words, lines, cur = s.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if pymupdf.get_text_length(trial, fontname=font, fontsize=size) <= maxw or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def fitted_title(s, maxw, max_lines=3, sizes=(44, 41, 38, 35, 32, 30, 28)):
    for size in sizes:
        lines = wrap(s, size, maxw)
        if len(lines) <= max_lines:
            return size, lines
    return sizes[-1], wrap(s, sizes[-1], maxw)[:max_lines]


def build(slug, eyebrow, title, kind, chip, accent, author=("Dr. Lokesh M R",
          "Professor · Department of Information Science & Engineering",
          "A J Institute of Engineering and Technology, Mangaluru, Karnataka")):
    art = next((p for p in (os.path.join(ART_DIR, slug + ".jpg"),
                            os.path.join(ART_DIR, slug + ".png"))
                if os.path.exists(p)), None)
    if not art:
        raise SystemExit(f"missing artwork for {slug} in {ART_DIR}")
    doc = pymupdf.open()
    page = doc.new_page(width=W, height=H)

    # ---- 1. artwork, cover-cropped to the plate size
    im = pymupdf.Pixmap(art)
    scale = max(W / im.width, H / im.height)
    rw, rh = im.width * scale, im.height * scale
    x0, y0 = (W - rw) / 2, (H - rh) / 2
    page.insert_image(pymupdf.Rect(x0, y0, x0 + rw, y0 + rh), filename=art)

    # ---- 2. scrims: readable top band + heavy bottom plate
    vgradient(page, pymupdf.Rect(0, 0, W, 150), INK, INK, 0.66, 0.0)
    vgradient(page, pymupdf.Rect(0, 420, W, 1000), INK, INK, 0.05, 0.96)
    page.draw_rect(pymupdf.Rect(0, 560, W, 760), color=None, fill=INK, fill_opacity=0.30)
    page.draw_rect(pymupdf.Rect(0, 700, W, H), color=None, fill=INK, fill_opacity=0.55)
    vgradient(page, pymupdf.Rect(0, 470, W, 760), (0, 0, 0), (0, 0, 0), 0.0, 0.45)

    # ---- 3. eyebrow (top, letterspaced, centered) + hairline
    tracked_center(page, 60, eyebrow.upper(), 10.5, "hebo", AMBER, 1.5)
    page.draw_rect(pymupdf.Rect(60, 76, W - 60, 76.8), color=None, fill=AMBER, fill_opacity=0.55)
    tracked_center(page, 104, "V T U · 2 0 2 5  S C H E M E  C O U R S E  M A N U A L", 8.4, "helv", GREY, 1.1)

    # ---- 4. bottom plate: rule, title, chip, kind, credit
    page.draw_rect(pymupdf.Rect(60, 612, 60 + 74, 617), color=None, fill=accent)

    size, lines = fitted_title(title.upper(), W - 120, 3)
    y = 612 + 30 + size * 0.92
    for line in lines:
        text_at(page, 60, y, line, size, "hebo", WHITE, 0.2)
        y += size * 1.1

    # course-code chip
    chip_text = chip
    cw = width_of(chip_text, 15, "hebo", 0.6) + 34
    y += 12
    page.draw_rect(pymupdf.Rect(60, y - 22, 60 + cw, y + 12), color=None,
                   fill=accent, radius=0.35)
    text_at(page, 77, y - 2, chip_text, 15, "hebo", INK, 0.6)

    text_at(page, 60, y + 40, kind, 11.5, "helv", GREY, 0.3)
    page.draw_rect(pymupdf.Rect(60, y + 58, W - 60, y + 58.8), color=None,
                   fill=GREY, fill_opacity=0.35)

    # ---- 5. creator credit (the attribution the site is built around)
    cy = 906
    text_at(page, 60, cy, "by", 10, "heit", GREY, 0.4)
    text_at(page, 60, cy + 30, author[0], 22, "tibo", WHITE)
    text_at(page, 60, cy + 52, author[1], 10.4, "helv", GREY, 0.2)
    text_at(page, 60, cy + 68, author[2], 10.4, "helv", GREY, 0.2)

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, slug + ".jpg")
    pix = page.get_pixmap(matrix=pymupdf.Matrix(1, 1))
    pix.save(out, jpg_quality=86)
    doc.close()
    return out, os.path.getsize(out)


def main():
    want = set(sys.argv[1:])
    total = 0
    for slug, eyebrow, title, kind, chip, accent in SUBJECTS:
        if want and slug not in want:
            continue
        out, size = build(slug, eyebrow, title, kind, chip, accent)
        total += size
        print(f"  {os.path.basename(out):20s} {size // 1024:4d} KB")
    print(f"covers: {len(SUBJECTS) if not want else len(want)} plates · {total // 1024} KB total")


if __name__ == "__main__":
    main()

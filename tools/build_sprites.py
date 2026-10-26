#!/usr/bin/env python3
"""Нарезает исходные листы из source/ в игровые спрайтшиты assets/sprites/.

Каждый кадр — ячейка 240×240 (размер экрана GeekMagic SmallTV).
Персонаж масштабируется так, чтобы стоячий кадр был 140 px в высоту,
ноги стоят на линии пола (y = FLOOR), центр масс тела — на ANCHOR_X.

    .venv/bin/python tools/build_sprites.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source"
OUT = ROOT / "assets" / "sprites"

CELL = 240
HEIGHT = 140        # высота персонажа в стоячей позе
FLOOR = 199         # нижний ряд пикселей ступней
ANCHOR_X = 117      # центр масс тела по горизонтали
ALPHA_CUT = 128     # всё полупрозрачное ниже — мусор после генерации
MIN_BLOB = 0.004    # доля от площади персонажа: мельче — удаляем как шум

# name: (файл, колонки, ряды, индекс эталонного стоячего кадра)
SHEETS = {
    "scratch": ("scratch.png", 4, 4, 0),
    "hungry": ("hungry.png", 4, 4, 0),
    "walk": ("walk.png", 6, 4, 0),
    "poop": ("poop.png", 4, 4, 0),
}


def peel_red_fringe(rgba, passes=4):
    """Снимает красную кайму, которая прилипает к контуру снаружи."""
    r, g, b, a = (rgba[..., i].astype(int) for i in range(4))
    reddish = (r > 130) & (g < 100) & (b < 100) & (r - g > 70)
    for _ in range(passes):
        solid = rgba[..., 3] > 0
        edge = solid & ~ndimage.binary_erosion(solid)
        kill = edge & reddish
        if not kill.any():
            break
        rgba[kill, 3] = 0
    return rgba


def clean_cell(cell):
    cell = cell.copy()
    cell[cell[..., 3] < ALPHA_CUT, 3] = 0
    cell[cell[..., 3] > 0, 3] = 255
    cell = peel_red_fringe(cell)
    solid = cell[..., 3] > 0
    labels, n = ndimage.label(solid, structure=np.ones((3, 3)))
    if n == 0:
        raise ValueError("пустая ячейка")
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    body = int(np.argmax(sizes)) + 1
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= sizes.max() * MIN_BLOB
    cell[~keep[labels], 3] = 0
    cell[cell[..., 3] == 0, :3] = 0
    return cell, labels == body


def slice_cells(img, cols, rows):
    h, w = img.shape[:2]
    for i in range(cols * rows):
        c, r = i % cols, i // cols
        x0, x1 = round(c * w / cols), round((c + 1) * w / cols)
        y0, y1 = round(r * h / rows), round((r + 1) * h / rows)
        yield img[y0:y1, x0:x1]


def downscale(cell, scale):
    h, w = cell.shape[:2]
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    small = np.array(Image.fromarray(cell).resize(size, Image.LANCZOS))
    small[small[..., 3] < ALPHA_CUT, 3] = 0
    small[small[..., 3] > 0, 3] = 255
    small[small[..., 3] == 0, :3] = 0
    return small


def build_sheet(name, file, cols, rows, ref):
    src = np.array(Image.open(SRC / file).convert("RGBA"))
    cells = [clean_cell(c) for c in slice_cells(src, cols, rows)]

    ys = np.nonzero(cells[ref][1].any(axis=1))[0]
    scale = HEIGHT / (ys.max() - ys.min() + 1)

    sheet = np.zeros((rows * CELL, cols * CELL, 4), np.uint8)
    for i, (cell, body) in enumerate(cells):
        small = downscale(cell, scale)
        body_small = np.array(Image.fromarray(body).resize(small.shape[1::-1], Image.NEAREST))
        bys, bxs = np.nonzero(body_small)
        # ступни на пол, центр масс тела — на якорь; кучки едут вместе с телом
        dx = ANCHOR_X - round(bxs.mean())
        dy = FLOOR - bys.max()
        ox, oy = (i % cols) * CELL, (i // cols) * CELL
        h, w = small.shape[:2]
        tile = np.zeros((CELL, CELL, 4), np.uint8)
        sx0, sy0 = max(0, -dx), max(0, -dy)
        tx0, ty0 = max(0, dx), max(0, dy)
        cw, ch = min(w - sx0, CELL - tx0), min(h - sy0, CELL - ty0)
        tile[ty0:ty0 + ch, tx0:tx0 + cw] = small[sy0:sy0 + ch, sx0:sx0 + cw]
        sheet[oy:oy + CELL, ox:ox + CELL] = tile

    Image.fromarray(sheet).save(OUT / f"{name}.png", optimize=True)
    return {"file": f"sprites/{name}.png", "cell": CELL, "cols": cols, "rows": rows,
            "frames": cols * rows, "scale": round(scale, 4)}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {name: build_sheet(name, *args) for name, args in SHEETS.items()}
    for extra in ("room", "pile"):
        Image.open(SRC / f"{extra}.png").save(OUT / f"{extra}.png", optimize=True)
    (OUT / "sheets.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    for name, m in meta.items():
        print(f"{name:8} {m['cols']}×{m['rows']}  scale {m['scale']}")


if __name__ == "__main__":
    main()

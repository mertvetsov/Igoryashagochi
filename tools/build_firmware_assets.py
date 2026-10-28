"""Картинки для прошивки SmallTV: комната и статика Игоряши в RGB565.

Комната целиком 240×240, кадры статики — уже наложенными на комнату, но только
прямоугольником, где Игоряша двигается: экран перерисовывает лишь его.
Запуск: .venv/bin/python tools/build_firmware_assets.py  →  firmware/src/assets.h
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / 'assets' / 'sprites'
OUT = ROOT / 'firmware' / 'src' / 'assets.h'
CELL = 240


def rgb565(img):
    a = np.asarray(img.convert('RGB'), dtype=np.uint16)
    return ((a[..., 0] >> 3) << 11) | ((a[..., 1] >> 2) << 5) | (a[..., 2] >> 3)


def c_array(name, data):
    words = ','.join(f'0x{v:04X}' for v in data.ravel())
    return f'static const uint16_t {name}[] PROGMEM = {{{words}}};\n'


def main():
    room = Image.open(SPRITES / 'room.png').convert('RGBA')
    sheet = Image.open(SPRITES / 'idle.png').convert('RGBA')
    cols, count = 6, 12
    tiles = [sheet.crop((f % cols * CELL, f // cols * CELL, (f % cols + 1) * CELL, (f // cols + 1) * CELL))
             for f in range(count)]

    # общий прямоугольник всех кадров, с запасом в пиксель
    alpha = np.any([np.asarray(t)[..., 3] > 0 for t in tiles], axis=0)
    ys, xs = np.where(alpha)
    x0, y0 = max(0, xs.min() - 1), max(0, ys.min() - 1)
    x1, y1 = min(CELL, xs.max() + 2), min(CELL, ys.max() + 2)

    out = ['// Сгенерировано tools/build_firmware_assets.py — не править руками.\n#pragma once\n#include <Arduino.h>\n\n',
           c_array('ROOM', rgb565(room)),
           f'\nconstexpr int IDLE_X = {x0}, IDLE_Y = {y0}, IDLE_W = {x1 - x0}, IDLE_H = {y1 - y0}, IDLE_FRAMES = {count};\n']
    for f, tile in enumerate(tiles):
        frame = room.copy()
        frame.alpha_composite(tile)
        out.append(c_array(f'IDLE_{f}', rgb565(frame.crop((x0, y0, x1, y1)))))
    out.append('static const uint16_t *const IDLE[] = {' + ', '.join(f'IDLE_{f}' for f in range(count)) + '};\n')
    OUT.write_text(''.join(out))
    kb = (CELL * CELL + count * (x1 - x0) * (y1 - y0)) * 2 // 1024
    print(f'{OUT.relative_to(ROOT)}: комната + {count} кадров {x1 - x0}×{y1 - y0} в ({x0}, {y0}), {kb} КБ')


if __name__ == '__main__':
    main()

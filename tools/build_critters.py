"""Живность для случайных событий: таракан, он же раздавленный, и голубь за окном.

Рисуется по пикселям (как иконки меню в igoryasha_ui.py) и пишется лентами кадров в
assets/sprites/: roach.png (бежит влево, 2 кадра ног), splat.png (1 кадр),
pigeon.png (сидит, кивнул, взлетает — 3 кадра). Оттуда их берут песочница,
веб-игра (build_web_game.py) и прошивка (build_igoryasha_pack.py → IgoryashaAssets.h).

    .venv/bin/python tools/build_critters.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'sprites'

PALETTE = {
    # таракан
    'O': (42, 22, 10), 'B': (128, 70, 30), 'L': (178, 112, 56), 'H': (72, 40, 18), 'A': (58, 34, 16),
    'y': (204, 192, 96),                                                   # то, что из него вышло
    # голубь
    'o': (40, 42, 50), 'g': (150, 156, 168), 'd': (96, 101, 114), 'h': (168, 172, 182), 'n': (92, 142, 124),
    'p': (134, 98, 146), 'e': (232, 142, 40), 'k': (58, 58, 62), 'f': (212, 120, 118), 't': (70, 72, 82),
    # стук по батарее: светлые штрихи с тёмной обводкой
    'w': (250, 240, 200), 'q': (44, 40, 32),
}

ROACH = [[
    'A...................',
    '.A......OOOOOOO.....',
    '..A..OOOHBBBBBBBOO..',
    '...AOHHHBBLLLLBBBBO.',
    '....OHHHBBBBBBBBBBBO',
    '.....OOOBBBBBBBBBOO.',
    '......OOOOOOOOOOO...',
    '.....A...A....A.....',
    '....A...A....A......',
], [
    'A...................',
    '.A......OOOOOOO.....',
    '..A..OOOHBBBBBBBOO..',
    '...AOHHHBBLLLLBBBBO.',
    '....OHHHBBBBBBBBBBBO',
    '.....OOOBBBBBBBBBOO.',
    '......OOOOOOOOOOO...',
    '.......A...A....A...',
    '........A...A....A..',
]]

SPLAT = [[
    '.....y......y.......',
    '...y.OOOOOOOOOO.y...',
    '..yOOHHBBBBBBBBOOy..',
    '.y.OHBBBBLLBBBBBBOy.',
    '..yOOBBBBBBBBBBOOy..',
    '...y.OOOOOOOOOO.y...',
    '....y..y...y..y.....',
]]

_PIGEON_BODY = [
    '..ogggggddddddo..',
    '..ogggggggddddtt.',
    '...ogggggggggottt',
    '....oggggggggo.tt',
    '.....ooooooooo...',
    '......f...f......',
    '.....ff..ff......',
]
PIGEON = [[                              # сидит
    '....ooo..........',
    '...ohhho.........',
    '..ohhheho........',
    '.kkhhhhho........',
    '...onnpno........',
    '...onnppoo.......',
    '...onggggdoo.....',
    '..oggggggdddoo...',
    *_PIGEON_BODY,
], [                                  # кивнул
    '.................',
    '.................',
    '....ooo..........',
    '...ohhho.........',
    '..ohhheho........',
    '.kkhhhhhoo.......',
    '...onnpggdoo.....',
    '..oggggggdddoo...',
    *_PIGEON_BODY,
], [                                  # летит, крылья вверх
    '...d........d....',
    '...dd......dd....',
    '....dd.ooodd.....',
    '.....dohhhod.....',
    '....ohhheho......',
    '...kkhhhhho......',
    '.....onnpo.......',
    '....onnggoo......',
    '....ogggggggoo...',
    '.....ogggggggott.',
    '......oooooooottt',
    '.................',
    '.................',
    '.................',
    '.................',
]]


# Стук соседей по батарее (x 156–210, y 111–143): лучи влево от её бока и чёрточки
# над рёбрами. Лист 72×36 с началом в THUD_AT; кадр 0 — удар, 1 — эхо дальше.
THUD_AT = (140, 104)
THUD_W, THUD_H = 72, 36


def _thud(lines):
    grid = [['.'] * THUD_W for _ in range(THUD_H)]
    for (x0, y0), (x1, y1) in lines:
        n = max(abs(x1 - x0), abs(y1 - y0))
        for i in range(n + 1):
            grid[round(y0 + (y1 - y0) * i / n)][round(x0 + (x1 - x0) * i / n)] = 'w'
    for y in range(THUD_H):                     # обводка, чтобы читалось и на светлых обоях
        for x in range(THUD_W):
            if grid[y][x] == '.' and any(0 <= y + dy < THUD_H and 0 <= x + dx < THUD_W and grid[y + dy][x + dx] == 'w'
                                         for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                grid[y][x] = 'q'
    return [''.join(r) for r in grid]


THUD = [
    _thud([((13, 21), (8, 21)), ((13, 17), (9, 13)), ((13, 25), (9, 29)),
           ((31, 2), (31, 4)), ((46, 2), (46, 4)), ((61, 2), (61, 4))]),
    _thud([((8, 21), (3, 21)), ((8, 14), (5, 10)), ((8, 28), (5, 32)),
           ((26, 2), (25, 4)), ((51, 2), (52, 4)), ((66, 2), (67, 4))]),
]


def strip(frames):
    h, w = len(frames[0]), len(frames[0][0])
    img = Image.new('RGBA', (w * len(frames), h))
    for k, rows in enumerate(frames):
        assert len(rows) == h and all(len(r) == w for r in rows)
        for y, row in enumerate(rows):
            for x, c in enumerate(row):
                if c != '.':
                    img.putpixel((k * w + x, y), PALETTE[c] + (255,))
    return img


CRITTERS = {'roach': ROACH, 'splat': SPLAT, 'pigeon': PIGEON, 'thud': THUD}


def main():
    for name, frames in CRITTERS.items():
        strip(frames).save(OUT / f'{name}.png')
        print(f'{name}: {len(frames)} кадр(а) {len(frames[0][0])}×{len(frames[0])}')


if __name__ == '__main__':
    main()

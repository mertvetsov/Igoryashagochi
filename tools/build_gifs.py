"""GIF-ки 240×240 для стоковой прошивки GeekMagic SmallTV: комната + анимация Игоряши.

Кадры и длительности — те же, что в js/animations.js, скорость как в песочнице по умолчанию.
Запуск: .venv/bin/python tools/build_gifs.py  →  gifs/*.gif
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / 'assets' / 'sprites'
OUT = ROOT / 'gifs'
CELL = 240
SPEED = 1.75   # как ползунок скорости в index.html


def seq(frames, ms):
    return list(zip(frames, ms))


BREATH = [400, 300, 300, 400, 300, 300]
# четыре вдоха, моргание посреди третьего (кадр k+6 — тот же кадр с закрытыми глазами)
IDLE = [(k, ms) for _ in range(4) for k, ms in enumerate(BREATH)]
IDLE[14:14] = [(8, 100)]

WALK = seq(range(24), [450, 170, 170, 170, 170, 170, 280, 170, 170, 170, 170, 170,
                       170, 170, 170, 170, 170, 280, 170, 170, 170, 170, 170, 450])
WALK_PATH = [(0, 0), (1, 0), (6, 44), (7, 44), (17, -44), (18, -44), (23, 0)]

HUNGRY = seq([0, 1, 2, 3, 4, 5, 6, 7, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
             [600, 200, 200, 300, 160, 140, 160, 140, 160, 140, 160, 260,
              300, 350, 200, 300, 250, 250, 450, 600])

EAT_LOOP = list(range(8, 16))
EAT_LOOP_MS = [180, 170, 170, 200, 220, 220, 170, 200]
EAT = seq([*range(8), *EAT_LOOP * 3, 16, 17, 18, 19, 20, 21, 20, 21, 22, 23],
          [500, 220, 220, 260, 260, 300, 350, 300, *EAT_LOOP_MS * 3,
           300, 260, 220, 220, 300, 300, 300, 300, 300, 600])

WIN = seq([*range(19), 17, 18, 19, 20, 21, 22, 23],
          [300, 300, 250, 400, 250, 250, 220, 220, 220, 220, 220, 220,
           220, 220, 220, 220, 220, 300, 300, 300, 300, 250, 300, 300, 400, 700])

GIFS = {
    'idle': ('idle', 6, IDLE, None),
    'walk': ('walk', 6, WALK, WALK_PATH),
    'hungry': ('hungry', 4, HUNGRY, None),
    'eat': ('eat', 6, EAT, None),
    'tanks_win': ('tanks_win', 6, WIN, None),
}


def walk_x(path, frame):
    k = 0
    while k < len(path) - 2 and frame >= path[k + 1][0]:
        k += 1
    (f0, x0), (f1, x1) = path[k], path[k + 1]
    return x0 + (x1 - x0) * min(1, (frame - f0) / (f1 - f0))


def build(name, sheet_name, cols, frames, path):
    room = Image.open(SPRITES / 'room.png').convert('RGBA')
    sheet = Image.open(SPRITES / f'{sheet_name}.png').convert('RGBA')
    images = []
    for frame, _ in frames:
        tile = sheet.crop(((frame % cols) * CELL, frame // cols * CELL,
                           (frame % cols + 1) * CELL, (frame // cols + 1) * CELL))
        img = room.copy()
        img.alpha_composite(tile, (round(walk_x(path, frame)) if path else 0, 0))
        images.append(img.convert('RGB'))

    # одна палитра на всю гифку, без дизеринга — иначе комната мерцает от кадра к кадру
    strip = Image.new('RGB', (CELL, CELL * len(images)))
    for i, img in enumerate(images):
        strip.paste(img, (0, i * CELL))
    palette = strip.quantize(256, method=Image.Quantize.MEDIANCUT)
    paletted = [img.quantize(palette=palette, dither=Image.Dither.NONE) for img in images]

    durations = [max(20, round(ms / SPEED / 10) * 10) for _, ms in frames]
    out = OUT / f'{name}.gif'
    paletted[0].save(out, save_all=True, append_images=paletted[1:], duration=durations,
                     loop=0, optimize=False, disposal=1)
    print(f'{out.name}: {len(frames)} кадров, {sum(durations) / 1000:.1f} с, {out.stat().st_size // 1024} КБ')


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    for name, args in GIFS.items():
        build(name, *args)

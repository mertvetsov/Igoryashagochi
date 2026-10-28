"""Тема-циферблат «Игоряша-часы» для прошивки smalltv-mod (github.com/giovi321/smalltv-mod).

Комната с Игоряшей во весь экран, снизу тёмная плашка с часами и датой. Голова при
дыхании неподвижна, поэтому это две независимые анимации: туловище (цикл одного вдоха)
и глаза (длинный цикл, где изредка моргает). Кадры уже наложены на комнату, поэтому
непрозрачные (2 байта на пиксель), и тема весит около 250 КБ — сжатия формат не знает,
каждый кадр хранится целиком.
Пакет .stheme собирается прямо здесь по формату из docs/features/themes.md.

Запуск: .venv/bin/python tools/build_clock_theme.py
  →  theme/igoryasha-clock.stheme   (ставить: Display → Theme clocks → Install .stheme)
  →  theme/preview.gif              (как это будет выглядеть, 12:34 Wed 28 Oct)
"""
import json
import re
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / 'assets' / 'sprites'
OUT = ROOT / 'theme'
FONT_H = ROOT / 'firmware/.pio/libdeps/smalltv_pro/GFX Library for Arduino/src/font/glcdfont.h'
CELL = 240

# Дыхание: позы 0–5, длительности как в js/animations.js (400/300/300 мс) при 10 кадрах в секунду.
FPS = 10
BREATH = [4, 3, 3, 4, 3, 3]
# Глаза: поза 6 — закрытые. Цикл 20 с, моргает в эти кадры (вторая пара — двойное моргание).
BLINK = 6
EYES_FRAMES = 200   # +20 кадров туловища +2 файла — в пакете не больше 256 записей
BLINK_AT = [35, 98, 100, 162]

# Где меняются кадры (прямоугольники отличий поз в idle.png): туловище и глаза
BODY = (96, 117, 62, 41)
EYES = (119, 86, 20, 5)

PANEL = (4, 203, 236, 237)   # плашка под часами, x0 y0 x1 y1
CLOCK_COLOR, DATE_COLOR = '#f3e6c4', '#b8b48f'

MANIFEST = {
    'spec': 1,
    'theme': {'id': 'igoryasha-clock', 'name': 'Igoryasha Clock', 'author': 'mertvetsov', 'version': '1.0.0'},
    'display': {'width': 240, 'height': 240, 'background': '#000000'},
    'layers': [
        {'id': 'room', 'type': 'image', 'x': 0, 'y': 0, 'source': 'images/room.png'},
        {'id': 'body', 'type': 'animation', 'x': BODY[0], 'y': BODY[1], 'width': BODY[2], 'height': BODY[3],
         'source': 'animations/body', 'frames': sum(BREATH), 'fps': FPS, 'loop': True},
        {'id': 'eyes', 'type': 'animation', 'x': EYES[0], 'y': EYES[1], 'width': EYES[2], 'height': EYES[3],
         'source': 'animations/eyes', 'frames': EYES_FRAMES, 'fps': FPS, 'loop': True},
        {'id': 'clock', 'type': 'text', 'x': 12, 'y': 220, 'anchor': 'center-left',
         'value': '{HH}:{MM}', 'size': 32, 'color': CLOCK_COLOR},
        {'id': 'weekday', 'type': 'text', 'x': 228, 'y': 220, 'anchor': 'bottom-right',
         'value': '{WD}', 'size': 16, 'color': DATE_COLOR},
        {'id': 'date', 'type': 'text', 'x': 228, 'y': 221, 'anchor': 'top-right',
         'value': '{DD} {MON}', 'size': 16, 'color': DATE_COLOR},
    ],
}


def body_sequence():
    return [pose for pose, n in enumerate(BREATH) for _ in range(n)]


def eyes_sequence():
    return [BLINK if i in BLINK_AT else 0 for i in range(EYES_FRAMES)]


def sti(img):
    """Картинка → STI1: RGB565 построчно, альфа отдельным байтом только если она есть."""
    a = np.asarray(img.convert('RGBA'), dtype=np.uint16)
    opaque = bool((a[..., 3] == 255).all())
    px = ((a[..., 0] >> 3) << 11) | ((a[..., 1] >> 2) << 5) | (a[..., 2] >> 3)
    data = b'STI1' + struct.pack('<HHB3x', img.width, img.height, 0 if opaque else 1) + px.astype('<u2').tobytes()
    return data if opaque else data + a[..., 3].astype(np.uint8).tobytes()


def stheme(entries):
    out = bytearray(b'STH1' + struct.pack('<HH', len(entries), 0))
    for path, payload in entries:
        p = path.encode('ascii')
        out += struct.pack('<HI', len(p), len(payload)) + p + payload
    return bytes(out)


# --- превью тем же шрифтом 5×7, что на устройстве -----------------------------------

def load_font():
    body = FONT_H.read_text().split('font[] PROGMEM = {', 1)[1].split('};', 1)[0]
    return [int(v, 16) for v in re.findall(r'0x[0-9A-Fa-f]{2}', body)]


def draw_text(img, font, layer, text):
    size = layer['size']
    cw = (size * 6 + 7) // 8
    w, h = cw * len(text), size
    # якорь «вертикаль-горизонталь», «center» — по центру в обе стороны
    vert, horiz = layer['anchor'].split('-') if '-' in layer['anchor'] else ('center', 'center')
    x = layer['x'] - {'left': 0, 'center': w // 2, 'right': w}[horiz]
    y = layer['y'] - {'top': 0, 'center': h // 2, 'bottom': h}[vert]
    color = tuple(int(layer['color'][i:i + 2], 16) for i in (1, 3, 5)) + (255,)
    px = img.load()
    for i, ch in enumerate(text):
        for dx in range(cw):
            col = font[ord(ch) * 5 + dx * 6 // cw] if dx * 6 // cw < 5 else 0
            for dy in range(h):
                if col & (1 << (dy * 8 // h)):
                    xx, yy = x + i * cw + dx, y + dy
                    if 0 <= xx < CELL and 0 <= yy < CELL:
                        px[xx, yy] = color


def main():
    room = Image.open(SPRITES / 'room.png').convert('RGBA')
    sheet = Image.open(SPRITES / 'idle.png').convert('RGBA')
    poses = [sheet.crop((f % 6 * CELL, f // 6 * CELL, (f % 6 + 1) * CELL, (f // 6 + 1) * CELL)) for f in range(12)]

    # фон: комната + Игоряша в позе 0 + полупрозрачная тёмная плашка
    bg = room.copy()
    bg.alpha_composite(poses[0])
    panel = Image.new('RGBA', bg.size)
    ImageDraw.Draw(panel).rounded_rectangle(PANEL, radius=8, fill=(16, 18, 14, 170))
    bg.alpha_composite(panel)
    bg = bg.convert('RGB')

    scenes = []
    for pose in poses:
        f = room.copy()
        f.alpha_composite(pose)
        scenes.append(f.convert('RGB'))
    layers = []   # (имя, прямоугольник, последовательность поз)
    for name, (x, y, w, h), seq in (('body', BODY, body_sequence()), ('eyes', EYES, eyes_sequence())):
        layers.append((name, (x, y, x + w, y + h), seq))

    manifest = MANIFEST
    entries = [('theme.json', json.dumps(manifest, separators=(',', ':')).encode()),
               ('images/room.png.sti', sti(bg))]
    for name, box, seq in layers:
        entries += [(f'animations/{name}/{i:03d}.png.sti', sti(scenes[p].crop(box))) for i, p in enumerate(seq)]
    assert len(entries) <= 256

    OUT.mkdir(exist_ok=True)
    pkg = stheme(entries)
    assert len(pkg) <= 3 * 1024 * 1024
    (OUT / 'igoryasha-clock.stheme').write_bytes(pkg)

    # превью: полный цикл глаз (дыхание крутится внутри), время подставлено
    font = load_font()
    values = {'clock': '12:34', 'weekday': 'Wed', 'date': '28 Oct'}
    frames = []
    for i in range(EYES_FRAMES):
        f = bg.copy().convert('RGBA')
        for name, box, seq in layers:
            f.paste(scenes[seq[i % len(seq)]].crop(box), box[:2])
        for layer in manifest['layers'][3:]:
            draw_text(f, font, layer, values[layer['id']])
        frames.append(f.convert('RGB').resize((480, 480), Image.NEAREST))
    frames[0].save(OUT / 'preview.gif', save_all=True, append_images=frames[1:], duration=1000 // FPS, loop=0)
    frames[0].save(OUT / 'preview.png')

    print(f'theme/igoryasha-clock.stheme: {len(entries) - 2} кадров, {len(pkg) // 1024} КБ')


if __name__ == '__main__':
    main()

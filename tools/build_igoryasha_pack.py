"""Ассеты режима «Игоряша» для форка smalltv-mod (папка smalltv-mod/, ветка igoryasha).

Делает две вещи:
  smalltv-mod/src/features/igoryasha/IgoryashaAssets.h — комната с плашкой часов в RGB565
      (живёт в прошивке) и кириллические буквы 5×7 для даты;
  pack/igoryasha.bin — пак анимаций, который грузится на флешку устройства через веб-интерфейс.

Пак: на каждый лист — общий прямоугольник всех его кадров (координаты ячейки 240×240),
палитра до 64 цветов (индекс 0 — прозрачный) и кадры как raw deflate индексов;
прошивка распаковывает их tinfl из ПЗУ ESP32. Дальше — сценарии из js/animations.js:
шаги (лист, кадр, мс, сдвиг по x), куда можно перейти после и когда их играть.

Формат (little endian):
  "IGR1" u8 листов, u8 сценариев
  лист:     u16 x, y, w, h; u8 цветов, u8 кадров; u16 палитра[цветов]; u32 смещение[кадров], u32 длина[кадров]
  сценарий: char имя[12]; u8 флаги; u8 переходов, u8 переход[4]; u16 шагов; шаг: u8 лист, u8 кадр, u16 мс, i16 dx
  данные кадров (смещения от начала файла)

Запуск: .venv/bin/python tools/build_igoryasha_pack.py
"""
import struct
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / 'assets' / 'sprites'
PACK = ROOT / 'pack' / 'igoryasha.bin'
HEADER = ROOT / 'smalltv-mod' / 'src' / 'features' / 'igoryasha' / 'IgoryashaAssets.h'
CELL = 240
COLORS = 64

PANEL = (4, 203, 236, 237)   # плашка под часами, x0 y0 x1 y1 — как в теме-циферблате
PANEL_Y = PANEL[1]

# листы: имя → колонки, кадры (как в js/animations.js)
SHEETS = {
    'idle': (6, 12), 'hungry': (4, 16), 'walk': (6, 24), 'poop': (4, 16), 'eat': (6, 24),
    'sick': (6, 24), 'tanks': (6, 24), 'tanks_win': (6, 24), 'tanks_lose': (6, 24),
    'love': (8, 24), 'sleep': (6, 24), 'sad': (6, 24), 'pill': (4, 16),
    'pile': (6, 6),   # кучка в углу: кадр = размер, уже стоит на своём месте на полу
}
SHEET_IDS = {name: i for i, name in enumerate(SHEETS)}

ENTRY, NIGHT = 1, 2   # флаги сценария: можно выбрать случайно; подходит для ночи


def rng(n, start=0):
    return list(range(start, start + n))


def steps(sheet, frames, ms, path=None):
    """Шаги сценария. path — [кадр, сдвиг] как у ходьбы: сдвиг между точками линейный."""
    ms = ms if isinstance(ms, list) else [ms] * len(frames)
    out = []
    for f, d in zip(frames, ms):
        dx = 0
        if path:
            k = 0
            while k < len(path) - 2 and f >= path[k + 1][0]:
                k += 1
            (f0, x0), (f1, x1) = path[k], path[k + 1]
            dx = round(x0 + (x1 - x0) * min(1, (f - f0) / (f1 - f0)))
        out.append((SHEET_IDS[sheet], f, d, dx))
    return out


def scripts():
    hungry = steps('hungry', [0, 1, 2, 3, 4, 5, 6, 7, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
                   [600, 200, 200, 300, 160, 140, 160, 140, 160, 140, 160, 260, 300, 350, 200, 300, 250, 250, 450, 600])
    eat_loop, eat_loop_ms = rng(8, 8), [180, 170, 170, 200, 220, 220, 170, 200]
    eat = steps('eat', [*rng(8), *eat_loop * 3, 16, 17, 18, 19, 20, 21, 20, 21, 22, 23],
                [500, 220, 220, 260, 260, 300, 350, 300, *eat_loop_ms * 3, 300, 260, 220, 220, 300, 300, 300, 300, 300, 600])
    tanks_loop, tanks_loop_ms = rng(12, 12), [130, 220, 130, 220, 130, 240, 130, 220, 130, 130, 160, 130]
    tanks = steps('tanks', [*rng(12), *tanks_loop * 3],
                  [500, 250, 250, 300, 250, 250, 300, 250, 250, 250, 250, 250, *tanks_loop_ms * 3])
    win = steps('tanks_win', [*rng(19), 17, 18, 19, 20, 21, 22, 23],
                [300, 300, 250, 400, 250, 250, 220, 220, 220, 220, 220, 220, 220, 220, 220, 220, 220, 300, 300, 300, 300,
                 250, 300, 300, 400, 700])
    lose = steps('tanks_lose', rng(24), [200, 200, 250, 300, 250, 250, 250, 250, 300, 350, 400, 350,
                                         250, 250, 350, 250, 450, 350, 350, 500, 350, 350, 350, 700])
    love_loop, love_loop_ms = rng(8, 8), [240, 240, 380, 240, 240, 380, 240, 240]
    love = steps('love', [*rng(8), *love_loop * 3, *rng(8, 16)],
                 [500, 300, 350, 400, 500, 350, 450, 350, *love_loop_ms * 3, 450, 300, 250, 350, 350, 400, 400, 600])
    sleep_loop, sleep_loop_ms = rng(8, 8), [320, 300, 360, 420, 300, 300, 360, 420]
    sleep_in_ms, sleep_out_ms = [500, 450, 650, 350, 350, 400, 400, 500], [400, 650, 350, 500, 350, 350, 400, 600]
    sleep = steps('sleep', [*rng(8), *sleep_loop * 4, *rng(8, 16)], [*sleep_in_ms, *sleep_loop_ms * 4, *sleep_out_ms])
    # ночной сон по частям: лёг, храпит (прошивка крутит до утра), встал
    sleep_in = steps('sleep', rng(8), sleep_in_ms)
    sleep_snore = steps('sleep', sleep_loop, sleep_loop_ms)
    sleep_out = steps('sleep', rng(8, 16), sleep_out_ms)
    # злой спросонья: подходит к стеклу и колотит в него кулаком (кадры «голода»), потом отходит
    bang, bang_ms = [4, 5, 6, 7], [160, 140, 160, 140]
    angry = steps('hungry', [0, 1, 2, 3, *bang * 4, 3, 2, 1, 0], [400, 200, 200, 250, *bang_ms * 4, 250, 200, 200, 400])
    # кучка: не сценарий, а таблица кадров листа по размеру 1…6
    pile = steps('pile', rng(6), 0)
    sob, sob_ms = [6, 7, 8, 9, 11, 12, 13, 14, 15, 16], [300, 260, 240, 320, 380, 300, 260, 240, 300, 340]
    sad = steps('sad', [*rng(6), *sob * 2, *rng(6, 18)], [600, 450, 450, 400, 450, 450, *sob_ms * 2, 450, 500, 450, 450, 500, 700])
    hop, hop_ms = [11, 12, 13], [120, 150, 110]
    pill = steps('pill', [1, 2, 3, 4, 5, 6, 7, 6, 7, 8, 9, 10, *hop * 6, 10],
                 [1300, 350, 450, 380, 380, 260, 260, 260, 260, 500, 600, 400, *hop_ms * 6, 500])
    poop = steps('poop', rng(16), [500, 220, 220, 250, 300, 300, 300, 300, 400, 450, 400, 300, 250, 300, 300, 600])
    sick = steps('sick', rng(24), [600, 300, 300, 350, 350, 450, 300, 250, 160, 160, 140, 140,
                                   140, 160, 180, 300, 350, 400, 400, 350, 350, 350, 350, 600])
    walk = steps('walk', rng(24), [450, 170, 170, 170, 170, 170, 280, 170, 170, 170, 170, 170,
                                   170, 170, 170, 170, 170, 280, 170, 170, 170, 170, 170, 450],
                 path=[[0, 0], [1, 0], [6, 44], [7, 44], [17, -44], [18, -44], [23, 0]])
    # статика: один вдох, моргание и повторы — в прошивке
    idle = steps('idle', rng(6), [400, 300, 300, 400, 300, 300])
    # имя, флаги, переходы, шаги; idle обязательно первым
    return [
        ('idle', 0, [], idle),
        ('walk', ENTRY, [], walk),
        ('hungry', ENTRY, [], hungry),
        ('eat', ENTRY, [], eat),
        ('sick', ENTRY, [], sick),
        ('tanks', ENTRY, ['tanks_win', 'tanks_lose'], tanks),
        ('tanks_win', 0, [], win),
        ('tanks_lose', 0, [], lose),
        ('love', ENTRY, [], love),
        ('sleep', 0, [], sleep),
        ('sleep_in', 0, [], sleep_in),
        ('sleep_snore', 0, [], sleep_snore),
        ('sleep_out', 0, [], sleep_out),
        ('angry', 0, [], angry),
        ('pile', 0, [], pile),
        ('sad', ENTRY, [], sad),
        ('pill', ENTRY, [], pill),
        ('poop', ENTRY, [], poop),
    ]


def rgb565(rgb):
    r, g, b = (np.asarray(rgb, dtype=np.uint16)[..., i] for i in range(3))
    return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)


def build_sheet(name, cols, count):
    img = Image.open(SPRITES / f'{name}.png').convert('RGBA')
    alpha = np.asarray(img)[..., 3]
    q = img.convert('RGB').quantize(COLORS - 1, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    idx = np.asarray(q).astype(np.uint8) + 1
    idx[alpha < 128] = 0
    palette = np.array(q.getpalette()[:3 * (COLORS - 1)], dtype=np.uint8).reshape(-1, 3)
    tiles = [idx[f // cols * CELL:(f // cols + 1) * CELL, f % cols * CELL:(f % cols + 1) * CELL] for f in range(count)]
    ys, xs = np.where(np.any([t > 0 for t in tiles], axis=0))
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    frames = []
    for t in tiles:
        c = zlib.compressobj(9, zlib.DEFLATED, -15)
        frames.append(c.compress(t[y0:y1, x0:x1].tobytes()) + c.flush())
    colors = [0] + [int(v) for v in rgb565(palette)]
    return (int(x0), int(y0), int(x1 - x0), int(y1 - y0)), colors, frames


def build_pack():
    sheets = [build_sheet(n, *SHEETS[n]) for n in SHEETS]
    scr = scripts()
    ids = {name: i for i, (name, *_) in enumerate(scr)}

    head = bytearray(b'IGR1' + struct.pack('<BB', len(sheets), len(scr)))
    size = len(head)
    for (_, colors, frames) in sheets:
        size += 8 + 2 + 2 * len(colors) + 8 * len(frames)
    for (_, _, _, st) in scr:
        size += 12 + 1 + 1 + 4 + 2 + 6 * len(st)
    offset, blobs = size, []
    for (x, y, w, h), colors, frames in sheets:
        head += struct.pack('<HHHHBB', x, y, w, h, len(colors), len(frames))
        head += struct.pack(f'<{len(colors)}H', *colors)
        offs = []
        for f in frames:
            offs.append(offset)
            offset += len(f)
            blobs.append(f)
        head += struct.pack(f'<{len(frames)}I', *offs) + struct.pack(f'<{len(frames)}I', *map(len, frames))
    for name, flags, nxt, st in scr:
        head += name.encode().ljust(12, b'\0')[:12]
        head += struct.pack('<BB', flags, len(nxt)) + bytes([ids[n] for n in nxt] + [0] * (4 - len(nxt)))
        head += struct.pack('<H', len(st)) + b''.join(struct.pack('<BBHh', *s) for s in st)
    assert len(head) == size
    PACK.parent.mkdir(exist_ok=True)
    PACK.write_bytes(bytes(head) + b''.join(blobs))
    biggest = max(w * h for (_, _, w, h), _, _ in sheets)
    longest = max(len(f) for _, _, frames in sheets for f in frames)
    return len(head) + sum(map(len, blobs)), biggest, longest


# --- кириллица для даты: 5×7 в стиле встроенного шрифта (латинские двойники берутся из него) ---
GLYPHS = {
    'П': ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#'],
    'Ч': ['#...#', '#...#', '#...#', '.####', '....#', '....#', '....#'],
    'Б': ['#####', '#....', '#....', '####.', '#...#', '#...#', '####.'],
    'Я': ['.####', '#...#', '#...#', '.####', '..#.#', '.#..#', '#...#'],
    'Ф': ['..#..', '.###.', '#.#.#', '#.#.#', '.###.', '..#..', '..#..'],
    'Д': ['.###.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '#####', '#...#'],
    'И': ['#...#', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#'],
    'Ю': ['#..#.', '#.#.#', '#.#.#', '###.#', '#.#.#', '#.#.#', '#..#.'],
    'Л': ['..###', '.#..#', '.#..#', '.#..#', '.#..#', '.#..#', '#...#'],
    'Г': ['#####', '#....', '#....', '#....', '#....', '#....', '#....'],
}
WEEKDAYS = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']   # как tm_wday
MONTHS = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЯ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК']
LATIN = dict(zip('АВЕКМНОРСТ', 'ABEKMHOPCT'))


def encode_label(text):
    """Буквы как байты: латинские двойники — их ASCII, свои глифы — 0x80 + номер."""
    order = list(GLYPHS)
    return [ord(LATIN[c]) if c in LATIN else 0x80 + order.index(c) if c in GLYPHS else ord(c) for c in text]


def glyph_columns(rows):
    return [sum(1 << y for y in range(7) if rows[y][x] == '#') for x in range(5)]


def build_header():
    room = Image.open(SPRITES / 'room.png').convert('RGBA')
    panel = Image.new('RGBA', room.size)
    ImageDraw.Draw(panel).rounded_rectangle(PANEL, radius=8, fill=(16, 18, 14, 170))
    room.alpha_composite(panel)
    px = rgb565(np.asarray(room.convert('RGB'))).ravel()
    words = ','.join(f'0x{v:04X}' for v in px)
    glyphs = '\n'.join('  {' + ', '.join(f'0x{c:02X}' for c in glyph_columns(r)) + '},' + f'  // {ch}'
                       for ch, r in GLYPHS.items())
    label = lambda t: '{' + ', '.join(str(b) for b in encode_label(t)) + ', 0}'
    HEADER.parent.mkdir(parents=True, exist_ok=True)
    HEADER.write_text(
        '// Сгенерировано tools/build_igoryasha_pack.py (в проекте Игоряшгочи) — не править руками.\n'
        '#pragma once\n#include <Arduino.h>\n\n'
        f'#define IGR_PANEL_Y {PANEL_Y}\n\n'
        '// Комната 240×240 с плашкой часов, RGB565.\n'
        f'static const uint16_t IGR_ROOM[] PROGMEM = {{{words}}};\n\n'
        '// Свои буквы 5×7: столбцы слева направо, бит 0 — верхняя строка. Код в подписи — 0x80 + номер.\n'
        f'static const uint8_t IGR_GLYPHS[][5] = {{\n{glyphs}\n}};\n\n'
        f'static const uint8_t IGR_WEEKDAYS[7][3] = {{{", ".join(label(w) for w in WEEKDAYS)}}};\n'
        f'static const uint8_t IGR_MONTHS[12][4] = {{{", ".join(label(m) for m in MONTHS)}}};\n')


def main():
    size, biggest, longest = build_pack()
    build_header()
    print(f'{PACK.relative_to(ROOT)}: {size // 1024} КБ (кадр до {biggest} пикселей, сжатый до {longest} байт)')
    print(f'{HEADER.relative_to(ROOT)}: комната и буквы')


if __name__ == '__main__':
    main()

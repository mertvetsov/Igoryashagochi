"""Интерфейс Игоряши на экране SmallTV: иконки меню, русский шрифт 5×7, пузырь реплики.

Модуль общий для превью (запуск этого файла → preview/ui_*.png) и для сборщика
прошивки (build_igoryasha_pack.py берёт отсюда глифы и иконки), чтобы на экране
было ровно то, что утверждено на превью.

Шрифт — в той же сетке, что встроенный шрифт прошивки (glcdfont 5×7 в клетке 6×8,
строки 0–6 — заглавные, 2–6 — строчные, 7 — хвосты у р, у, д, ц, щ). Латиница,
цифры и знаки берутся из него; из кириллицы свои только буквы, которых там нет,
двойники вроде А/a, Е/e, О/o, Р/p, С/c берутся из латиницы.
"""
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
GLCD = ROOT / 'firmware/.pio/libdeps/smalltv_pro/GFX Library for Arduino/src/font/glcdfont.h'

# --- шрифт ---------------------------------------------------------------------------

U = lambda *rows: list(rows) + ['.....']          # заглавная: 7 строк + пустая под хвосты
CYR = {
    'Б': U('#####', '#....', '#....', '####.', '#...#', '#...#', '####.'),
    'Г': U('#####', '#....', '#....', '#....', '#....', '#....', '#....'),
    'Д': U('.###.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '#####', '#...#'),
    'Ё': U('.#.#.', '#####', '#....', '####.', '#....', '#....', '#####'),
    'Ж': U('#.#.#', '#.#.#', '#.#.#', '.###.', '#.#.#', '#.#.#', '#.#.#'),
    'З': U('.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'),
    'И': U('#...#', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#'),
    'Й': U('#.#.#', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#'),
    'Л': U('..###', '.#..#', '.#..#', '.#..#', '.#..#', '.#..#', '#...#'),
    'П': U('#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#'),
    'У': U('#...#', '#...#', '#...#', '.####', '....#', '#...#', '.###.'),
    'Ф': U('..#..', '.###.', '#.#.#', '#.#.#', '.###.', '..#..', '..#..'),
    'Ц': U('#..#.', '#..#.', '#..#.', '#..#.', '#..#.', '#####', '....#'),
    'Ч': U('#...#', '#...#', '#...#', '.####', '....#', '....#', '....#'),
    'Ш': U('#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####'),
    'Щ': U('#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####', '....#'),
    'Ъ': U('##...', '.#...', '.#...', '.###.', '.#..#', '.#..#', '.###.'),
    'Ы': U('#...#', '#...#', '#...#', '###.#', '#.#.#', '#.#.#', '###.#'),
    'Ь': U('#....', '#....', '#....', '####.', '#...#', '#...#', '####.'),
    'Э': U('.###.', '#...#', '....#', '.####', '....#', '#...#', '.###.'),
    'Ю': U('#..#.', '#.#.#', '#.#.#', '###.#', '#.#.#', '#.#.#', '#..#.'),
    'Я': U('.####', '#...#', '#...#', '.####', '..#.#', '.#..#', '#...#'),
    'б': ['...##', '.##..', '#....', '####.', '#...#', '#...#', '.###.', '.....'],
    'в': ['.....', '.....', '####.', '#...#', '####.', '#...#', '####.', '.....'],
    'г': ['.....', '.....', '#####', '#....', '#....', '#....', '#....', '.....'],
    'д': ['.....', '.....', '.###.', '.#.#.', '.#.#.', '.#.#.', '#####', '#...#'],
    'ё': ['.#.#.', '.....', '.###.', '#...#', '#####', '#....', '.###.', '.....'],
    'ж': ['.....', '.....', '#.#.#', '#.#.#', '.###.', '#.#.#', '#.#.#', '.....'],
    'з': ['.....', '.....', '####.', '....#', '.###.', '....#', '####.', '.....'],
    'и': ['.....', '.....', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.....'],
    'й': ['.#.#.', '..#..', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.....'],
    'к': ['.....', '.....', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '.....'],
    'л': ['.....', '.....', '..###', '.#..#', '.#..#', '.#..#', '#...#', '.....'],
    'м': ['.....', '.....', '#...#', '##.##', '#.#.#', '#...#', '#...#', '.....'],
    'н': ['.....', '.....', '#...#', '#...#', '#####', '#...#', '#...#', '.....'],
    'п': ['.....', '.....', '#####', '#...#', '#...#', '#...#', '#...#', '.....'],
    'т': ['.....', '.....', '#####', '..#..', '..#..', '..#..', '..#..', '.....'],
    'ф': ['..#..', '..#..', '.###.', '#.#.#', '#.#.#', '#.#.#', '.###.', '..#..'],
    'ц': ['.....', '.....', '#..#.', '#..#.', '#..#.', '#..#.', '#####', '....#'],
    'ч': ['.....', '.....', '#...#', '#...#', '.####', '....#', '....#', '.....'],
    'ш': ['.....', '.....', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####', '.....'],
    'щ': ['.....', '.....', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####', '....#'],
    'ъ': ['.....', '.....', '##...', '.#...', '.###.', '.#..#', '.###.', '.....'],
    'ы': ['.....', '.....', '#...#', '#...#', '###.#', '#.#.#', '###.#', '.....'],
    'ь': ['.....', '.....', '#....', '#....', '####.', '#...#', '####.', '.....'],
    'э': ['.....', '.....', '.###.', '#...#', '..###', '#...#', '.###.', '.....'],
    'ю': ['.....', '.....', '#..#.', '#.#.#', '###.#', '#.#.#', '#..#.', '.....'],
    'я': ['.....', '.....', '.####', '#...#', '.####', '.#..#', '#...#', '.....'],
}
# кириллица, у которой есть латинский двойник во встроенном шрифте
LATIN = dict(zip('АВЕКМНОРСТХаеорсух', 'ABEKMHOPCTXaeopcyx'))
CYR_ORDER = list(CYR)                              # номер своей буквы n → код 0x80 + n


def glcd():
    body = GLCD.read_text().split('font[] PROGMEM = {', 1)[1].split('};', 1)[0]
    return [int(v, 16) for v in re.findall(r'0x[0-9A-Fa-f]{2}', body)]


def clean(text):
    """То, что шрифт умеет: многоточие и кавычки — в ASCII."""
    return text.replace('…', '...').replace('«', '"').replace('»', '"').replace('—', '-')


def encode(text):
    """Строка → байты прошивки: ASCII как есть, своя буква — 0x80 + номер."""
    out = []
    for ch in clean(text):
        if ch in LATIN:
            out.append(ord(LATIN[ch]))
        elif ch in CYR:
            out.append(0x80 + CYR_ORDER.index(ch))
        elif ord(ch) < 128:
            out.append(ord(ch))
        else:
            raise ValueError(f'нет глифа для {ch!r} в {text!r}')
    return out


def glyph_columns(ch, font):
    """Пять столбцов по 8 бит (бит 0 — верх), как в glcdfont."""
    if ch in LATIN:
        ch = LATIN[ch]
    if ch in CYR:
        rows = CYR[ch]
        return [sum(1 << y for y in range(8) if rows[y][x] == '#') for x in range(5)]
    return font[ord(ch) * 5:ord(ch) * 5 + 5]


def draw_text(img, text, x, y, scale, color, font):
    for i, ch in enumerate(clean(text)):
        for cx, col in enumerate(glyph_columns(ch, font)):
            for cy in range(8):
                if col >> cy & 1:
                    ImageDraw.Draw(img).rectangle((x + (i * 6 + cx) * scale, y + cy * scale,
                                                   x + (i * 6 + cx + 1) * scale - 1, y + (cy + 1) * scale - 1), fill=color)


def wrap(text, chars):
    lines, line = [], ''
    for word in clean(text).split(' '):
        nxt = f'{line} {word}' if line else word
        if line and len(nxt) > chars:
            lines.append(line)
            line = word
        else:
            line = nxt
    return lines + [line]


# --- иконки меню 22×22: рисуются кодом, с тёмной обводкой -------------------------------

ICON = 22
INK = (34, 30, 26)


def _outline(img):
    px = img.load()
    solid = {(x, y) for x in range(ICON) for y in range(ICON) if px[x, y][3]}
    for x, y in [(x + dx, y + dy) for x, y in solid for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]:
        if 0 <= x < ICON and 0 <= y < ICON and (x, y) not in solid:
            px[x, y] = INK + (255,)
    return img


def icon(name):
    img = Image.new('RGBA', (ICON, ICON))
    d = ImageDraw.Draw(img)
    if name == 'fork':
        c, s = (236, 232, 214), (170, 166, 150)
        for tx in (6, 9, 12, 15):
            d.rectangle((tx, 2, tx + 1, 8), fill=c)
        d.rectangle((6, 8, 16, 10), fill=c)
        d.rectangle((8, 11, 14, 12), fill=c)
        d.rectangle((10, 12, 12, 20), fill=c)
        d.line((12, 12, 12, 20), fill=s)
    elif name == 'broom':
        d.line((19, 2, 12, 10), fill=(140, 96, 52), width=2)
        d.rectangle((9, 10, 14, 12), fill=(200, 60, 50))
        d.polygon([(8, 13), (15, 13), (19, 20), (4, 20)], fill=(240, 196, 70))
        for bx in (7, 10, 13, 16):
            d.line((bx - 1, 15, bx - 2 + (bx - 11) // 3, 20), fill=(190, 140, 40))
    elif name == 'pill':
        px = img.load()
        for y in range(ICON):
            for x in range(ICON):
                t = ((x - 10.5) - (y - 10.5)) / 2 ** .5      # вдоль оси капсулы
                n = ((x - 10.5) + (y - 10.5)) / 2 ** .5      # поперёк
                t2 = max(abs(t) - 5.5, 0)
                if t2 * t2 + n * n <= 4.6 ** 2:
                    red = t < 0
                    shade = n > 2.2
                    rgb = ((150, 30, 40) if shade else (226, 62, 62)) if red else \
                          ((190, 190, 196) if shade else (246, 246, 250))
                    px[x, y] = rgb + (255,)
        img.putpixel((7, 11), (255, 170, 170, 255))
        img.putpixel((8, 10), (255, 170, 170, 255))
    elif name == 'heart':
        px = img.load()
        for y in range(ICON):
            for x in range(ICON):
                u, v = (x - 10.5) / 9, (9.5 - y) / 9
                if (u * u + v * v - 0.6) ** 3 - u * u * v ** 3 <= 0:
                    px[x, y] = (222, 52, 64, 255)
        for p in ((5, 6), (6, 5), (6, 6), (5, 7)):
            img.putpixel(p, (255, 170, 180, 255))
    elif name == 'tank':
        d.rectangle((14, 7, 20, 8), fill=(60, 74, 44))                       # ствол
        d.ellipse((6, 4, 15, 12), fill=(96, 122, 64))                         # башня
        d.polygon([(2, 11), (20, 11), (18, 15), (4, 15)], fill=(120, 150, 80))
        d.rounded_rectangle((2, 15, 20, 20), radius=2, fill=(56, 56, 50))     # гусеница
        for wx in (5, 9, 13, 17):
            d.point((wx, 17), fill=(150, 150, 140))
            d.point((wx, 18), fill=(150, 150, 140))
    elif name == 'stats':
        for x0, top, c, hi in ((3, 12, (120, 190, 90), (170, 225, 140)), (9, 4, (245, 197, 66), (255, 228, 140)),
                               (15, 8, (226, 90, 70), (250, 150, 130))):
            d.rectangle((x0, top, x0 + 4, 19), fill=c)                       # столбик
            d.line((x0, top, x0, 19), fill=hi)                               # блик
        d.rectangle((1, 20, 20, 20), fill=(236, 232, 214))                  # ось
    return _outline(img)


MENU = ['fork', 'broom', 'pill', 'heart', 'tank', 'stats']


def dim(img):
    """Недоступный пункт: серый и тёмный."""
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a:
                v = (r + g + b) // 6 + 28
                px[x, y] = (v, v, v - 4, a)
    return img


# --- превью ------------------------------------------------------------------------------

MENU_BOX = (4, 4, 236, 38)           # как плашка часов, только сверху
SLOT = 38
FRAME = 32                           # рамка выделения, иконка ровно по центру


def menu_layer(sel, disabled):
    layer = Image.new('RGBA', (240, 240))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(MENU_BOX, radius=8, fill=(16, 18, 14, 200))
    x0 = MENU_BOX[0] + (MENU_BOX[2] - MENU_BOX[0] + 1 - SLOT * len(MENU)) // 2
    cy = (MENU_BOX[1] + MENU_BOX[3] + 1) // 2
    for k, name in enumerate(MENU):
        cx = x0 + k * SLOT + SLOT // 2
        if k == sel:
            d.rounded_rectangle((cx - FRAME // 2, cy - FRAME // 2, cx + FRAME // 2 - 1, cy + FRAME // 2 - 1),
                                radius=6, fill=(62, 66, 54, 255), outline=(245, 197, 66, 255), width=2)
        im = icon(name)
        if name in disabled:
            im = dim(im)
        layer.alpha_composite(im, (cx - ICON // 2, cy - ICON // 2))
    return layer


BUBBLE_INK, BUBBLE_BG = (34, 40, 30), (239, 241, 220)


def bubble_layer(text, font, scale=2, head_x=119):
    layer = Image.new('RGBA', (240, 240))
    chars = (232 - 12) // (6 * scale)
    lines = wrap(text, chars)
    w = max(len(l) for l in lines) * 6 * scale - scale + 12
    h = len(lines) * 9 * scale + 10
    x, y = (240 - w) // 2, 6
    d = ImageDraw.Draw(layer)
    d.rectangle((x - 1, y - 1, x + w, y + h), fill=BUBBLE_INK)
    d.polygon([(head_x - 7, y + h), (head_x + 7, y + h), (head_x, y + h + 9)], fill=BUBBLE_INK)
    d.rectangle((x, y, x + w - 1, y + h - 1), fill=BUBBLE_BG)
    d.polygon([(head_x - 6, y + h - 1), (head_x + 6, y + h - 1), (head_x, y + h + 7)], fill=BUBBLE_BG)
    for i, l in enumerate(lines):
        lx = (240 - (len(l) * 6 * scale - scale)) // 2
        draw_text(layer, l, lx, y + 6 + i * 9 * scale, scale, BUBBLE_INK + (255,), font)
    return layer


def scene(pile=True):
    sp = ROOT / 'assets' / 'sprites'
    im = Image.open(sp / 'room.png').convert('RGBA')
    if pile:
        im.alpha_composite(Image.open(sp / 'pile.png').convert('RGBA').crop((480, 0, 720, 240)))
    im.alpha_composite(Image.open(sp / 'idle.png').convert('RGBA').crop((0, 0, 240, 240)))
    p = Image.new('RGBA', im.size)
    ImageDraw.Draw(p).rounded_rectangle((4, 203, 236, 237), radius=8, fill=(16, 18, 14, 170))
    im.alpha_composite(p)
    return im


def main():
    font = glcd()
    out = ROOT / 'preview'
    out.mkdir(exist_ok=True)
    big = lambda im: im.convert('RGB').resize((im.width * 2, im.height * 2), Image.NEAREST)

    # меню: с кучкой (выбрана вилка, метла) и на чистом полу (сердце, танк)
    shots = []
    for sel, pile in ((0, True), (1, True), (2, False), (3, False), (4, False)):
        im = scene(pile)
        im.alpha_composite(menu_layer(sel, ('heart', 'tank') if pile else ('broom',)))
        shots.append(big(im))
    sheet = Image.new('RGB', (len(shots) * 496 + 16, 512), (240, 240, 236))
    for i, s in enumerate(shots):
        sheet.paste(s, (16 + i * 496, 16))
    sheet.save(out / 'ui_menu.png')

    icons = Image.new('RGBA', (len(MENU) * 26 + 4, 26), (30, 32, 28, 255))
    for k, n in enumerate(MENU):
        icons.alpha_composite(icon(n), (4 + k * 26, 2))
    icons.convert('RGB').resize((icons.width * 8, icons.height * 8), Image.NEAREST).save(out / 'ui_icons.png')

    # шрифт: весь алфавит и пара реплик, ×3
    lines = ['АБВГДЕЁЖЗИЙКЛМНОП', 'РСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмноп', 'рстуфхцчшщъыьэюя',
             '0123456789 .,!?-:', 'Ой вей, я голодный!', 'Арта, ну ёпт.', 'Я на жёстких бизиках!']
    f = Image.new('RGBA', (20 * 18 + 12, len(lines) * 30 + 12), (30, 32, 28, 255))
    for i, l in enumerate(lines):
        draw_text(f, l, 6, 6 + i * 30, 3, (239, 241, 220, 255), font)
    f.convert('RGB').save(out / 'ui_font.png')

    # реплики на экране
    says = []
    for text, pile in (('Ой вей, я голодный!', False), ('Ой вей, никто меня не любит...', True),
                       ('Ахаха, то есть мяу!', False)):
        im = scene(pile)
        im.alpha_composite(bubble_layer(text, font))
        says.append(big(im))
    sheet = Image.new('RGB', (len(says) * 496 + 16, 512), (240, 240, 236))
    for i, s in enumerate(says):
        sheet.paste(s, (16 + i * 496, 16))
    sheet.save(out / 'ui_speech.png')
    print('preview/ui_menu.png, ui_icons.png, ui_font.png, ui_speech.png')


if __name__ == '__main__':
    main()

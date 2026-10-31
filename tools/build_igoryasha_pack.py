"""Ассеты режима «Игоряша» для форка smalltv-mod (папка smalltv-mod/, ветка igoryasha).

Делает две вещи:
  smalltv-mod/src/features/igoryasha/IgoryashaAssets.h — комната с плашкой часов в RGB565
      (живёт в прошивке); IgoryashaText.h — русский шрифт 5×7, иконки меню и реплики
      (их рисует tools/igoryasha_ui.py, он же делает превью);
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
TEXT_HEADER = HEADER.with_name('IgoryashaText.h')
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
    'dance': (6, 24), 'tv': (6, 24), 'scratch': (4, 16), 'scared': (4, 16),
    'love2': (6, 24),
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
    # другой акт любви: отворачивается и садится спиной (0–9), раскачивается 10–17
    # три раза, встаёт и поворачивается довольный (18–23); прошивка выбирает
    # между love и love2 случайно
    love2_loop, love2_loop_ms = rng(8, 10), [260, 240, 320, 240, 260, 240, 320, 240]
    love2 = steps('love2', [*rng(10), *love2_loop * 3, *rng(6, 18)],
                  [500, 250, 250, 300, 300, 350, 400, 350, 350, 450, *love2_loop_ms * 3, 400, 350, 300, 350, 400, 800])
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
    # сам по себе, когда ничего не горит (последовательности как в js/animations.js)
    dance_seq = [*rng(20, 1), *rng(14, 6), 20, 21]
    dance = steps('dance', dance_seq, [260 if f == 14 else 280 if f in (7, 8, 12) else 320 if f >= 20 else 200
                                       for f in dance_seq])
    tv_seq = [1, 2, 3, 4, 5, 6, 7, 8, 9, 6, 7, 8, 9, 10, 11, 12, 13, 10, 11, 12, 13,
              14, 15, 14, 15, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
    tv = steps('tv', tv_seq, [300 if f <= 5 else 450 if f <= 9 else 220 if f <= 13 else 450 if f <= 15 else 260
                              for f in tv_seq])
    itch = [2, 3, 4, 3]
    scratch = steps('scratch', [1, *itch * 4, 14, 15], [200, *[150] * 16, 220, 280])
    scared = steps('scared', [1, 2, 3, 3, 4, 5, 6, 7, 8, 9, 6, 7, 10, 11, 12, 13, 14, 15],
                   [300, 220, 120, 380, 350, 300, 350, 300, 400, 380, 300, 300, 350, 350, 400, 400, 450, 500])
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
        ('love2', 0, [], love2),
        ('sleep', 0, [], sleep),
        ('sleep_in', 0, [], sleep_in),
        ('sleep_snore', 0, [], sleep_snore),
        ('sleep_out', 0, [], sleep_out),
        ('angry', 0, [], angry),
        ('pile', 0, [], pile),
        ('sad', ENTRY, [], sad),
        ('pill', ENTRY, [], pill),
        ('poop', ENTRY, [], poop),
        ('dance', ENTRY, [], dance),
        ('tv', ENTRY, [], tv),
        ('scratch', ENTRY, [], scratch),
        ('scared', ENTRY, [], scared),
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


# --- надписи: шрифт, иконки меню и реплики берутся из igoryasha_ui (там же превью) ---
WEEKDAYS = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']   # как tm_wday
MONTHS = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЯ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК']
BUBBLE_CHARS = 18        # символов в строке пузыря при шрифте ×2 (как в превью)

# Реплики по событиям; порядок групп = enum IgrSay в прошивке. Часть — из песочницы
# (js/animations.js), часть новая: уборка, болезнь, таблетка, побудка.
COMMON = ['Ой вей.', 'Ну ой.', 'Ой вей из мир.', 'Ну ой, ну шо.', 'Ой, всё.', 'Ну такое.', 'Ой, да ладно.',
          'Ну шо началось-то?', 'Ой, мама.', 'Ну и ну.', 'Ну ой, ну куда.', 'Ой, не говорите.',
          'Ну шо вы хотите от меня?']
SAY = {
    'idle': ['Ну чо вы смотрите?', 'Я всё контролирую.', 'Ну стою. И шо?', 'Ой, не начинайте.', *COMMON],
    'feed': ['Ммм, хинкалик.', 'Наконец-то покормили.', 'Ой, вкусно, ой.', 'Ну хоть шо-то.'],
    'vomit': ['Ой, куда столько...', 'Хватит, хватит!', 'Ой вей, перебор...', 'Не лезет уже!'],
    'sick': ['Чёт мне нехорошо...', 'Хинкал был несвежий.', 'Ой вей, помираю.', 'Дайте таблеточку...'],
    'clean': ['О, чистота!', 'Так-то лучше.', 'Ну наконец-то.', 'Спасибо, шо ли.'],
    'pill': ['О, таблеточка!', 'Шо это? Ну давай.'],
    'cured': ['О, полегчало!', 'Таблеточка - сила!', 'Жить можно.', 'Вот это я понимаю.'],
    'buzz': ['Я на жёстких бизиках!', 'Двигаюсь на изиках!'],
    'love': ['Ты у меня одна.', 'Только не лопни.', 'Ой, ну шо ты как неродная.'],
    # love2: без куклы, сам с собой, спиной к зрителю
    'love2': ['Не смотрите, я занят.', 'Отвернитесь, ну!', 'Это не то, шо вы думаете.', 'Ой вей, только не входите!',
              'Мама говорила, ослепну.', 'Ну а шо, мне одиноко.', 'Я сам себе лучший друг.', 'Сеанс любви к себе.'],
    'love2_done': ['Ничего не было, ясно?', 'Фух. Как заново родился.', 'Это была зарядка.', 'Ну и шо вы смотрите?',
                   'Никому ни слова.', 'Сам себя не похвалишь...'],
    'tanks': ['Ща я их всех.', 'Куда ты едешь?!', 'Арта, ну ёпт.', 'Ой вей, союзники...'],
    'tanks_win': ['Ахаха, то есть мяу!', 'Лох и чичикака!'],
    'tanks_lose': ['Это всё лаги!', 'Ноут виноват.', 'ОЙ ВЕЙ!!!', 'Ну ой, ну шо такое...'],
    'woken': ['Ну ты чего, ночь же!', 'Шо?! Кто?!', 'Дай поспать, ну!', 'Ой вей, ну зачем...'],
    'hungry': ['А хинкал будет?', 'Ну покормите уже.', 'Ой вей, я голодный!', 'Ну ой, где еда?'],
    'sad': ['Ой вей, никто меня не любит...', 'Ну ой... ну за шо?!', 'Хинкала нет, и жизни нет!',
            'Да за шо мне это всё?!'],
    'poop': ['Отойдите на минутку.', 'Хинкал был лишний.', 'Ой вей, ну вы чего смотрите.'],
    'sleep': ['Чёт я устал...', 'Ой вей, спать.', 'Разбудите к хинкалу.'],
    'walk': ['Чёт нервно мне.', 'Туда. Сюда. Обратно.', 'Ой вей, шо ж делать-то.', 'Ну ой, ну нервы.'],
    'dance': ['Танцуют все!', 'Ой, ну я в ударе.', 'Ну а шо, я пластичный.', 'Диско, ой вей!'],
    'tv': ['О, «Камеди» началось.', 'Ахаха, ну дурак!', 'Ой вей, шо творят.', 'Не мешайте, тут самое интересное.'],
    'scratch': ['Задумался.', 'Дела житейские.', 'Ой вей, чешется.', 'Ну а шо, имею право.'],
    'scared': ['Шо это было?!', 'Ой вей! Кто здесь?', 'Ну ой... показалось.', 'Мама...'],
}


TV_BOX = (217, 110, 234, 134)   # x0 y0 x1 y1 вокруг кинескопа телевизора в углу комнаты


def tv_screen():
    """Кинескоп телевизора: x, y, w, h и по строке битовая маска (бит k — столбец x + k).
    Заливка от центра по светлым пикселям внутри TV_BOX — тёмная рамка корпуса её держит."""
    room = np.asarray(Image.open(SPRITES / 'room.png').convert('RGB')).astype(int)
    x0, y0, x1, y1 = TV_BOX
    lit = room[y0:y1, x0:x1].max(axis=2) >= 0x34
    seen, todo = np.zeros_like(lit), [((y1 - y0) // 2, (x1 - x0) // 2)]
    while todo:
        y, x = todo.pop()
        if 0 <= y < lit.shape[0] and 0 <= x < lit.shape[1] and lit[y, x] and not seen[y, x]:
            seen[y, x] = True
            todo += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    ys, xs = np.nonzero(seen)
    sx, sy, w, h = x0 + xs.min(), y0 + ys.min(), xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    assert w <= 32
    rows = [sum(1 << k for k in range(w) if seen[sy - y0 + r, sx - x0 + k]) for r in range(h)]
    return int(sx), int(sy), int(w), int(h), rows


# Досье — пункт меню «статистика»: заголовок и подписи строк (значения считает прошивка).
STATS_TITLE = 'ДОСЬЕ ИГОРЯШИ'
STATS = ['Живёт дней', 'Хинкалов', 'Кучек', 'Танки', 'Любовь', 'Таблеток', 'Танцев', 'Будили']
STATS_CHARS = 10   # подпись слева ×2, значение справа до 6 знаков
assert all(len(s) <= STATS_CHARS for s in STATS)


def c_bytes(name, data):
    return f'static const uint8_t {name}[] = {{{", ".join(str(b) for b in data)}}};\n'


def build_header():
    import igoryasha_ui as ui
    room = Image.open(SPRITES / 'room.png').convert('RGBA')
    panel = Image.new('RGBA', room.size)
    ImageDraw.Draw(panel).rounded_rectangle(PANEL, radius=8, fill=(16, 18, 14, 170))
    room.alpha_composite(panel)
    px = rgb565(np.asarray(room.convert('RGB'))).ravel()
    words = ','.join(f'0x{v:04X}' for v in px)
    # таблетка, которая падает сверху перед «Дать таблетку» (как drop в песочнице)
    pill = np.asarray(Image.open(SPRITES / 'pill_item.png').convert('RGBA'))
    pv = rgb565(pill[..., :3]).astype(np.uint32)
    pv[(pv == 0) & (pill[..., 3] >= 128)] = 0x0001   # чёрная обводка: 0 занят под «прозрачно»
    pv[pill[..., 3] < 128] = 0
    pill_words = ','.join(f'0x{v:04X}' for v in pv.ravel())
    tv = tv_screen()

    font = ui.glcd()
    glyphs = '\n'.join('  {' + ', '.join(f'0x{c:02X}' for c in ui.glyph_columns(ch, font)) + '},' + f'  // {ch}'
                       for ch in ui.CYR_ORDER)
    label = lambda t: '{' + ', '.join(str(b) for b in ui.encode(t)) + ', 0}'

    # иконки меню: RGB565, 0 — прозрачно (чёрного в иконках нет, обводка тёмно-коричневая)
    icons = []
    for name in ui.MENU:
        a = np.asarray(ui.icon(name))
        v = rgb565(a[..., :3]).astype(np.uint32)
        v[a[..., 3] == 0] = 0
        assert not ((v == 0) & (a[..., 3] > 0)).any()
        icons.append('  {' + ','.join(f'0x{x:04X}' for x in v.ravel()) + '},  // ' + name)

    # реплики: заранее разбиты на строки пузыря, строки через \n
    say_c, groups = [], []
    for g, phrases in SAY.items():
        names = []
        for i, text in enumerate(phrases):
            lines = ui.wrap(text, BUBBLE_CHARS)
            assert len(lines) <= 2 and all(len(l) <= BUBBLE_CHARS for l in lines), text
            data = []
            for k, line in enumerate(lines):
                data += ([10] if k else []) + ui.encode(line)
            names.append(f'SAY_{g}_{i}')
            say_c.append(c_bytes(names[-1], data + [0]))
        say_c.append(f'static const uint8_t* const SAY_{g}[] = {{{", ".join(names)}}};\n')
        groups.append(f'  {{SAY_{g}, {len(names)}}},')
    enum = ', '.join(f'IGR_SAY_{g.upper()}' for g in SAY)

    HEADER.parent.mkdir(parents=True, exist_ok=True)
    generated = '// Сгенерировано tools/build_igoryasha_pack.py (в проекте Игоряшгочи) — не править руками.\n'
    HEADER.write_text(
        generated + '#pragma once\n#include <Arduino.h>\n\n'
        f'#define IGR_PANEL_Y {PANEL_Y}\n\n'
        '// Комната 240×240 с плашкой часов, RGB565. Шрифт, иконки и реплики — в IgoryashaText.h.\n'
        f'static const uint16_t IGR_ROOM[] PROGMEM = {{{words}}};\n\n'
        '// Таблетка, падающая сверху в начале «таблетки», RGB565, 0 — прозрачно.\n'
        f'#define IGR_PILL_W {pill.shape[1]}\n#define IGR_PILL_H {pill.shape[0]}\n'
        f'static const uint16_t IGR_PILL_ITEM[] PROGMEM = {{{pill_words}}};\n\n'
        '// Кинескоп телевизора в углу: по строке маска, бит k — столбец IGR_TV_X + k.\n'
        f'#define IGR_TV_X {tv[0]}\n#define IGR_TV_Y {tv[1]}\n#define IGR_TV_W {tv[2]}\n#define IGR_TV_H {tv[3]}\n'
        f'static const uint32_t IGR_TV_ROWS[IGR_TV_H] = {{{", ".join(f"0x{r:04X}" for r in tv[4])}}};\n')
    TEXT_HEADER.write_text(
        generated + '#pragma once\n#include <Arduino.h>\n\n'
        '// Своя кириллица в сетке встроенного шрифта: 5 столбцов по 8 бит, бит 0 — верх.\n'
        '// В строке такая буква — байт 0x80 + номер; остальное — ASCII встроенного шрифта.\n'
        f'static const uint8_t IGR_GLYPHS[][5] = {{\n{glyphs}\n}};\n\n'
        f'static const uint8_t IGR_WEEKDAYS[7][3] = {{{", ".join(label(w) for w in WEEKDAYS)}}};\n'
        f'static const uint8_t IGR_MONTHS[12][4] = {{{", ".join(label(m) for m in MONTHS)}}};\n\n'
        '// Досье (пункт меню «статистика»): заголовок и подписи строк по порядку.\n'
        f'static const uint8_t IGR_STATS_TITLE[] = {label(STATS_TITLE)};\n'
        f'#define IGR_STATS_ROWS {len(STATS)}\n'
        f'static const uint8_t IGR_STATS_LABELS[IGR_STATS_ROWS][{STATS_CHARS + 1}] = {{{", ".join(label(s) for s in STATS)}}};\n\n'
        f'// Иконки меню {ui.ICON}×{ui.ICON}, RGB565, 0 — прозрачно: {", ".join(ui.MENU)}.\n'
        f'#define IGR_ICON {ui.ICON}\n'
        f'static const uint16_t IGR_ICONS[{len(ui.MENU)}][{ui.ICON * ui.ICON}] PROGMEM = {{\n' + '\n'.join(icons) + '\n};\n\n'
        '// Реплики: строки пузыря через \\n, группы по событиям.\n'
        f'enum IgrSay {{{enum}, IGR_SAY_COUNT}};\n'
        + ''.join(say_c) +
        'struct IgrSayGroup { const uint8_t* const* lines; uint8_t count; };\n'
        'static const IgrSayGroup IGR_SAY[] = {\n' + '\n'.join(groups) + '\n};\n')


def main():
    size, biggest, longest = build_pack()
    build_header()
    print(f'{PACK.relative_to(ROOT)}: {size // 1024} КБ (кадр до {biggest} пикселей, сжатый до {longest} байт)')
    print(f'{HEADER.relative_to(ROOT)}: комната; {TEXT_HEADER.name}: шрифт, иконки, реплики')


if __name__ == '__main__':
    main()

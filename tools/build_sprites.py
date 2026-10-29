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

# name: (файл, колонки, ряды, индекс эталонного стоячего кадра[, опции])
# опции: min_blob — порог шума; backdrop — снять серые остатки фона;
#        register — выровнять кадры по ногам эталонного (для стоячих листов);
#        blink — пересобрать ряд моргания из кадров дыхания (см. bake_blink);
#        native — лист уже нарисован в ячейках 240 px: не масштабируем и не двигаем;
#        center — (с native) сдвинуть весь лист одним шагом, чтобы эталонный кадр
#                 встал как в остальных листах: центр тела на ANCHOR_X, ступни на FLOOR;
#        per_row — резать колонки в каждом ряду отдельно, по середине широких промежутков;
#        anchor="pants" — центровать по штанам (когда в руках крупный реквизит);
#        row_floor — ставить на пол весь ряд одним сдвигом (сохраняет прыжки);
#        airborne — (с row_floor) только эти кадры по ряду, остальные — каждый на пол;
#        cut_pile — вырезать кучку у ноги (лист «посрать»);
#        figures — сетка неровная: резать по отдельным фигурам в каждом ряду;
#        drop_white — убрать оторванные белые крошки (остатки фона);
#        snap_floor — (с register) по вертикали ставить каждый кадр на пол отдельно;
#        item — вынуть предмет из кадра в отдельный спрайт (см. extract_item);
#        match_area — масштаб по площади фигуры другого листа, а не по росту;
#        match_skin — оттенок кожи как у другого листа (см. match_skin)
SHEETS = {
    # уже в ячейках 240 px: дыхание 0–5, моргание 6–11 (тот же кадр + закрытые
    # глаза); ряды почёсывания ниже не берём. Лист сдвигаем целиком к якорю.
    "idle": ("idle.png", 6, 2, 0, {"native": True, "center": True}),
    # кожа в листах ниже краснее/желтее статики — оттенок по опорному кадру (match_skin)
    "hungry": ("hungry.png", 4, 4, 0, {"match_skin": "idle", "skin_frame": 0}),
    "walk": ("walk.png", 6, 4, 0),
    # кучку у ноги вырезаем — куча живёт отдельно, в углу комнаты
    "poop": ("poop.png", 4, 4, 0, {"cut_pile": True, "match_skin": "idle", "skin_frame": 0}),
    "eat": ("eat.png", 6, 4, 0),
    # брызги рвоты мелкие — порог ниже, чтобы их не съело; нарисован крупнее
    # статики и с жёлтой кожей — равняем объём и оттенок (кожу меряем по кадру 0:
    # дальше он зеленеет)
    "sick": ("sick.png", 6, 4, 0, {"min_blob": 0.0005, "match_area": "idle",
                                   "match_skin": "idle", "skin_frame": 0}),
    # танки: эталон — стоячие кадры; осколки ноутбука и штрихи движения мелкие
    "tanks": ("tanks.png", 6, 4, 0, {"min_blob": 0.001, "match_skin": "idle", "skin_frame": 0}),
    "tanks_win": ("tanks_win.png", 6, 4, 23, {"min_blob": 0.001, "match_skin": "idle", "skin_frame": 23}),
    "tanks_lose": ("tanks_lose.png", 6, 4, 23, {"min_blob": 0.0005, "match_skin": "idle", "skin_frame": 23}),
    # устаёт и ложится 0–7, спит и храпит 8–15 (цикл), встаёт 16–23;
    # в исходнике ряды по 6, 6, 4 и 8 кадров — режем по фигурам
    "sleep": ("sleep.png", 6, 4, 0, {"figures": True}),
    # истерика: грустит 0–5, ревёт и машет руками 6–17, вытирает слёзы и
    # успокаивается 18–23; руки размахивает широко — колонки режем по рядам
    "sad": ("sad.png", 6, 4, 0, {"register": True, "per_row": True, "min_blob": 0.0005,
                                 "drop_white": True, "snap_floor": True}),
    # таблетка: стоит 0, таблетка на полу 1, поднимает 2–3, глотает 4–8, бизики 9–15
    # (кадр 12 — прыжок: ряд на пол одним сдвигом, чтобы он остался в воздухе)
    # таблетку с пола (кадр 1) вынимаем в pill_item.png — движок роняет её сверху
    "pill": ("pill.png", 4, 4, 0, {"per_row": True, "row_floor": True, "min_blob": 0.0003,
                                   "item": {"frame": 1, "name": "pill_item"},
                                   "match_area": "idle",     # тело тут уже — равняем по объёму
                                   "match_skin": "idle"}),   # и кожа краснее — равняем оттенок
    # неловкий танец; кадр 14 — подскок (остаётся в воздухе, остальные — на пол).
    # Генератор нарисовал его по-своему — равняем объём и кожу по статике
    "dance": ("dance.png", 6, 4, 0, {"per_row": True, "row_floor": True, "airborne": [14],
                                     "min_blob": 0.0005, "match_area": "idle",
                                     "match_skin": "idle", "skin_frame": 0}),
    # смотрит телик: садится 0–5, смотрит и ржёт 6–15, встаёт 16–23 (каждый кадр на пол)
    "tv": ("tv.png", 6, 4, 0, {"per_row": True, "min_blob": 0.0005, "match_area": "idle",
                               "match_skin": "idle", "skin_frame": 0}),
    # кукла и её обрывки заходят в соседние колонки; эталон — стоячий кадр в конце
    "love": ("love.png", 8, 3, 23, {"min_blob": 0.0005, "per_row": True,
                                    "anchor": "pants", "row_floor": True, "match_skin": "idle", "skin_frame": 23}),
}
REGISTER_BAND = 0.3   # нижняя доля тела (голени и ступни), по которой совмещаем кадры
REGISTER_REACH = 8    # поиск сдвига ±px в исходном разрешении
PAD = 48              # запас по краям, чтобы сдвиг ничего не обрезал


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


def vomit_mask(rgba):
    """Ярко-зелёное (рвота) — не тело, не участвует в центровке."""
    r, g, b = (rgba[..., i].astype(int) for i in range(3))
    return (g - r > 40) & (g - b > 60)


def remove_gray_backdrop(rgba, band=0.3, gap=4, min_size=40):
    """Серая заливка, оставшаяся от фона между ног: нейтральные серые области
    в нижней части фигуры, отделённые от прозрачного не больше чем контуром
    в gap пикселей. Выше ног не ищем — там серые дужки очков и блики."""
    r, g, b = (rgba[..., i].astype(int) for i in range(3))
    lum = (r + g + b) / 3
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    ys = np.nonzero(rgba[..., 3].any(axis=1))[0]
    legs = np.zeros(lum.shape, bool)
    legs[int(ys.max() - band * (ys.max() - ys.min())):] = True
    # фон тёпло-серый; синеватое серое — это тени и кромки на тёмно-синих штанах
    gray = (rgba[..., 3] > 0) & (sat < 18) & (b - r < 6) & (lum > 45) & (lum < 215) & legs
    labels, n = ndimage.label(gray)
    if n == 0:
        return rgba
    outside = ndimage.binary_dilation(rgba[..., 3] == 0, iterations=gap)
    touching = np.unique(labels[outside & gray])
    touching = touching[touching > 0]
    # тонкие серые линии — кромки лампасов и сандалий, а не фон:
    # фон между ног — пятно, у которого остаётся ядро после эрозии
    core = ndimage.binary_erosion(gray, iterations=2)
    thick = np.unique(labels[core])
    sizes = ndimage.sum(gray, labels, touching)
    kill = touching[(sizes >= min_size) & np.isin(touching, thick)]
    rgba[np.isin(labels, kill), 3] = 0
    return rgba


def clean_cell(cell, min_blob=MIN_BLOB, backdrop=False):
    cell = cell.copy()
    cell[cell[..., 3] < ALPHA_CUT, 3] = 0
    cell[cell[..., 3] > 0, 3] = 255
    cell = peel_red_fringe(cell)
    if backdrop:
        cell = remove_gray_backdrop(cell)
    solid = cell[..., 3] > 0
    labels, n = ndimage.label(solid, structure=np.ones((3, 3)))
    if n == 0:
        raise ValueError("пустая ячейка")
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    body = int(np.argmax(sizes)) + 1
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= sizes.max() * min_blob
    cell[~keep[labels], 3] = 0
    cell[cell[..., 3] == 0, :3] = 0
    return cell, (labels == body) & ~vomit_mask(cell)


def slice_cells(img, cols, rows, per_row=False):
    solid = img[..., 3] >= ALPHA_CUT
    ys = cut_lines(solid.sum(axis=1), rows, widest=per_row)
    xs = cut_lines(solid.sum(axis=0), cols)
    for r in range(rows):
        band = slice(ys[r], ys[r + 1])
        if per_row:
            # реквизит заходит в соседние ячейки в каждом ряду по-разному
            xs = cut_lines(solid[band].sum(axis=0), cols, widest=True)
        for c in range(cols):
            yield img[band, xs[c]:xs[c + 1]]


def slice_figures(img, min_area=2000, min_band=40):
    """Нарезка листа с неровной сеткой (в рядах разное число кадров): ряды —
    по пустым горизонтальным полосам, в ряду — по отдельным фигурам, граница
    посередине между соседними. Кадры идут слева направо, сверху вниз."""
    solid = img[..., 3] >= ALPHA_CUT
    bands, start = [], None
    for y, v in enumerate(list(solid.any(axis=1)) + [False]):
        if v and start is None:
            start = y
        elif not v and start is not None:
            if y - start > min_band:
                bands.append((start, y))
            start = None
    for y0, y1 in bands:
        labels, n = ndimage.label(solid[y0:y1], structure=np.ones((3, 3)))
        sizes = ndimage.sum(solid[y0:y1], labels, range(1, n + 1))
        spans = sorted((np.nonzero(labels == k + 1)[1].min(), np.nonzero(labels == k + 1)[1].max())
                       for k in range(n) if sizes[k] >= min_area)
        edges = [0] + [(a[1] + b[0]) // 2 for a, b in zip(spans, spans[1:])] + [img.shape[1]]
        top, bottom = max(0, y0 - 8), min(img.shape[0], y1 + 8)
        for x0, x1 in zip(edges, edges[1:]):
            yield img[top:bottom, x0:x1]


def cut_lines(profile, n, widest=False):
    """Границы ячеек. Генератор не всегда держит ровную сетку: если линия
    равномерной сетки режет персонажа, сдвигаем её на ближайшую пустую."""
    size = len(profile)
    lines = [0]
    for k in range(1, n):
        nominal = round(k * size / n)
        reach = size // n // 4
        lo, hi = nominal - reach, nominal + reach
        if not widest:
            lines.append(min(range(lo, hi + 1), key=lambda y: (profile[y], abs(y - nominal))))
            continue
        window = profile[lo:hi + 1]
        # из самых пустых линий берём середину самого широкого промежутка:
        # узкая щель может оказаться между рукой и телом одного кадра
        low = window == window.min()
        runs, start = [], None
        for j, v in enumerate(list(low) + [False]):
            if v and start is None:
                start = j
            elif not v and start is not None:
                runs.append((j - start, -abs((start + j - 1) // 2 + lo - nominal), start, j - 1))
                start = None
        _, _, a, b = max(runs)
        lines.append(lo + (a + b) // 2)
    return lines + [size]


def downscale(cell, scale):
    h, w = cell.shape[:2]
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    small = np.array(Image.fromarray(cell).resize(size, Image.LANCZOS))
    small[small[..., 3] < ALPHA_CUT, 3] = 0
    small[small[..., 3] > 0, 3] = 255
    small[small[..., 3] == 0, :3] = 0
    return small


def pad(img, size):
    out = np.zeros((size[0], size[1]) + img.shape[2:], img.dtype)
    out[PAD:PAD + img.shape[0], PAD:PAD + img.shape[1]] = img
    return out


def shift(img, dx, dy):
    out = np.zeros_like(img)
    h, w = img.shape[:2]
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = \
        img[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def register(cells, ref):
    """Совмещает кадры с эталонным по голеням и ступням: генератор рисует
    одну и ту же позу со сдвигом на несколько пикселей, и в статике это
    выглядит как дрожание. Сначала грубо — по низу и центру ступней,
    потом перебором сдвига, при котором ноги совпадают лучше всего."""
    size = (max(c.shape[0] for c, _ in cells) + 2 * PAD,
            max(c.shape[1] for c, _ in cells) + 2 * PAD)
    padded = [(pad(c, size), pad(b, size)) for c, b in cells]

    def legs(body):
        ys, xs = np.nonzero(body)
        top = ys.max() - REGISTER_BAND * (ys.max() - ys.min())
        band = ys >= top
        return ys.max(), xs[band].mean(), top

    ref_body = padded[ref][1]
    ref_bot, ref_cx, ref_top = legs(ref_body)
    rows = slice(int(ref_top), int(ref_bot) + 1)
    out = []
    for cell, body in padded:
        bot, cx, _ = legs(body)
        gx, gy = round(ref_cx - cx), int(ref_bot - bot)
        best = min(((dx, dy) for dx in range(gx - REGISTER_REACH, gx + REGISTER_REACH + 1)
                    for dy in range(gy - REGISTER_REACH, gy + REGISTER_REACH + 1)),
                   key=lambda d: (np.count_nonzero(shift(body, *d)[rows] ^ ref_body[rows]),
                                  abs(d[0] - gx) + abs(d[1] - gy)))
        out.append((shift(cell, *best), shift(body, *best)))
    return out


def eye_mask(tile):
    """Белки и зрачки внутри очков: светлое в полосе головы плюс то, что внутри."""
    c = tile[..., :3].astype(int)
    lum, sat = c.mean(-1), c.max(-1) - c.min(-1)
    ys = np.nonzero(tile[..., 3].any(axis=1))[0]
    head = np.zeros(lum.shape, bool)
    head[ys.min() + 10:ys.min() + 45] = True
    whites = (tile[..., 3] > 0) & (lum > 165) & (sat < 70) & head
    labels, n = ndimage.label(whites)
    sizes = ndimage.sum(whites, labels, range(1, n + 1))
    whites = np.isin(labels, np.nonzero(sizes >= 3)[0] + 1)
    core = ndimage.binary_fill_holes(ndimage.binary_closing(whites, iterations=2))
    ring = ndimage.binary_dilation(core) & ~core
    return core | (ring & (lum > 45))


def eye_shift(tile, ref, box, reach=5):
    x0, x1, y0, y1 = box
    t = ref[y0:y1, x0:x1, :3].astype(int)
    return min(((dx, dy) for dx in range(-reach, reach + 1) for dy in range(-reach, reach + 1)),
               key=lambda d: np.abs(tile[y0 + d[1]:y1 + d[1], x0 + d[0]:x1 + d[0], :3].astype(int)
                                    - t).sum())


def bake_blink(tiles, phases, closed):
    """Ряд моргания у генератора перерисован целиком — переключение на него
    дёргает всю фигуру. Поэтому кадр phases+k собираем заново: это кадр
    дыхания k, в который пересажены закрытые веки из кадра closed (с учётом
    того, как голова сдвинулась на вдохе). Движок моргает, на ~100 мс
    подменяя кадр k на phases+k."""
    ref = tiles[0]
    m0 = eye_mask(ref)
    ys, xs = np.nonzero(m0)
    box = (xs.min() - 6, xs.max() + 7, ys.min() - 6, ys.max() + 7)
    src = tiles[closed].copy()
    sc = eye_shift(src, ref, box)
    for k in range(phases):
        tile = tiles[k].copy()
        sk = eye_shift(tile, ref, box)
        mask = eye_mask(tile) | np.roll(m0, (sk[1], sk[0]), axis=(0, 1))
        near = np.zeros_like(mask)   # только рядом с глазами эталона, не ухо и не блики
        near[box[2] + 3 + sk[1]:box[3] - 3 + sk[1], box[0] + 3 + sk[0]:box[1] - 3 + sk[0]] = True
        mask &= near
        yy, xx = np.nonzero(ndimage.binary_dilation(mask))
        tile[yy, xx] = src[yy - sk[1] + sc[1], xx - sk[0] + sc[0]]
        tiles[phases + k] = tile


def cut_pile(cell):
    """Убирает кучку, которую Игоряша оставляет у ноги в листе «посрать»:
    коричневое ниже колен и левее штанин плюс её тёмный контур. В одном
    кадре кучка касается сандалии, поэтому вырезаем по цвету, а не кусками."""
    cell = cell.copy()
    c = cell[..., :3].astype(int)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    lum = c.mean(-1)
    solid = cell[..., 3] > 0
    ys = np.nonzero(solid.any(axis=1))[0]
    low = np.zeros(r.shape, bool)
    low[int(ys.max() - 0.22 * (ys.max() - ys.min())):] = True
    px = np.nonzero(pants_mask(cell) & low)[1]
    left = np.zeros(r.shape, bool)
    left[:, :px.min()] = True
    brown = solid & low & left & (r > 60) & (r < 210) & (g > 25) & (g < 130) & (b < 90) \
        & (r - g > 25) & (g - b > 8)
    labels, n = ndimage.label(brown, structure=np.ones((3, 3)))
    if n == 0:
        return cell
    sizes = ndimage.sum(brown, labels, range(1, n + 1))
    pile = labels == np.argmax(sizes) + 1
    ring = ndimage.binary_dilation(pile, iterations=4) & solid & ~pile & left & (lum < 110) & (b <= r + 8)
    cell[pile | ring, 3] = 0
    solid = cell[..., 3] > 0
    labels, n = ndimage.label(solid, structure=np.ones((3, 3)))
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    cell[labels != np.argmax(sizes) + 1, 3] = 0
    cell[cell[..., 3] == 0, :3] = 0
    return cell


def drop_white_specks(cell, max_size=60):
    """Оторванные белые крошки — остатки белого фона генератора, не часть рисунка."""
    cell = cell.copy()
    solid = cell[..., 3] > 0
    labels, n = ndimage.label(solid, structure=np.ones((3, 3)))
    for k in range(1, n + 1):
        blob = labels == k
        if blob.sum() <= max_size and cell[blob][:, :3].mean() > 225:
            cell[blob, 3] = 0
    return cell


def pants_mask(tile):
    """Тёмно-синие треники — есть только у Игоряши, не у реквизита."""
    c = tile[..., :3].astype(int)
    return (tile[..., 3] > 0) & (c[..., 2] - c[..., 0] > 12) & (c.mean(axis=-1) < 90)


def place(small, body_small):
    """Ступни на пол, центр масс тела — на якорь; кучки едут вместе с телом."""
    bys, bxs = np.nonzero(body_small)
    return ANCHOR_X - round(bxs.mean()), FLOOR - bys.max()


def build_native(name, src, cols, rows, opts):
    """Лист, нарисованный сразу в ячейках CELL: полупрозрачность — в 0/255,
    оторванные крошки (штрихи у ноги) — долой. Без масштаба, а сдвиг (center)
    один на все кадры, чтобы не сбить их попиксельное совпадение. Лишние
    ряды снизу (rows меньше, чем в исходнике) отбрасываются."""
    assert src.shape[1] == cols * CELL and src.shape[0] >= rows * CELL, src.shape
    src = src[:rows * CELL]
    sheet = np.zeros_like(src)
    for i in range(cols * rows):
        ox, oy = (i % cols) * CELL, (i // cols) * CELL
        tile = src[oy:oy + CELL, ox:ox + CELL].copy()
        tile[tile[..., 3] < ALPHA_CUT, 3] = 0
        tile[tile[..., 3] > 0, 3] = 255
        solid = tile[..., 3] > 0
        labels, n = ndimage.label(solid, structure=np.ones((3, 3)))
        sizes = ndimage.sum(solid, labels, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= sizes.max() * opts.get("min_blob", MIN_BLOB)
        tile[~keep[labels], 3] = 0
        tile[tile[..., 3] == 0, :3] = 0
        sheet[oy:oy + CELL, ox:ox + CELL] = tile
    if opts.get("center"):
        ref = sheet[:CELL, :CELL, 3] > 0
        ys, xs = np.nonzero(ref)
        dx, dy = ANCHOR_X - round(xs.mean()), FLOOR - ys.max()
        tiles = [shift(sheet[(i // cols) * CELL:(i // cols + 1) * CELL, (i % cols) * CELL:(i % cols + 1) * CELL], dx, dy)
                 for i in range(cols * rows)]
        for i, tile in enumerate(tiles):
            sheet[(i // cols) * CELL:(i // cols + 1) * CELL, (i % cols) * CELL:(i % cols + 1) * CELL] = tile
    Image.fromarray(sheet).save(OUT / f"{name}.png", optimize=True)
    return {"file": f"sprites/{name}.png", "cell": CELL, "cols": cols, "rows": rows,
            "frames": cols * rows, "scale": 1}


def skin_mask(tile):
    """Кожа: тёплые светлые пиксели (красный заметно выше зелёного, зелёный выше синего)."""
    c = tile[..., :3].astype(int)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    return (tile[..., 3] > 0) & (r > 120) & (r > g + 25) & (g > b) & (g > 60)


def match_skin(tiles, reference, by_frame=None):
    """Подогнать оттенок кожи под другой лист: по каждому каналу сдвиг и растяжение
    так, чтобы среднее и разброс кожи совпали с первым кадром эталона. Меняем
    только пиксели кожи — майка, штаны и очки остаются как есть."""
    ref = np.array(Image.open(OUT / f"{reference}.png"))[:CELL, :CELL]
    want = ref[..., :3][skin_mask(ref)].astype(float)
    masks = [skin_mask(t) for t in tiles]          # кожа — по исходным цветам, один раз
    # by_frame — мерить кожу только по этому кадру (например, пока не позеленел от болезни)
    measure = [by_frame] if by_frame is not None else range(len(tiles))
    for _ in range(4):                             # после сдвига часть пикселей меняет класс — сходимся
        have = np.concatenate([tiles[i][..., :3][masks[i]] for i in measure]).astype(float)
        k = want.std(0) / have.std(0)
        for t, m in zip(tiles, masks):
            px = t[..., :3][m].astype(float)
            t[..., :3][m] = np.clip((px - have.mean(0)) * k + want.mean(0), 0, 255).round().astype(np.uint8)


def extract_item(tiles, frame, name):
    """Вынуть отдельный предмет (самый крупный кусок, кроме Игоряши) из кадра
    в свой маленький спрайт: движок рисует его сам — например, таблетка
    падает сверху и ложится ровно туда, где она лежит в этом кадре."""
    tile = tiles[frame]
    solid = tile[..., 3] > 0
    labels, n = ndimage.label(solid, structure=np.ones((3, 3)))
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    item = labels == np.argsort(sizes)[-2] + 1
    ys, xs = np.nonzero(item)
    crop = tile[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
    crop[~item[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 3] = 0
    Image.fromarray(crop).save(OUT / f"{name}.png", optimize=True)
    tile[item] = 0
    print(f"{name:8} {crop.shape[1]}×{crop.shape[0]} px, лежит в x={xs.min()} y={ys.min()}")


def build_sheet(name, file, cols, rows, ref, opts=None):
    opts = opts or {}
    src = np.array(Image.open(SRC / file).convert("RGBA"))
    if opts.get("native"):
        return build_native(name, src, cols, rows, opts)
    sliced = slice_figures(src) if opts.get("figures") else \
        slice_cells(src, cols, rows, opts.get("per_row", False))
    cells = [clean_cell(c, opts.get("min_blob", MIN_BLOB), opts.get("backdrop", False)) for c in sliced]
    assert len(cells) == cols * rows, (name, len(cells))
    if opts.get("drop_white"):
        cells = [(drop_white_specks(c), b) for c, b in cells]
    if opts.get("cut_pile"):
        cells = [(cut_pile(c), b) for c, b in cells]
    if opts.get("register"):
        cells = register(cells, ref)

    ys = np.nonzero(cells[ref][1].any(axis=1))[0]
    scale = HEIGHT / (ys.max() - ys.min() + 1)
    if opts.get("match_area"):
        # подогнать не по росту, а по объёму: площадь эталонного кадра = площади
        # первого кадра уже собранного листа (генератор рисует пропорции по-разному)
        target = np.count_nonzero(np.array(Image.open(OUT / f"{opts['match_area']}.png"))[:CELL, :CELL, 3])
        area = np.count_nonzero(downscale(cells[ref][0], scale)[..., 3])
        scale *= (target / area) ** 0.5

    def shrink(cell, body):
        small = downscale(cell, scale)
        return small, np.array(Image.fromarray(body).resize(small.shape[1::-1], Image.NEAREST))

    shrunk = [shrink(c, b) for c, b in cells]
    # выровненные кадры ставим все по эталонному, чтобы не сбить совмещение
    fixed = place(*shrunk[ref]) if opts.get("register") else None
    if opts.get("anchor") == "pants":
        # Игоряша держит реквизит (куклу) — центр всей фигуры уезжает к нему,
        # поэтому центруем по штанам с поправкой, снятой с эталонного кадра
        s0, b0 = shrunk[ref]
        lean = np.nonzero(b0)[1].mean() - np.nonzero(pants_mask(s0))[1].mean()
    if opts.get("row_floor"):
        # один сдвиг на весь ряд: пол у генератора общий для ряда, и так
        # сохраняются прыжки, которые иначе прижало бы к полу
        bottoms = [np.nonzero(b)[0].max() for _, b in shrunk]
        row_bottom = [max(bottoms[r * cols:(r + 1) * cols]) for r in range(rows)]

    tiles = []
    for i, (small, body_small) in enumerate(shrunk):
        dx, dy = fixed or place(small, body_small)
        if opts.get("anchor") == "pants":
            dx = ANCHOR_X - round(np.nonzero(pants_mask(small))[1].mean() + lean)
        if opts.get("row_floor") and i in opts.get("airborne", [i]):
            dy = FLOOR - row_bottom[i // cols]
        if opts.get("snap_floor"):
            dy = FLOOR - np.nonzero(body_small)[0].max()   # по x — совмещение, по y — каждый на пол
        h, w = small.shape[:2]
        tile = np.zeros((CELL, CELL, 4), np.uint8)
        sx0, sy0 = max(0, -dx), max(0, -dy)
        tx0, ty0 = max(0, dx), max(0, dy)
        cw, ch = min(w - sx0, CELL - tx0), min(h - sy0, CELL - ty0)
        tile[ty0:ty0 + ch, tx0:tx0 + cw] = small[sy0:sy0 + ch, sx0:sx0 + cw]
        tiles.append(tile)

    if opts.get("blink"):
        bake_blink(tiles, **opts["blink"])
    if opts.get("item"):
        extract_item(tiles, **opts["item"])
    if opts.get("match_skin"):
        match_skin(tiles, opts["match_skin"], opts.get("skin_frame"))

    sheet = np.zeros((rows * CELL, cols * CELL, 4), np.uint8)
    for i, tile in enumerate(tiles):
        ox, oy = (i % cols) * CELL, (i // cols) * CELL
        sheet[oy:oy + CELL, ox:ox + CELL] = tile

    Image.fromarray(sheet).save(OUT / f"{name}.png", optimize=True)
    return {"file": f"sprites/{name}.png", "cell": CELL, "cols": cols, "rows": rows,
            "frames": cols * rows, "scale": round(scale, 4)}


# Куча в углу комнаты: 6 размеров из source/heap.png (3×2), один общий масштаб,
# чтобы самая большая была HEAP_MAX_W px в ширину. Низ по центру — в HEAP_ANCHOR
# (передний левый угол у дивана). Кадр листа = размер кучи.
HEAP_FROM = ("heap.png", 3, 2)
HEAP_MAX_W = 66
HEAP_ANCHOR = (42, 198)


def build_heap():
    file, cols, rows = HEAP_FROM
    src = np.array(Image.open(SRC / file).convert("RGBA"))
    heaps = []
    for c in slice_cells(src, cols, rows, per_row=True):
        cell, _ = clean_cell(c, 0.0005)
        ys, xs = np.nonzero(cell[..., 3] > 0)
        heaps.append(cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    scale = HEAP_MAX_W / heaps[-1].shape[1]
    sheet = np.zeros((CELL, CELL * len(heaps), 4), np.uint8)
    for i, heap in enumerate(heaps):
        small = downscale(heap, scale)
        h, w = small.shape[:2]
        x, y = i * CELL + HEAP_ANCHOR[0] - w // 2, HEAP_ANCHOR[1] - h
        sheet[y:y + h, x:x + w] = small
    Image.fromarray(sheet).save(OUT / "pile.png", optimize=True)
    return {"file": "sprites/pile.png", "cell": CELL, "cols": len(heaps), "rows": 1,
            "frames": len(heaps), "scale": round(scale, 4)}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {name: build_sheet(name, *args) for name, args in SHEETS.items()}
    # фон комнаты рисуется крупно — уменьшаем до размера экрана
    room = Image.open(SRC / "room.png").convert("RGB")
    if room.size != (CELL, CELL):
        room = room.resize((CELL, CELL), Image.LANCZOS)
    room.save(OUT / "room.png", optimize=True)
    meta["pile"] = build_heap()
    (OUT / "sheets.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    for name, m in meta.items():
        print(f"{name:8} {m['cols']}×{m['rows']}  scale {m['scale']}")


if __name__ == "__main__":
    main()

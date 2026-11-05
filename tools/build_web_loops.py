"""Гифки для блока «Что он умеет» на веб-странице игры (game/gifs/).

Действие крутится без выхода в стойку: приседает, ест, играет в ноут, смотрит телик (без «сел» и «встал»).
Просит есть — целиком, со стоянием между заходами и тряской комнаты на ударах кулаком, как в игре.
Кадры и длительности — из js/animations.js, скорость как в игре (1×). Ходьба (walk.gif) и так петля,
её делает tools/build_gifs.py.
Запуск: .venv/bin/python tools/build_web_loops.py  →  game/gifs/*.gif
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import build_gifs as bg  # noqa: E402
import build_igoryasha_pack as pack  # noqa: E402

OUT = bg.ROOT / 'game' / 'gifs'
CELL = bg.CELL

# Картинка на кинескопе — как IgoryashaMode::tvPixel: сцена меняется каждые TV_SCENE_TICKS тиков по TV_MS.
TV_FROM, TV_TO, TV_MS, TV_SCENE_TICKS = 4, 17, 90, 8
TV_SCENES = [((70, 110, 170), (225, 190, 150)), ((60, 140, 80), (235, 235, 220)), ((185, 95, 60), (250, 215, 120)),
             ((40, 40, 65), (200, 200, 235)), ((155, 150, 175), (70, 60, 90))]
M32 = 0xFFFFFFFF


def h32(a):
    a &= M32
    a = ((a ^ (a >> 16)) * 0x7FEB352D) & M32
    a = ((a ^ (a >> 15)) * 0x846CA68B) & M32
    return a ^ (a >> 16)


def tv_pixel(x, y, tick, h_rows):
    h = h32((tick // TV_SCENE_TICKS) * 7919 + 13)
    bg_c, fg = TV_SCENES[h % 5]
    j = h32(tick * 31 + 7)
    fx, fy = 2 + (h >> 4) % 6 + j % 3 - 1, 5 + (h >> 8) % 6 + (j >> 2) % 3 - 1
    fw, fh = 4 + (h >> 12) % 4, 6 + (h >> 16) % 6
    c = fg if fx <= x < fx + fw and fy <= y < fy + fh else bg_c
    k = 112 - y * 32 // h_rows
    if y & 1:
        k = k * 85 // 100
    add = (30 if y == tick * 2 % (h_rows + 6) else 0) + (50 if (h32(tick * 977 + y * 31 + x) & 15) == 0 else 0)
    return tuple(max(0, min(255, v * k // 100 + add)) for v in c)


def save_gif(name, images, durations):
    # одна палитра на всю гифку, без дизеринга — иначе комната мерцает от кадра к кадру
    strip = Image.new('RGB', (CELL, CELL * len(images)))
    for i, img in enumerate(images):
        strip.paste(img, (0, i * CELL))
    palette = strip.quantize(256, method=Image.Quantize.MEDIANCUT)
    paletted = [img.quantize(palette=palette, dither=Image.Dither.NONE) for img in images]
    out = OUT / f'{name}.gif'
    paletted[0].save(out, save_all=True, append_images=paletted[1:], duration=durations,
                     loop=0, optimize=False, disposal=1)
    print(f'{out.name}: {len(images)} кадров, {sum(durations) / 1000:.1f} с, {out.stat().st_size // 1024} КБ')

# удар кулаком в стекло: комната дёргается, как IgoryashaMode::shakeOf (BANG_FRAMES, BANG_SHAKE, SHAKE_MS)
BANG_FRAMES, SHAKE_MS = (5, 7), 140
BANG_SHAKE = [(3, -1), (-3, 1), (2, 1), (-2, -1), (1, 0), (-1, 0)]
SHAKE_STEP = 20   # GIF считает в сотых: короче 20 мс браузеры не показывают

# Смотрит телик: tvSeq из animations.js без «садится» (1–5) и «встаёт» (16–22).
TV_SEQ = [6, 7, 8, 9, 6, 7, 8, 9, 10, 11, 12, 13, 10, 11, 12, 13, 14, 15, 14, 15, 10, 11, 12, 13, 14, 15]
TV_STEPS = [('tv', f, 450 if f <= 9 else 220 if f <= 13 else 450) for f in TV_SEQ]

GIFS = {
    # зарядка целиком, как squatFrames в animations.js: стоит, два полных приседа,
    # последний провальный (качается, упёрся в колени, пыхтит, выпрямился) — и снова стоит
    'squat': [('idle', k, ms) for k, ms in enumerate(bg.BREATH)] * 2
             + [('squat', f, ms) for f, ms in [(1, 200), (2, 220), (3, 450), (2, 220), (1, 200)] * 2]
             + [('squat', f, ms) for f, ms in [(1, 200), (2, 240), (3, 600), (4, 800), (5, 1000), (6, 1200), (7, 700)]],
    # стоит, дышит, потом просит есть и колотит в стекло — целиком, как в игре
    'hungry': [('idle', k, ms) for k, ms in enumerate(bg.BREATH)] * 2 + [('hungry', f, ms) for f, ms in bg.HUNGRY],
    'eat': [('eat', f, ms) for f, ms in zip(bg.EAT_LOOP, bg.EAT_LOOP_MS)],
    'tanks': [('tanks', f, ms) for f, ms in zip(range(12, 24), [130, 220, 130, 220, 130, 240, 130, 220, 130, 130, 160, 130])],
    'tv': TV_STEPS,
}


def shifted(img, dx, dy):
    """Сдвиг кадра, край тянется в щель — как в game.js draw()."""
    src, out = img.load(), Image.new('RGB', img.size)
    dst = out.load()
    for y in range(CELL):
        ry = max(0, min(CELL - 1, y - dy))
        for x in range(CELL):
            dst[x, y] = src[max(0, min(CELL - 1, x - dx)), ry]
    return out


def build(name, steps):
    room = Image.open(bg.SPRITES / 'room.png').convert('RGBA')
    sheets = {s: Image.open(bg.SPRITES / f'{s}.png').convert('RGBA') for s, _, _ in steps}
    sx, sy, sw, sh, rows = pack.tv_screen()
    images, durations, t = [], [], 0

    def frame_img(sheet, frame, tick, shake):
        c = pack.SHEETS[sheet][0]
        img = room.copy()
        img.alpha_composite(sheets[sheet].crop(((frame % c) * CELL, frame // c * CELL,
                                                (frame % c + 1) * CELL, (frame // c + 1) * CELL)))
        if tick is not None:
            px = img.load()
            for y in range(sh):
                for x in range(sw):
                    if rows[y] >> x & 1:
                        px[sx + x, sy + y] = tv_pixel(x, y, tick, sh) + (255,)
        img = img.convert('RGB')
        return shifted(img, *shake) if shake != (0, 0) else img

    for sheet, frame, ms in steps:
        tv_on = sheet == 'tv' and TV_FROM <= frame <= TV_TO
        bang = sheet == 'hungry' and frame in BANG_FRAMES
        end, start = t + ms, t
        while t < end:
            if bang and t - start < SHAKE_MS:
                k = (t - start) * len(BANG_SHAKE) // SHAKE_MS
                span, shake = min(SHAKE_STEP, start + SHAKE_MS - t), BANG_SHAKE[k]
            else:
                span, shake = end - t, (0, 0)
            tick = None
            if tv_on:
                tick = t // TV_MS
                span = min(span, (tick + 1) * TV_MS - t)
            images.append(frame_img(sheet, frame, tick, shake))
            durations.append(span)
            t += span
    # GIF считает в сотых долях секунды: копим остаток, чтобы общая длина не уплыла
    out, acc = [], 0
    for d in durations:
        acc += d
        q = max(20, round(acc / 10) * 10)
        out.append(q)
        acc -= q
    save_gif(name, images, out)


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    only = sys.argv[1:]
    for name, steps in GIFS.items():
        if not only or name in only:
            build(name, steps)

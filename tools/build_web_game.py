"""Данные веб-версии тамагочи (game/): то же, что прошивка берёт из пака и IgoryashaText.h.

Пишет game/data.js — сценарии (шаги, переходы), шрифт 5×7 (встроенный glcdfont + своя
кириллица), иконки меню, реплики уже разбитые на строки пузыря, дни недели и месяцы —
и копирует спрайтшиты в game/sprites/, чтобы папку game/ можно было выложить как есть.

Запуск: .venv/bin/python tools/build_web_game.py
"""
import base64
import io
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))
import build_critters as critters  # noqa: E402
import build_igoryasha_pack as pack  # noqa: E402
import igoryasha_ui as ui  # noqa: E402

GAME = ROOT / 'game'


def icon_url(name):
    buf = io.BytesIO()
    ui.icon(name).save(buf, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def sheet_png(name):
    """Лист как в паке: 63 цвета + прозрачный (альфа < 128), в индексированном PNG — и легче в разы."""
    img = Image.open(pack.SPRITES / f'{name}.png').convert('RGBA')
    q = img.convert('RGB').quantize(pack.COLORS - 1, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    idx = np.asarray(q).astype(np.uint8) + 1
    idx[np.asarray(img)[..., 3] < 128] = 0
    out = Image.fromarray(idx, 'P')
    out.putpalette([0, 0, 0] + q.getpalette()[:3 * (pack.COLORS - 1)])
    out.info['transparency'] = 0
    return out


def main():
    font = ui.glcd()
    chars = {chr(c) for c in range(32, 127)} | set(ui.CYR) | set(ui.LATIN)
    glyphs = {ch: ui.glyph_columns(ch, font) for ch in sorted(chars)}

    names = list(pack.SHEETS)
    scripts = [{'name': name, 'next': nxt,
                'steps': [[names[s], f, ms, dx] for s, f, ms, dx in st]}
               for name, _, nxt, st in pack.scripts()]
    say = {g: [ui.wrap(t, pack.BUBBLE_CHARS) for t in lines] for g, lines in pack.SAY.items()}
    data = {
        'sheets': {n: cols for n, (cols, _) in pack.SHEETS.items()},
        'scripts': scripts,
        'glyphs': glyphs,
        'icons': [icon_url(n) for n in ui.MENU],
        'say': say,
        'weekdays': pack.WEEKDAYS,
        'months': pack.MONTHS,
        'critters': {n: len(f) for n, f in critters.CRITTERS.items()},
        'stats': {'title': pack.STATS_TITLE, 'labels': pack.STATS},
        'tv': dict(zip(('x', 'y', 'w', 'h', 'rows'), pack.tv_screen())),
    }
    GAME.mkdir(exist_ok=True)
    (GAME / 'data.js').write_text(
        '// Сгенерировано tools/build_web_game.py — не править руками.\n'
        f'const IGR = {json.dumps(data, ensure_ascii=False, separators=(",", ":"))};\n')
    (GAME / 'sprites').mkdir(exist_ok=True)
    for n in names:
        sheet_png(n).save(GAME / 'sprites' / f'{n}.png', optimize=True)
    for n in ('room', 'pill_item', *critters.CRITTERS):
        shutil.copy(pack.SPRITES / f'{n}.png', GAME / 'sprites' / f'{n}.png')
    print(f'game/data.js, game/sprites/ ({len(names) + 2} листов)')


if __name__ == '__main__':
    main()

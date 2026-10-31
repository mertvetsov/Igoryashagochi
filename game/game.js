// game.js — Игоряша-тамагочи в браузере: порт режима «Игоряша» прошивки smalltv-mod
// (src/features/igoryasha: IgoryashaPet, IgoryashaMode, IgoryashaHud, IgoryashaLight).
// Числа, тайминги и порядок решений — как там; экран 240×240 рисуется так же:
// комната, кучка, падающая таблетка, Игоряша, свет времени суток, пыль, верхняя плашка, часы.
// Данные (сценарии, шрифт, иконки, реплики) — game/data.js из tools/build_web_game.py.
'use strict';

// ---- настройки для проверки: ?hour=23 — часы стоят на этом часу, ?speed=60 — потребности в 60 раз быстрее
const params = new URLSearchParams(location.search);
const FIXED_HOUR = params.has('hour') ? +params.get('hour') : null;
const SPEED = Math.max(1, +params.get('speed') || 1);
const STORE = 'igoryasha_pet';

const millis = () => performance.now();
const random = (a, b) => b === undefined ? Math.floor(Math.random() * a) : a + Math.floor(Math.random() * (b - a));
const clamp100 = v => v < 0 ? 0 : v > 100 ? 100 : v;

function wallNow() {
  const d = new Date();
  if (FIXED_HOUR !== null) d.setHours(FIXED_HOUR);
  return d;
}
const startWall = Date.now(), startMs = millis();
// стенные часы потребностей в секундах (с ?speed= бегут быстрее)
const petEpoch = () => Math.floor((startWall + (millis() - startMs) * SPEED) / 1000);

// ============================================================================
// IgoryashaPet — потребности: голод, туалет, настроение, кучки
// ============================================================================
const HUNGRY = 60, STARVING = 90, MAX_PILES = 6, HYSTERIA_AFTER_S = 30 * 60, MAX_CATCH_UP_S = 24 * 3600;
const SICK_PILES = 4, SICK_AFTER_S = 3600;
const HUNGER_PER_H = 100 / 6, TOILET_PER_H = 100 / 5, SLEEP_FACTOR = 0.5;
const MOOD_HUNGRY_PER_H = -8, MOOD_SICK_PER_H = -10, MOOD_FINE_PER_H = 4;
const PILL_CURE_MOOD = 10, LOVE_MOOD = 15, TANKS_MOOD = 10, MOOD_FINE_UP_TO = 70;
const WORKOUT_MOOD = 5, SLAP_MOOD = 3;
const HAPPY = 75, ITCHY = 70, DANCE_MOOD = 3, TV_MOOD = 2, SCARED_MOOD = 3;
const FED_TOILET = 15, FED_MOOD = 5, FULL = 25, VOMIT_AFTER = 3, VOMIT_HUNGER = 40, VOMIT_MOOD = -20;
const pileMoodPerHour = p => -(2 * p + p * p);

class Pet {
  constructor() {
    this.n = { hunger: 20, toilet: 20, mood: 70, piles: 0, epoch: 0, starvingSince: 0, overfed: 0, sick: false, pilesHighSince: 0,
               // досье (пункт меню «статистика»)
               born: 0, eaten: 0, poops: 0, wins: 0, losses: 0, loves: 0, pills: 0, dances: 0, wakes: 0 };
  }
  // сколько дней живёт, сегодня — первый
  days() { const n = this.n; return n.born && n.epoch >= n.born ? Math.floor((n.epoch - n.born) / 86400) + 1 : 1; }
  addMood(d) { this.n.mood = clamp100(this.n.mood + d); }
  // свои занятия поднимают настроение не выше «всё хорошо» (70): остальное — от заботы
  addOwnMood(d) { if (this.n.mood < MOOD_FINE_UP_TO) this.addMood(Math.min(d, MOOD_FINE_UP_TO - this.n.mood)); }
  tick(epoch, asleep) {
    const n = this.n;
    if (!n.born) n.born = epoch;
    if (!n.epoch || epoch < n.epoch) { n.epoch = epoch; return; }
    let dt = epoch - n.epoch;
    if (dt > MAX_CATCH_UP_S) dt = MAX_CATCH_UP_S;
    n.epoch = epoch;
    const h = dt / 3600, k = asleep ? SLEEP_FACTOR : 1;
    n.hunger = clamp100(n.hunger + HUNGER_PER_H * k * h);
    n.toilet = clamp100(n.toilet + TOILET_PER_H * k * h);
    if (asleep && n.toilet > 99) n.toilet = 99;
    let mood = 0;
    if (n.hunger >= HUNGRY) mood += MOOD_HUNGRY_PER_H * h;
    if (n.sick) mood += MOOD_SICK_PER_H * h;
    mood += pileMoodPerHour(n.piles) * h;
    if (n.hunger < HUNGRY && !n.piles && !n.sick && n.mood < MOOD_FINE_UP_TO) {
      mood += MOOD_FINE_PER_H * h;
      if (n.mood + mood > MOOD_FINE_UP_TO) mood = MOOD_FINE_UP_TO - n.mood;
    }
    this.addMood(mood);
    if (n.hunger >= STARVING) { if (!n.starvingSince) n.starvingSince = epoch; } else n.starvingSince = 0;
    if (n.piles < SICK_PILES) n.pilesHighSince = 0;
    else if (!n.pilesHighSince) n.pilesHighSince = epoch;
    else if (epoch - n.pilesHighSince >= SICK_AFTER_S) n.sick = true;
  }
  urgent() { return this.n.toilet >= 100; }
  choose(hour = -1, last = null) {
    const n = this.n;
    if (this.urgent()) return 'poop';
    if (n.starvingSince && n.epoch - n.starvingSince >= HYSTERIA_AFTER_S && random(2) === 0) return 'sad';
    if (n.hunger >= HUNGRY) return 'hungry';
    if (n.sick) return random(2) ? 'sick' : 'sad';
    if (n.piles >= SICK_PILES && random(3) === 0) return 'sick';
    if (n.mood < 30 && random(2)) return 'sad';
    return this.pastime(hour, last);
  }
  // сам по себе, по весам: ходит, чешется, телик, танец (см. IgoryashaPet::pastime); испуги — от событий
  pastime(hour, last) {
    const n = this.n, low = n.mood < 30, high = n.mood >= 60, fun = this.canPlay() && !low;
    const morning = hour >= 5 && hour < 11, evening = hour >= 19 && hour < 23;
    const pool = [
      ['walk', low || high ? 2 : 3],
      ['scratch', (low || high ? 1 : 2) * (n.toilet >= ITCHY ? 3 : 1) + (morning ? 1 : 0)],
      ['tv', fun ? (high ? 2 : 3) * (evening ? 2 : 1) : 0],
      ['dance', fun && n.mood >= HAPPY ? 3 : 0],
    ].map(([name, w]) => [name, name === last ? 0 : w]);
    const total = pool.reduce((t, [, w]) => t + w, 0);
    if (!total) return 'walk';
    let r = random(total);
    for (const [name, w] of pool) { if (r < w) return name; r -= w; }
    return 'walk';
  }
  fed() {
    const n = this.n;
    n.eaten++;
    n.overfed = n.hunger < FULL ? n.overfed + 1 : 0;
    if (n.overfed >= VOMIT_AFTER) {
      n.overfed = 0; n.hunger = VOMIT_HUNGER; n.sick = true; this.addMood(VOMIT_MOOD);
      return true;
    }
    n.hunger = 0; n.starvingSince = 0;
    n.toilet = clamp100(n.toilet + FED_TOILET);
    this.addMood(FED_MOOD);
    return false;
  }
  pill() {
    const cured = this.n.sick;
    this.n.pills++;
    this.n.sick = false; this.n.pilesHighSince = 0;
    if (cured) this.addMood(PILL_CURE_MOOD);
    return cured;
  }
  canPlay() { return !this.n.piles && !this.n.sick; }
  cleaned() { if (this.n.piles) this.addMood(10); this.n.piles = 0; }
  pooped() { if (this.n.piles < MAX_PILES) this.n.piles++; this.n.poops++; this.n.toilet = 0; this.addMood(5); }
  woken() { this.addMood(-15); this.n.wakes++; }
  played(s) {
    const count = { tanks_win: 'wins', tanks_lose: 'losses', love: 'loves', love2: 'loves', dance: 'dances' }[s];
    if (count) this.n[count]++;
    if (s === 'tanks_win') this.addMood(TANKS_MOOD);
    else if (s === 'tanks_lose') this.addMood(-TANKS_MOOD);
    else if (s.startsWith('love')) this.addMood(LOVE_MOOD);   // either kind
    else if (s === 'sad') this.addMood(5);
    else if (s === 'dance') this.addOwnMood(DANCE_MOOD);
    else if (s === 'tv') this.addOwnMood(TV_MOOD);
    else if (s === 'scared') this.addMood(-SCARED_MOOD);
    else if (s === 'squat_out') this.addOwnMood(WORKOUT_MOOD);
    else if (s === 'slap') this.addMood(SLAP_MOOD);
  }
}

// ============================================================================
// шрифт: встроенный 5×7 в клетке 6×8, бит 0 — верх (как drawChar у Arduino_GFX)
// ============================================================================
function drawText(put, text, x, y, scale) {
  for (const ch of text) {
    const cols = IGR.glyphs[ch] || IGR.glyphs['?'];
    for (let cx = 0; cx < 5; cx++)
      for (let cy = 0; cy < 8; cy++)
        if (cols[cx] >> cy & 1) put(x + cx * scale, y + cy * scale, scale);
    x += 6 * scale;
  }
}

// ============================================================================
// IgoryashaLight — свет утра и ночи на сетке 31×31 через 8 px
// ============================================================================
const LN = 31, LSTEP = 8;
const MORNING_LIGHTS = [[217, 55, 170, [255, 236, 200], 0.9, 0]];
const NIGHT_LIGHTS = [
  [48, 82, 135, [255, 196, 120], 0.85, 0],   // торшер
  [48, 80, 22, [255, 236, 180], 0.7, 0],     // абажур
  [217, 55, 60, [90, 110, 160], 0.5, 0],     // фонари за окном
  [224, 128, 105, [110, 150, 235], 0.54, 0], // телевизор в углу
  [227, 123, 16, [190, 215, 255], 0.34, 0],  // сам экран
  [132, 146, 52, [150, 200, 255], 0.85, 2],  // ноутбук в танках
];
const MORNING_TINT = [226, 192, 166], NIGHT_TINT = [52, 62, 104];
const DAY = 0, MORNING = 1, NIGHT = 2;
const timeOfHour = h => h >= 5 && h < 11 ? MORNING : h >= 11 && h < 19 ? DAY : NIGHT;

class Light {
  constructor() { this.time = DAY; this.grid = null; this.live = []; }
  static falloff([x, y, r]) {
    const out = new Uint8Array(LN * LN);
    for (let gy = 0; gy < LN; gy++)
      for (let gx = 0; gx < LN; gx++) {
        const d = Math.hypot(gx * LSTEP - x, gy * LSTEP - y);
        if (d < r) out[gy * LN + gx] = Math.floor(255 * (1 - d / r) + 0.5);
      }
    return out;
  }
  set(t) {
    this.time = t; this.live = []; this.glowShown = false; this.lastUpdate = 0;
    if (t === DAY) { this.base = this.grid = null; return; }
    const tint = t === MORNING ? MORNING_TINT : NIGHT_TINT;
    const base = new Uint8Array(LN * LN * 3);
    for (let i = 0; i < LN * LN; i++) for (let c = 0; c < 3; c++) base[i * 3 + c] = tint[c];
    for (const s of t === MORNING ? MORNING_LIGHTS : NIGHT_LIGHTS) {
      const f = Light.falloff(s);
      if (s[5]) { this.live.push({ s, f }); continue; }
      for (let i = 0; i < LN * LN; i++)
        for (let c = 0; c < 3; c++)
          base[i * 3 + c] = Math.min(255, base[i * 3 + c] + Math.floor(s[3][c] * s[4] * f[i] / 255 + 0.5));
    }
    this.base = base;
    this.grid = base.slice();
  }
  // мерцание ноутбука во время танков ночью
  update(now, glow) {
    if (!this.live.length) return;
    glow = glow && this.time === NIGHT;
    if (!glow && !this.glowShown) return;
    if (this.lastUpdate && now - this.lastUpdate < 90 && glow === this.glowShown) return;
    this.lastUpdate = now;
    this.glowShown = glow;
    const g = this.base.slice();
    for (const { s, f } of this.live) {
      const boom = Math.pow(Math.max(0, Math.sin(now / 140)), 8);
      const p = glow ? Math.min(1, s[4] * (0.8 + 0.1 * Math.sin(now / 53) + 0.35 * boom)) : 0;
      const power = Math.floor(p * 255 + 0.5);
      if (!power) continue;
      for (let i = 0; i < LN * LN; i++) {
        if (!f[i]) continue;
        for (let c = 0; c < 3; c++) g[i * 3 + c] = Math.min(255, g[i * 3 + c] + Math.floor(s[3][c] * power * f[i] / 65025));
      }
    }
    this.grid = g;
  }
  apply(px) {
    if (this.time === DAY || !this.grid) return;
    const g = this.grid, ONE = 255 * LSTEP * LSTEP, HALF = ONE >> 1;
    for (let y = 0; y < 240; y++) {
      const gy = Math.min(y >> 3, LN - 2), fy = y - gy * LSTEP, top = gy * LN * 3, bot = top + LN * 3;
      for (let x = 0; x < 240; x++) {
        const gx = Math.min(x >> 3, LN - 2), fx = x - gx * LSTEP, o = (y * 240 + x) * 4;
        for (let c = 0; c < 3; c++) {
          const l = (g[top + gx * 3 + c] * (LSTEP - fx) + g[top + gx * 3 + 3 + c] * fx) * (LSTEP - fy) +
                    (g[bot + gx * 3 + c] * (LSTEP - fx) + g[bot + gx * 3 + 3 + c] * fx) * fy;
          px[o + c] = Math.floor((px[o + c] * l + HALF) / ONE);
        }
      }
    }
  }
}

// ============================================================================
// IgoryashaHud — плашка шкал, меню ухода, пузырь реплики
// ============================================================================
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const Y0 = 4, Y1 = 21, TOP_Y1 = 66, MENU_ITEMS = 6;
const PX0 = 4, PX1 = 237, PR = 5, BAR_W = 92, BAR_H = 6, BAR_Y = 9, SAT_X = 20, MOOD_X = 139;
const FORK_X = 10, FORK_Y = 7, FACE_X = 124, FACE_Y = 6;
const TRACK = hex('#141612'), OUTLINE = hex('#5a5a50'), FORK = hex('#e6e1cd'), FACE = hex('#f5c542'), INK = hex('#3c2814');
const SICK_FACE = hex('#8cc04a');
const FORK_ROWS = ['#.#.#', '#.#.#', '#.#.#', '#####', '.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'];
const FACE_ROWS = ['...#####...', '..#.....#..', '.#.......#.', '#.........#', '#..#...#..#', '#.........#',
                   '#.........#', '#.........#', '.#.......#.', '..#.....#..', '...#####...'];
const MOUTHS = [[[7, 3], [7, 7], [8, 4], [8, 5], [8, 6]], [[7, 4], [7, 5], [7, 6]], [[8, 3], [8, 7], [7, 4], [7, 5], [7, 6]]];
const MX0 = 4, MY0 = 4, MX1 = 236, MY1 = 38, MENU_R = 8, SLOT = 38, SLOT_X0 = 6, MENU_CY = 21, FRAME = 32, FR = 6;
const FRAME_FILL = hex('#3e4236'), FRAME_LINE = hex('#f5c542');
const PAPER = hex('#eff1dc'), BUBBLE_INK = hex('#22281e'), HEAD_X = 119;
const ICON = 22;

const shade = (v, a) => v.map((c, i) => Math.floor(c * (255 - a) / 255 + [16, 18, 14][i] * a / 255));
function inRounded(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x, cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
const inPlaque = (x, y) => inRounded(x, y, PX0, Y0, PX1 - 1, Y1 - 1, PR);
function barColor(v) {
  const h = v / 100 * 2, c = 0.95 * 0.85, m = 0.95 - c, x = c * (1 - Math.abs(h % 2 - 1));
  const [r, g] = h < 1 ? [c, x] : [x, c];
  return [Math.floor((r + m) * 255), Math.floor((g + m) * 255), Math.floor(m * 255)];
}
function barPixel(x, y, bx, fill, color) {
  if (x < bx || x >= bx + BAR_W || y < BAR_Y || y >= BAR_Y + BAR_H) return null;
  if (x === bx || x === bx + BAR_W - 1 || y === BAR_Y || y === BAR_Y + BAR_H - 1) return OUTLINE;
  return x - bx <= fill ? color : TRACK;
}

// досье: плашка под шкалами, заголовок жёлтым, строки «подпись … значение» ×2
const SX0 = 8, SX1 = 231, STATS_Y0 = 26, STATS_Y1 = 200, STATS_R = 8, STATS_PAD = 8;
const STATS_TITLE_Y = STATS_Y0 + 7, STATS_RULE_Y = STATS_Y0 + 25, STATS_ROW_Y = STATS_Y0 + 29, STATS_ROW_H = 18;
const STATS_LABEL = hex('#e6e1cd'), STATS_VALUE = hex('#f5c542'), STATS_RULE = hex('#5a5a50');
// чернила ли x, y у текста ×2 с началом в ox, oy
function textInk(text, ox, oy, x, y) {
  const chars = [...text];
  if (y < oy || y >= oy + 16 || x < ox || x >= ox + chars.length * 12) return false;
  const c = Math.floor((x - ox) / 12), cx = ((x - ox) % 12) >> 1, cy = (y - oy) >> 1;
  const cols = IGR.glyphs[chars[c]] || IGR.glyphs['?'];
  return cx < 5 && !!(cols[cx] >> cy & 1);
}

class Hud {
  constructor(icons) { this.icons = icons; this.sat = -1; this.menu = false; this.bubble = null; this.stats = null; }
  // досье: значения строк IGR.stats.labels — как IgoryashaHud::showStats()
  showStats(values) { this.stats = values; }
  hideStats() { this.stats = null; }
  statsPixel(x, y, under) {
    if (!inRounded(x, y, SX0, STATS_Y0, SX1, STATS_Y1 - 1, STATS_R)) return under;
    const title = IGR.stats.title, tl = [...title].length;
    if (textInk(title, (240 - tl * 12 + 2) >> 1, STATS_TITLE_Y, x, y)) return STATS_VALUE;
    if (y === STATS_RULE_Y && x >= SX0 + STATS_PAD && x <= SX1 - STATS_PAD) return STATS_RULE;
    const row = Math.floor((y - STATS_ROW_Y) / STATS_ROW_H);
    if (y >= STATS_ROW_Y && row < this.stats.length) {
      const ry = STATS_ROW_Y + row * STATS_ROW_H, v = this.stats[row];
      if (textInk(IGR.stats.labels[row], SX0 + STATS_PAD, ry, x, y)) return STATS_LABEL;
      if (textInk(v, SX1 - STATS_PAD + 3 - v.length * 12, ry, x, y)) return STATS_VALUE;
    }
    return shade(under, 215);
  }
  set(satiety, mood, sick) {
    satiety = Math.max(0, Math.min(100, satiety)); mood = Math.max(0, Math.min(100, mood));
    const key = [Math.floor(((BAR_W - 2) * satiety + 50) / 100), Math.floor(((BAR_W - 2) * mood + 50) / 100),
                 mood >= 60 ? 0 : mood >= 30 ? 1 : 2, satiety, mood, sick];
    [this.satFill, this.moodFill, this.face] = key;
    this.sat = satiety; this.satColor = barColor(satiety); this.moodColor = barColor(mood); this.sick = sick;
  }
  showMenu(sel, enabled) { this.menu = true; this.sel = sel; this.enabled = enabled; }
  hideMenu() { this.menu = false; }
  saying() { return !!this.bubble; }
  unsay() { this.bubble = null; }
  // пузырь: 0 пусто, 1 чернила, 2 бумага — как IgoryashaHud::say()
  say(lines) {
    const n = lines.length, longest = Math.max(...lines.map(l => [...l].length));
    const w = longest * 12 - 2 + 12, h = n * 18 + 10, x = Math.floor((240 - w) / 2), y = 6;
    const b = { x: x - 1, y: y - 1, w: w + 2, h: h + 11 };
    b.px = new Uint8Array(b.w * b.h);
    const put = (px, py, v) => {
      if (px < b.x || px >= b.x + b.w || py < b.y || py >= b.y + b.h) return;
      b.px[(py - b.y) * b.w + px - b.x] = v;
    };
    for (let py = b.y; py < b.y + b.h; py++)
      for (let px = b.x; px < b.x + b.w; px++) {
        let v = 0;
        if (py <= y + h && px <= x + w) v = 1;
        if (py >= y && py < y + h && px >= x && px < x + w) v = 2;
        if (py >= y + h - 1) {
          const d = Math.abs(px - HEAD_X);
          if (py >= y + h && d * 9 <= 7 * (y + h + 9 - py)) v = 1;
          if (d * 8 <= 6 * (y + h + 7 - py) && py <= y + h + 7) v = 2;
        }
        if (v) put(px, py, v);
      }
    lines.forEach((l, i) => {
      const lx = Math.floor((240 - ([...l].length * 12 - 2)) / 2), ly = y + 6 + i * 18;
      drawText((px, py, s) => { for (let k = 0; k < s * s; k++) put(px + k % s, py + Math.floor(k / s), 1); }, l, lx, ly, 2);
    });
    this.bubble = b;
  }
  barsPixel(x, y, under) {
    if (!inPlaque(x, y)) return under;
    let c = barPixel(x, y, SAT_X, this.satFill, this.satColor) || barPixel(x, y, MOOD_X, this.moodFill, this.moodColor);
    if (!c && x >= FORK_X && x < FORK_X + 5 && y >= FORK_Y && y < FORK_Y + 11 && FORK_ROWS[y - FORK_Y][x - FORK_X] === '#') c = FORK;
    if (!c && x >= FACE_X && x < FACE_X + 11 && y >= FACE_Y && y < FACE_Y + 11) {
      const fx = x - FACE_X, fy = y - FACE_Y;
      const mouth = MOUTHS[this.face].some(m => m[0] === fy && m[1] === fx);
      if (FACE_ROWS[fy][fx] === '#' || mouth) c = INK;
      else if ((fx - 5) ** 2 + (fy - 5) ** 2 <= 30) c = this.sick ? SICK_FACE : FACE;
    }
    return c || shade(under, 170);
  }
  menuPixel(x, y, under) {
    if (!inRounded(x, y, MX0, MY0, MX1, MY1, MENU_R)) return under;
    const k = Math.trunc((x - SLOT_X0) / SLOT);
    if (k < 0 || k >= MENU_ITEMS) return shade(under, 200);
    const cx = SLOT_X0 + k * SLOT + SLOT / 2;
    const ix = x - (cx - ICON / 2), iy = y - (MENU_CY - ICON / 2);
    if (ix >= 0 && ix < ICON && iy >= 0 && iy < ICON) {
      const ic = this.icons[this.enabled >> k & 1 ? 'on' : 'off'][k], o = (iy * ICON + ix) * 4;
      if (ic[o + 3]) return [ic[o], ic[o + 1], ic[o + 2]];
    }
    if (k === this.sel) {
      const fx0 = cx - FRAME / 2, fy0 = MENU_CY - FRAME / 2, fx1 = fx0 + FRAME - 1, fy1 = fy0 + FRAME - 1;
      if (inRounded(x, y, fx0, fy0, fx1, fy1, FR))
        return inRounded(x, y, fx0 + 2, fy0 + 2, fx1 - 2, fy1 - 2, FR - 2) ? FRAME_FILL : FRAME_LINE;
    }
    return shade(under, 200);
  }
  apply(px) {
    if (this.stats)
      for (let y = STATS_Y0; y < STATS_Y1; y++)
        for (let x = SX0; x <= SX1; x++) {
          const o = (y * 240 + x) * 4, c = this.statsPixel(x, y, [px[o], px[o + 1], px[o + 2]]);
          px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
        }
    const rows = this.menu ? [MY0, MY1 + 1] : this.bubble ? [this.bubble.y, this.bubble.y + this.bubble.h] : [Y0, Y1];
    if (!this.menu && !this.bubble && this.sat < 0) return;
    const b = this.bubble;
    for (let y = rows[0]; y < Math.min(rows[1], this.stats ? STATS_Y0 : TOP_Y1); y++)
      for (let x = 0; x < 240; x++) {
        const o = (y * 240 + x) * 4, under = [px[o], px[o + 1], px[o + 2]];
        let c;
        if (this.menu) c = this.menuPixel(x, y, under);
        else if (b) {
          if (x < b.x || x >= b.x + b.w) continue;
          const v = b.px[(y - b.y) * b.w + x - b.x];
          if (!v) continue;
          c = v === 1 ? BUBBLE_INK : PAPER;
        } else c = this.barsPixel(x, y, under);
        px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
      }
  }
}

// ============================================================================
// IgoryashaMode — кто что играет, меню, сон, кучки, часы
// ============================================================================
const BLINK_POSE = 6, BLINK_MS = 110, FIRST_ACTION_MS = 20000, ACTION_MIN_MS = 60000, ACTION_MAX_MS = 150000;
const NIGHT_AWAKE_MS = 3 * 60000, PET_TICK_MS = 10000, PET_SAVE_MS = 10 * 60000;
const PILE_STEP_MS = 80, DUST_MS = 70, DUST_FRAMES = 5, DUST_X = 42, DUST_Y = 190, DUST_COLOR = hex('#b9b3a4');
const POOP_FRAME = 8, SAY_MS = 3500, MENU_IDLE_MS = 5000, IDLE_TALK_IN = 90, BUZZ_FRAME = 10;
const LOVE2_DONE_FRAME = 21;   // love2: turns back to us, pleased with himself
// зарядка: всё утро, примерно раз в полчаса — 3–4 приседа со счётом, последний
// провальный, потом враньё про спорт (кадры листа squat)
// случайные события (см. IgoryashaMode: pickEvent, critterNow, serviceEvent)
const EV_NONE = 0, EV_KNOCK = 1, EV_BLINK = 2, EV_ROACH = 3, EV_PIGEON = 4, EV_STOMP = 5, EVENTS = ['', 'knock', 'blink', 'roach', 'pigeon'];
const EVENT_FIRST_MS = 3 * 60000, EVENT_MIN_MS = 12 * 60000, EVENT_MAX_MS = 25 * 60000;
const KNOCK_EVERY_MS = 450, KNOCK_SHAKE_MS = 120, KNOCK_MS = 1500, KNOCK_SHAKE = [[0, 2], [0, -1], [1, 1], [0, 0]];
const THUD_X = 140, THUD_Y = 104, THUD_MS = 240;   // штрихи от батареи на каждый стук (THUD_AT в build_critters.py)
const LIGHTS_OFF1 = 150, LIGHTS_ON = 300, LIGHTS_OFF2 = 650, LIGHTS_MS = 800;
// касание, пока бежит таракан: он замирает, Игоряша прыгает (stomp, лист таблетки) и на кадре 13 давит
const STOMP_LAND_FRAME = 13, STOMP_MAX_MS = 3000;
const ROACH_X0 = 236, ROACH_X1 = -22, ROACH_Y = 185, ROACH_SPOT = 175, ROACH_MS = 5200, ROACH_STEP_MS = 80, SPLAT_MS = 8000;
const PIGEON_X = 220, PIGEON_Y = 79, PIGEON_IN_MS = 600, PIGEON_SIT_MS = 9000, PIGEON_OUT_MS = 700, PIGEON_NOD_MS = 650;
const SQUAT_COUNT_FRAME = 3, SQUAT_DONE_FRAME = 6, WORKOUT_FROM = 7, WORKOUT_TO = 11, WORKOUT_GAP_MS = 30 * 60000;
const DROP_X = 158, DROP_Y = 192, DROP_FALL_MS = 600, DROP_BOUNCE_MS = 220, NO_DROP = -1000;
const PANEL_Y = 203, PANEL = [4, 203, 236, 237];
const CLOCK_COLOR = '#f3e6c4', DATE_COLOR = '#b8b48f';
const ITEM_FEED = 0, ITEM_CLEAN = 1, ITEM_PILL = 2, ITEM_LOVE = 3, ITEM_TANKS = 4, ITEM_STATS = 5, STATS_MS = 12000;
const AWAY_MS = 2 * 3600 * 1000, EAT_DANCE_IN = 3;
// телик: пока сидит к нему лицом, на кинескопе картинка — сцена, фигура, развёртка, снег
const TV_FROM = 4, TV_TO = 17, TV_MS = 90, TV_SCENE_TICKS = 8;
const TV_SCENES = [[[70, 110, 170], [225, 190, 150]], [[60, 140, 80], [235, 235, 220]], [[185, 95, 60], [250, 215, 120]],
                   [[40, 40, 65], [200, 200, 235]], [[155, 150, 175], [70, 60, 90]]];
// удар кулаком в стекло и испуг трясут комнату за ним
const BANG_FRAMES = [5, 7], STARTLE_FRAME = 3, SHAKE_MS = 140;
const BANG_SHAKE = [[3, -1], [-3, 1], [2, 1], [-2, -1], [1, 0], [-1, 0]], STARTLE_SHAKE = [[0, -2], [1, 1], [-1, 0]];
const hash = a => {
  a = Math.imul(a ^ a >>> 16, 0x7feb352d);
  a = Math.imul(a ^ a >>> 15, 0x846ca68b);
  return (a ^ a >>> 16) >>> 0;
};
const SAY_FOR = { eat: 'feed', sick: 'sick', pill: 'pill', love: 'love', love2: 'love2', tanks: 'tanks', tanks_win: 'tanks_win',
                  tanks_lose: 'tanks_lose', angry: 'woken', hungry: 'hungry', sad: 'sad', poop: 'poop', sleep_in: 'sleep', walk: 'walk',
                  dance: 'dance', tv: 'tv', scratch: 'scratch', scared: 'scared' };
const nightHour = h => h >= 23 || h < 7;

class Mode {
  constructor(images, hud) {
    this.img = images;
    this.hud = hud;
    this.light = new Light();
    this.pet = new Pet();
    this.scripts = IGR.scripts;
    this.petDirty = false; this.petTickAt = -Infinity; this.petSavedAt = 0;
    this.pileShown = 0; this.poopDropped = false; this.asleep = false; this.nightAwakeUntil = 0;
    this.queued = -1; this.sayUntil = 0; this.nextSay = null; this.buzzSaid = false;
    this.menuSel = 0; this.menuOn = 0; this.menuAt = 0; this.pileStepAt = 0; this.dust = 0; this.dustAt = 0;
    this.blinking = false; this.blinkAt = 0;
    this.lastChoice = null; this.squatsLeft = 0; this.squatCount = 0; this.saidStep = -1; this.workoutAt = 0; this.touchAt = millis();
    this.event = EV_NONE; this.eventAt = 0; this.nextEventAt = millis() + EVENT_FIRST_MS; this.reacted = false;
    this.critter = null; this.splat = null; this.splatUntil = 0; this.dark = false; this.tvTick = -1; this.shake = [0, 0];
    this.loadPet();
    this.startScript(0);
    this.nextActionAt = millis() + FIRST_ACTION_MS;
  }
  find(name) { return this.scripts.findIndex(s => s.name === name); }
  get name() { return this.scripts[this.script].name; }

  // ---- сценарии ----
  startScript(index) {
    this.script = index; this.step = 0; this.stepStart = millis();
    this.blinking = false; this.buzzSaid = false; this.saidStep = -1;
    let s = this.nextSay !== null ? this.nextSay : SAY_FOR[this.scripts[index].name] || null;
    this.nextSay = null;
    if (s === 'walk' && random(2)) s = null;   // ходит он много; слово — через раз
    if (s) this.say(s);
  }
  say(group) { this.sayLine(group, random(IGR.say[group].length)); }
  // строка i группы (за концом — последняя)
  sayLine(group, i) {
    if (this.hud.menu || this.hud.stats) return;
    const g = IGR.say[group];
    this.hud.say(g[Math.min(i, g.length - 1)]);
    this.sayUntil = millis() + SAY_MS;
  }
  // утром, когда его очередь что-то делать и с прошлой зарядки прошло полчаса, — монетка
  workoutDue() {
    const h = wallNow().getHours(), n = this.pet.n;
    if (h < WORKOUT_FROM || h >= WORKOUT_TO) return false;
    if (this.workoutAt && millis() - this.workoutAt < WORKOUT_GAP_MS) return false;
    if (n.hunger >= HUNGRY || n.sick || this.find('squat') < 0) return false;
    return !!random(2);
  }
  startWorkout() {
    this.workoutAt = millis() || 1;
    this.squatCount = 0;
    this.squatsLeft = random(2, 4);   // 2–3 полных, потом последний: всего 3–4
    this.startScript(this.find('squat'));
  }
  decide() {
    if (this.shouldSleep()) { this.startScript(this.find('sleep_in')); return; }
    if (this.pet.urgent()) { this.startScript(this.find('poop')); return; }
    if (!this.event && millis() >= this.nextEventAt && !this.hud.menu && !this.hud.stats) {
      this.nextEventAt = millis() + random(EVENT_MIN_MS, EVENT_MAX_MS);
      const e = this.pickEvent();
      if (e) this.startEvent(e);
    }
    if (millis() < this.nextActionAt) {
      this.startScript(0);
      if (!this.hud.saying() && !this.hud.menu && random(IDLE_TALK_IN) === 0) this.say('idle');
      return;
    }
    if (this.workoutDue()) { this.startWorkout(); return; }
    this.lastChoice = this.pet.choose(wallNow().getHours(), this.lastChoice);
    this.startScript(Math.max(0, this.find(this.lastChoice)));
  }
  // ---- случайные события ----
  // по часу: соседи днём и вечером, свет в темноте, таракан всегда (чаще при кучках
  // и в темноте), голубь днём
  pickEvent() {
    const h = wallNow().getHours(), dark = this.light.time === NIGHT;
    const w = [0, h >= 9 && h < 23 ? 1 : 0, dark ? 2 : 0, 2 + (this.pet.n.piles ? 3 : 0) + (dark ? 1 : 0), h >= 7 && h < 18 ? 3 : 0];
    let r = random(w.reduce((a, b) => a + b, 0));
    for (let e = 1; e < 5; e++) { if (r < w[e]) return e; r -= w[e]; }
    return EV_NONE;
  }
  startEvent(e) { this.event = e; this.eventAt = millis(); this.reacted = false; }
  // таракан или голубь сейчас: { im, frame, x, y } или null
  critterNow(now) {
    const t = now - this.eventAt;
    if (this.event === EV_STOMP) return this.stomped;
    if (this.event === EV_ROACH && t < ROACH_MS)
      return { im: 'roach', frame: Math.floor(t / ROACH_STEP_MS) % 2, x: ROACH_X0 + Math.trunc((ROACH_X1 - ROACH_X0) * t / ROACH_MS),
               y: ROACH_Y + Math.floor(t / 300) % 2 };
    if (this.event !== EV_PIGEON) return null;
    if (t < PIGEON_IN_MS) {
      const k = PIGEON_IN_MS - t;
      return { im: 'pigeon', frame: 2, x: PIGEON_X + Math.trunc(18 * k / PIGEON_IN_MS), y: PIGEON_Y - Math.trunc(30 * k / PIGEON_IN_MS) };
    }
    if (t < PIGEON_IN_MS + PIGEON_SIT_MS)
      return { im: 'pigeon', frame: Math.floor(t / PIGEON_NOD_MS) % 3 === 2 ? 1 : 0, x: PIGEON_X, y: PIGEON_Y };
    if (t < PIGEON_IN_MS + PIGEON_SIT_MS + PIGEON_OUT_MS) {
      const k = t - PIGEON_IN_MS - PIGEON_SIT_MS;
      return { im: 'pigeon', frame: 2, x: PIGEON_X + Math.trunc(20 * k / PIGEON_OUT_MS), y: PIGEON_Y - Math.trunc(50 * k / PIGEON_OUT_MS) };
    }
    return null;
  }
  thudNow(now) {
    const k = now - this.eventAt;
    if (this.event !== EV_KNOCK || Math.floor(k / KNOCK_EVERY_MS) >= 3 || k % KNOCK_EVERY_MS >= THUD_MS) return null;
    return { im: 'thud', frame: k % KNOCK_EVERY_MS < THUD_MS / 2 ? 0 : 1, x: THUD_X, y: THUD_Y };
  }
  darkNow(now) {
    const t = now - this.eventAt;
    return this.event === EV_BLINK && ((t >= LIGHTS_OFF1 && t < LIGHTS_ON) || (t >= LIGHTS_OFF2 && t < LIGHTS_MS));
  }
  // конец события и его реакция: стучит в ответ соседям, пугается темноты и таракана, здоровается с голубем
  serviceEvent(now) {
    const t = now - this.eventAt;
    if (this.event === EV_KNOCK && t >= KNOCK_MS) {
      this.event = EV_NONE; this.nextSay = 'knock'; this.startScript(this.find('angry'));
    } else if (this.event === EV_BLINK && t >= LIGHTS_MS) {
      this.event = EV_NONE; this.nextSay = 'blink'; this.startScript(this.find('scared'));
    } else if (this.event === EV_ROACH) {
      if (!this.reacted && this.critter && this.critter.x <= ROACH_SPOT) {
        this.reacted = true;
        if (this.script === 0) { this.nextSay = 'roach'; this.startScript(this.find('scared')); } else this.say('roach');
      }
      if (t >= ROACH_MS) this.event = EV_NONE;
    } else if (this.event === EV_STOMP) {
      const jumping = this.name === 'stomp';
      if (!jumping || t >= STOMP_MAX_MS || this.current().frame === STOMP_LAND_FRAME) this.squash();
    } else if (this.event === EV_PIGEON) {
      if (!this.reacted && t >= PIGEON_IN_MS) { this.reacted = true; if (!this.hud.saying() && random(2)) this.say('pigeon'); }
      if (t >= PIGEON_IN_MS + PIGEON_SIT_MS + PIGEON_OUT_MS) this.event = EV_NONE;
    }
  }
  // касание, пока бежит таракан: замирает, он прыгает на него (без прыжка в паке — давит сразу)
  slap() {
    this.stomped = this.critter;
    if (this.find('stomp') <= 0) { this.squash(); return; }
    this.startEvent(EV_STOMP);
    this.queued = -1;
    this.startScript(this.find('stomp'));
  }
  // приземлился: таракан раздавлен и полежит
  squash() {
    const s = this.stomped;
    this.splat = { im: 'splat', frame: 0, x: s.x, y: s.y + this.img.roach.height - this.img.splat.height };
    this.splatUntil = millis() + SPLAT_MS;
    this.event = EV_NONE; this.critter = null;
    this.pet.played('slap'); this.petDirty = true;
    this.say('slap');
  }
  // для проверки из консоли: igoryasha.play('roach')
  play(name) {
    const e = EVENTS.indexOf(name);
    if (e > 0) this.startEvent(e);
    else if (name === 'squat') this.startWorkout();
    else if (this.find(name) > 0) this.startScript(this.find(name));
  }
  finishScript() {
    const sc = this.scripts[this.script];
    this.pet.played(sc.name);
    if (this.queued >= 0) { const q = this.queued; this.queued = -1; this.startScript(q); return; }
    if (sc.next.length) { this.startScript(this.find(sc.next[random(sc.next.length)])); return; }
    if (sc.name === 'squat') { this.startScript(this.find(--this.squatsLeft ? 'squat' : 'squat_out')); return; }
    // счастлив — пляшет: после победы через раз, после еды иногда
    if ((sc.name === 'tanks_win' && random(2)) || (sc.name === 'eat' && this.pet.n.mood >= HAPPY && !random(EAT_DANCE_IN))) {
      this.startScript(this.find('dance'));
      return;
    }
    if (sc.name === 'sleep_in' || sc.name === 'sleep_snore') {
      this.asleep = this.shouldSleep();
      this.startScript(this.find(this.asleep ? 'sleep_snore' : 'sleep_out'));
      return;
    }
    if (sc.name === 'sleep_out') this.asleep = false;
    this.startScript(0);
    this.nextActionAt = millis() + random(ACTION_MIN_MS, ACTION_MAX_MS);
  }
  nextStep() {
    const sc = this.scripts[this.script];
    if (++this.step < sc.steps.length) { if (this.script === 0) this.blinkMaybe(); return; }
    if (this.script !== 0) { this.finishScript(); return; }
    this.decide();
    if (this.script === 0) this.blinkMaybe();
  }
  blinkMaybe() {
    this.blinking = random(100) < 6;
    if (this.blinking) this.blinkAt = this.stepStart + random(0, Math.max(1, this.scripts[0].steps[this.step][2] - BLINK_MS));
  }
  shouldSleep() {
    if (!nightHour(wallNow().getHours())) return false;
    return !this.nightAwakeUntil || millis() >= this.nightAwakeUntil;
  }
  wakeIfAsleep() {
    const name = this.name;
    if (!this.asleep && name !== 'sleep_in' && name !== 'sleep_snore') return false;
    this.asleep = false;
    this.pet.woken();
    this.nightAwakeUntil = millis() + NIGHT_AWAKE_MS;
    this.startScript(this.find('sleep_out'));
    this.queued = this.find('angry');
    this.petDirty = true;
    return true;
  }
  // первое касание после долгого перерыва пугает его (пока просто стоит) и на это и уходит
  startleIfAway() {
    const away = millis() - this.touchAt >= AWAY_MS;
    this.touchAt = millis();
    if (!away || this.script !== 0 || this.hud.menu || this.hud.stats) return false;
    this.startScript(this.find('scared'));
    return true;
  }
  sleeping() { return this.asleep || this.name === 'sleep_in' || this.name === 'sleep_snore'; }

  // ---- уход ----
  feed() {
    if (this.wakeIfAsleep()) return;
    const vomit = this.pet.fed();
    this.savePet();
    this.queued = -1;
    this.nextSay = vomit ? 'vomit' : 'feed';
    this.startScript(this.find(vomit ? 'sick' : 'eat'));
  }
  clean() {
    if (this.wakeIfAsleep()) return;
    const any = this.pet.n.piles;
    this.pet.cleaned();
    this.savePet();
    if (any) this.say('clean');
  }
  givePill() {
    if (this.wakeIfAsleep()) return;
    const cured = this.pet.pill();
    this.savePet();
    this.queued = -1;
    this.nextSay = cured ? 'cured' : 'pill';
    this.startScript(this.find('pill'));
  }
  playWith(script) {
    if (this.wakeIfAsleep()) return true;
    if (!this.pet.canPlay()) return false;
    this.queued = -1;
    // love comes in two kinds: with the doll, or alone with his back to us
    if (script === 'love' && this.find('love2') >= 0 && Math.random() < 0.5) script = 'love2';
    this.startScript(this.find(script));
    return true;
  }
  apply(item) {
    switch (item) {
      case ITEM_FEED: this.feed(); break;
      case ITEM_CLEAN: this.clean(); break;
      case ITEM_PILL: this.givePill(); break;
      case ITEM_LOVE: this.playWith('love'); break;
      case ITEM_TANKS: this.playWith('tanks'); break;
      case ITEM_STATS: this.showStats(); break;
    }
  }
  showStats() {
    const n = this.pet.n;
    this.hud.unsay();
    this.hud.showStats([this.pet.days(), n.eaten, n.poops, `${n.wins}:${n.losses}`, n.loves, n.pills, n.dances, n.wakes]
      .map(String));
    this.statsAt = millis();
  }

  // ---- меню на кнопке ----
  // занят — только досье, его можно смотреть всегда
  menuEnabled() {
    if (this.script !== 0) return 1 << ITEM_STATS;
    let m = 1 << ITEM_FEED | 1 << ITEM_PILL | 1 << ITEM_STATS;
    if (this.pet.n.piles) m |= 1 << ITEM_CLEAN;
    if (this.pet.canPlay()) m |= 1 << ITEM_LOVE | 1 << ITEM_TANKS;
    return m;
  }
  menuPick() {
    if (this.wakeIfAsleep() || !this.hud.menu) return;
    if (!(this.menuEnabled() >> this.menuSel & 1)) { this.menuAt = millis(); return; }
    this.hud.hideMenu();
    this.apply(this.menuSel);
  }
  menuTouch() {
    if (this.event === EV_ROACH && this.critter) { this.touchAt = millis(); this.slap(); return true; }
    if (this.hud.menu) { this.menuAt = millis(); this.touchAt = millis(); return false; }
    if (this.hud.stats) { this.touchAt = millis(); this.hud.hideStats(); return true; }
    if (this.startleIfAway()) return true;
    this.wakeIfAsleep();
    this.menuNext();
    return true;
  }
  menuNext() {
    if (this.wakeIfAsleep()) return;
    if (this.hud.stats) { this.hud.hideStats(); return; }
    const on = this.menuEnabled();
    this.hud.unsay();
    if (!this.hud.menu) {
      this.menuSel = ITEM_FEED; this.menuAt = millis(); this.menuOn = on;
      this.hud.showMenu(this.menuSel, on);
      return;
    }
    for (let k = 1; k <= MENU_ITEMS; k++) {
      const next = (this.menuSel + k) % MENU_ITEMS;
      if (!on || on >> next & 1) { this.menuSel = next; break; }
    }
    this.menuAt = millis(); this.menuOn = on;
    this.hud.showMenu(this.menuSel, on);
  }
  // кнопки ухода на странице: то же, что выбрать пункт в меню
  care(item) {
    if (this.startleIfAway() || this.wakeIfAsleep()) return;
    if (!(this.menuEnabled() >> item & 1)) return;
    this.hud.hideMenu();
    this.apply(item);
  }
  serviceTop() {
    if (this.hud.menu) {
      if (millis() - this.menuAt >= MENU_IDLE_MS) this.hud.hideMenu();
      else {
        const on = this.menuEnabled();
        if (on !== this.menuOn) {
          for (let k = 0; on && !(on >> this.menuSel & 1) && k < MENU_ITEMS; k++) this.menuSel = (this.menuSel + 1) % MENU_ITEMS;
          this.menuOn = on;
          this.hud.showMenu(this.menuSel, on);
        }
      }
    }
    if (this.hud.stats && millis() - this.statsAt >= STATS_MS) this.hud.hideStats();
    if (this.hud.saying() && millis() >= this.sayUntil) this.hud.unsay();
  }

  // ---- потребности: в localStorage, как в /igoryasha_pet.json на флешке ----
  loadPet() {
    try { Object.assign(this.pet.n, JSON.parse(localStorage.getItem(STORE)) || {}); } catch (e) { /* нет — с нуля */ }
  }
  savePet() {
    try { localStorage.setItem(STORE, JSON.stringify(this.pet.n)); } catch (e) { /* приватный режим */ }
    this.petSavedAt = millis();
    this.petDirty = false;
  }
  servicePet() {
    const now = millis();
    if (now - this.petTickAt >= PET_TICK_MS) {
      this.petTickAt = now;
      this.pet.tick(petEpoch(), this.asleep);
    }
    if (this.petDirty || now - this.petSavedAt >= PET_SAVE_MS) this.savePet();
  }

  // ---- кадр ----
  dropY() {
    if (this.name !== 'pill' || this.step) return NO_DROP;
    const t = millis() - this.stepStart;
    const H = this.img.pill_item.height;
    if (t < DROP_FALL_MS) { const k = t / DROP_FALL_MS; return Math.trunc(-H + (DROP_Y + H) * k * k); }
    if (t < DROP_FALL_MS + DROP_BOUNCE_MS) return DROP_Y - Math.round(7 * Math.sin(Math.PI * (t - DROP_FALL_MS) / DROP_BOUNCE_MS));
    return DROP_Y;
  }
  syncPile() {
    let want = this.pet.n.piles;
    if (want === this.pileShown) return;
    if (want < this.pileShown) {   // убрали: кучка уменьшается по размеру, потом облачко пыли
      if (millis() - this.pileStepAt < PILE_STEP_MS) return;
      this.pileStepAt = millis();
      want = this.pileShown - 1;
      if (!want) { this.dust = 1; this.dustAt = millis(); }
    }
    this.pileShown = want;
  }
  serviceDust() {
    if (!this.dust || millis() - this.dustAt < DUST_MS) return;
    this.dustAt = millis();
    if (++this.dust > DUST_FRAMES) this.dust = 0;
  }
  current() {
    const [sheet, frame0, , dx] = this.scripts[this.script].steps[this.step];
    let frame = frame0;
    const t = millis() - this.blinkAt;
    if (this.script === 0 && this.blinking && t >= 0 && t < BLINK_MS && frame < BLINK_POSE) frame += BLINK_POSE;
    return { sheet, frame, dx };
  }
  update() {
    if (millis() - this.stepStart > 10000) this.stepStart = millis();   // вкладка спала — не проматываем
    for (let guard = 0; guard < 64; guard++) {
      const ms = this.scripts[this.script].steps[this.step][2];
      if (!ms || millis() - this.stepStart < ms) break;
      this.stepStart += ms;
      this.nextStep();
    }
    const frame = this.scripts[this.script].steps[this.step][1];
    if (this.name === 'poop' && this.step === 0) this.poopDropped = false;
    if (this.name === 'poop' && !this.poopDropped && frame >= POOP_FRAME) {
      this.poopDropped = true;
      this.pet.pooped();
      this.petDirty = true;
    }
    if (this.name === 'pill' && !this.buzzSaid && frame === BUZZ_FRAME) { this.buzzSaid = true; this.say('buzz'); }
    if (this.name === 'love2' && !this.buzzSaid && frame === LOVE2_DONE_FRAME) { this.buzzSaid = true; this.say('love2_done'); }
    // зарядка: считает каждый присед внизу, отдышавшись — хвастается
    if ((this.name === 'squat' || this.name === 'squat_out') && this.saidStep !== this.step) {
      if (frame === SQUAT_COUNT_FRAME) { this.saidStep = this.step; this.sayLine('squat_count', this.squatCount++); }
      else if (frame === SQUAT_DONE_FRAME) { this.saidStep = this.step; this.say('squat_done'); }
    }
    this.servicePet();
    this.serviceTop();
    const tod = timeOfHour(wallNow().getHours());
    if (tod !== this.light.time) this.light.set(tod);
    const p = this.current();
    this.light.update(millis(), this.script === this.find('tanks') && p.frame >= 10);
    this.tvTick = this.name === 'tv' && p.frame >= TV_FROM && p.frame <= TV_TO ? Math.floor(millis() / TV_MS) : -1;
    this.serviceEvent(millis());
    this.critter = this.critterNow(millis());
    this.thud = this.thudNow(millis());
    if (this.splat && millis() >= this.splatUntil) this.splat = null;
    this.dark = this.darkNow(millis());
    this.shake = this.shakeOf(p);
    this.syncPile();
    this.serviceDust();
    this.hud.set(Math.floor(100 - this.pet.n.hunger + 0.5), Math.floor(this.pet.n.mood + 0.5), this.pet.n.sick);
  }
  shakeOf(p) {
    const scared = this.name === 'scared', steps = this.scripts[this.script].steps;
    let path = null;
    if (p.sheet === 'hungry' && BANG_FRAMES.includes(p.frame)) path = BANG_SHAKE;
    else if (this.name === 'stomp' && p.frame === STOMP_LAND_FRAME) path = BANG_SHAKE;   // приземлился на таракана
    else if (scared && p.frame === STARTLE_FRAME && this.step && steps[this.step - 1][1] !== STARTLE_FRAME) path = STARTLE_SHAKE;
    const t = millis() - this.stepStart;
    if (path && t < SHAKE_MS) return path[Math.floor(t * path.length / SHAKE_MS)];
    const k = millis() - this.eventAt;   // соседи стучат: толчок на каждый стук
    if (this.event === EV_KNOCK && Math.floor(k / KNOCK_EVERY_MS) < 3 && k % KNOCK_EVERY_MS < KNOCK_SHAKE_MS)
      return KNOCK_SHAKE[Math.floor(k % KNOCK_EVERY_MS * 4 / KNOCK_SHAKE_MS)];
    return [0, 0];
  }
  // пиксель картинки телика tvTick в x, y кинескопа (как IgoryashaMode::tvPixel)
  tvPixel(x, y) {
    const tick = this.tvTick, h = hash(Math.imul(Math.floor(tick / TV_SCENE_TICKS), 7919) + 13);
    const [bg, fg] = TV_SCENES[h % 5], j = hash(Math.imul(tick, 31) + 7), H = IGR.tv.h;
    const fx = 2 + (h >>> 4) % 6 + j % 3 - 1, fy = 5 + (h >>> 8) % 6 + (j >>> 2) % 3 - 1;
    const fw = 4 + (h >>> 12) % 4, fh = 6 + (h >>> 16) % 6;
    const c = x >= fx && x < fx + fw && y >= fy && y < fy + fh ? fg : bg;
    let k = 112 - Math.trunc(y * 32 / H);
    if (y & 1) k = Math.trunc(k * 85 / 100);
    let add = 0;
    if (y === tick * 2 % (H + 6)) add += 30;
    if ((hash(Math.imul(tick, 977) + y * 31 + x) & 15) === 0) add += 50;
    return c.map(v => Math.max(0, Math.min(255, Math.trunc(v * k / 100) + add)));
  }
  draw(ctx) {
    const cell = (name, f, x) => {
      const im = this.img[name], cols = IGR.sheets[name];
      ctx.drawImage(im, f % cols * 240, Math.floor(f / cols) * 240, 240, 240, x, 0, 240, 240);
    };
    ctx.drawImage(this.img.room, 0, 0);
    if (this.pileShown) cell('pile', Math.min(this.pileShown, 6) - 1, 0);
    for (const c of [this.splat, this.critter, this.thud]) if (c) {   // живность — в слое комнаты, трясётся вместе с ней
      const im = this.img[c.im], w = im.width / IGR.critters[c.im];
      ctx.drawImage(im, c.frame * w, 0, w, im.height, c.x, c.y, w, im.height);
    }
    const [sx, sy] = this.shake;
    if (sx || sy) {   // комната над плашкой часов сдвинута, край тянется в щель
      const bg = ctx.getImageData(0, 0, 240, PANEL_Y), src = new Uint32Array(bg.data.buffer.slice(0));
      const out = new Uint32Array(bg.data.buffer);
      for (let y = 0; y < PANEL_Y; y++) {
        const ry = Math.max(0, Math.min(PANEL_Y - 1, y - sy));
        for (let x = 0; x < 240; x++) out[y * 240 + x] = src[ry * 240 + Math.max(0, Math.min(239, x - sx))];
      }
      ctx.putImageData(bg, 0, 0);
    }
    const dy = this.dropY();
    if (dy !== NO_DROP) ctx.drawImage(this.img.pill_item, DROP_X, dy);
    const p = this.current();
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 240, PANEL_Y); ctx.clip();
    cell(p.sheet, p.frame, p.dx);
    ctx.restore();

    const data = ctx.getImageData(0, 0, 240, 240), px = data.data;
    this.light.apply(px);
    if (this.tvTick >= 0) {   // телик светится: картинка поверх света (перед ним он не стоит)
      const { x: tx, y: ty, w, h, rows } = IGR.tv;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (!(rows[y] >> x & 1)) continue;
          const o = ((ty + y + sy) * 240 + tx + x + sx) * 4;
          [px[o], px[o + 1], px[o + 2]] = this.tvPixel(x, y);
        }
    }
    if (this.dark)   // свет погас: четверть яркости над плашкой часов
      for (let o = 0; o < 240 * PANEL_Y * 4; o += 4) { px[o] >>= 2; px[o + 1] >>= 2; px[o + 2] >>= 2; }
    if (this.dust) {
      const DIRS = [[3, 0], [2, 2], [0, 3], [-2, 2], [-3, 0], [-2, -2], [0, -3], [2, -2]], r = this.dust + 1;
      for (const [ddx, ddy] of DIRS) {
        const sx = DUST_X + ddx * r, sy = DUST_Y + ddy * r - this.dust * 2;
        for (let y = sy; y < sy + 2; y++)
          for (let x = sx; x < sx + 2; x++) {
            if (x < 0 || x >= 240 || y < 0 || y >= PANEL_Y) continue;
            const o = (y * 240 + x) * 4;
            px[o] = DUST_COLOR[0]; px[o + 1] = DUST_COLOR[1]; px[o + 2] = DUST_COLOR[2];
          }
      }
    }
    this.hud.apply(px);
    ctx.putImageData(data, 0, 0);
    this.drawClock(ctx);
  }
  drawClock(ctx) {
    const t = wallNow(), pad = v => String(v).padStart(2, '0');
    const fill = color => (x, y, s) => { ctx.fillStyle = color; ctx.fillRect(x, y, s, s); };
    const colon = t.getSeconds() % 2 === 0 ? ':' : ' ';   // двоеточие мигает с секундами, как на часах
    drawText(fill(CLOCK_COLOR), `${pad(t.getHours())}${colon}${pad(t.getMinutes())}`, 12, 205, 4);
    const label = (text, right, y) => drawText(fill(DATE_COLOR), text, right - [...text].length * 12 + 2, y, 2);
    label(IGR.weekdays[t.getDay()], 228, 204);
    label(`${t.getDate()} ${IGR.months[t.getMonth()]}`, 228, 221);
  }
}

// ============================================================================
// страница
// ============================================================================
function loadImage(src) {
  return new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = src; });
}

function iconPixels(im, dim) {
  const c = document.createElement('canvas');
  c.width = c.height = ICON;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, ICON, ICON).data;
  if (dim) for (let o = 0; o < d.length; o += 4) if (d[o + 3]) {   // недоступный пункт: серый и тёмный
    const v = Math.floor((d[o] + d[o + 1] + d[o + 2]) / 6) + 28;
    d[o] = d[o + 1] = v; d[o + 2] = v - 4;
  }
  return d;
}

async function main() {
  const names = [...Object.keys(IGR.sheets), 'room', 'pill_item', ...Object.keys(IGR.critters)];
  const images = Object.fromEntries(await Promise.all(names.map(async n => [n, await loadImage(`sprites/${n}.png`)])));
  // комната с плашкой под часами, как IGR_ROOM в прошивке
  const room = document.createElement('canvas');
  room.width = room.height = 240;
  const rc = room.getContext('2d');
  rc.drawImage(images.room, 0, 0);
  rc.fillStyle = 'rgba(16,18,14,0.667)';
  rc.beginPath(); rc.roundRect(PANEL[0], PANEL[1], PANEL[2] - PANEL[0] + 1, PANEL[3] - PANEL[1] + 1, 8); rc.fill();
  images.room = room;

  const iconImgs = await Promise.all(IGR.icons.map(loadImage));
  const hud = new Hud({ on: iconImgs.map(i => iconPixels(i, false)), off: iconImgs.map(i => iconPixels(i, true)) });
  const mode = new Mode(images, hud);
  window.igoryasha = mode;   // для отладки из консоли

  const screen = document.getElementById('screen');
  const ctx = screen.getContext('2d', { willReadFrequently: true });

  // кнопки ухода
  const careButtons = [...document.querySelectorAll('[data-item]')];
  careButtons.forEach((b, k) => {
    b.querySelector('img').src = IGR.icons[k];
    b.addEventListener('click', () => mode.care(k));
  });

  // сенсорная кнопка устройства: касание открывает меню, коротко — выбрать, удержание — листать
  const BTN_LONG_MS = 600, BTN_REPEAT_MS = 500;
  const pad = document.getElementById('pad');
  let down = false, downAt = 0, taken = false, longDone = false, repeatAt = 0;
  const press = e => {
    if (down) return;
    e.preventDefault();
    down = true; downAt = millis(); longDone = false;
    taken = mode.menuTouch();
    pad.classList.add('down');
  };
  const release = () => {
    if (!down) return;
    down = false;
    pad.classList.remove('down');
    if (!longDone && !taken) mode.menuPick();
  };
  pad.addEventListener('pointerdown', press);
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);
  pad.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press(e); });
  pad.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') release(); });
  const serviceButton = () => {
    if (!down || taken) return;
    if (!longDone && millis() - downAt >= BTN_LONG_MS) { longDone = true; repeatAt = millis() + BTN_REPEAT_MS; mode.menuNext(); }
    if (longDone && millis() >= repeatAt) { repeatAt += BTN_REPEAT_MS; mode.menuNext(); }
  };

  const status = document.getElementById('status');
  const stats = document.getElementById('stats');
  const DOING = { idle: 'стоит', walk: 'нервно ходит', hungry: 'просит есть', eat: 'ест хинкал', sick: 'тошнит',
                  tanks: 'играет в танки', tanks_win: 'победил в танках', tanks_lose: 'проиграл в танки',
                  love: 'танцует с надувной', love2: 'любит сам себя', sleep_in: 'ложится спать', sleep_snore: 'спит', sleep_out: 'встаёт',
                  angry: 'злой спросонья', sad: 'плачет', pill: 'пьёт таблетку', poop: 'гадит',
                  dance: 'танцует', tv: 'смотрит телик', scratch: 'чешет жопу', scared: 'испугался',
                  squat: 'делает зарядку', squat_out: 'делает зарядку',
                  stomp: 'прыгает на таракана' };
  const statusText = () => {
    const n = mode.pet.n;
    if (mode.sleeping()) return 'Спит. Любая кнопка его разбудит — и он будет злой.';
    if (mode.script !== 0) return `Сейчас ${DOING[mode.name] || mode.name}. Подождите, пока закончит.`;
    if (n.sick) return 'Ему плохо — дайте таблетку.';
    if (n.hunger >= HUNGRY) return 'Голодный — покормите.';
    if (n.piles) return 'На полу кучка — уберите.';
    return 'Всё хорошо. Можно поиграть.';
  };
  let lastUi = 0;
  const serviceUi = () => {
    if (millis() - lastUi < 200) return;
    lastUi = millis();
    const on = mode.menuEnabled(), sleeping = mode.sleeping();
    careButtons.forEach((b, k) => { b.disabled = !sleeping && !(on >> k & 1); });
    status.textContent = statusText();
    const n = mode.pet.n;
    stats.textContent = `голод ${Math.round(n.hunger)} · туалет ${Math.round(n.toilet)} · настроение ${Math.round(n.mood)}` +
      ` · кучек ${n.piles}${n.sick ? ' · болеет' : ''} · ${DOING[mode.name] || mode.name}`;
  };

  addEventListener('pagehide', () => mode.savePet());
  const frame = () => {
    serviceButton();
    mode.update();
    mode.draw(ctx);
    serviceUi();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  document.body.classList.add('ready');
}

main().catch(e => { document.getElementById('status').textContent = 'Не загрузилось: ' + e.message; });

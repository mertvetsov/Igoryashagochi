'use strict';
// Трещины на стекле экрана: каждый удар кулаком добавляет уровень — лучи
// длиннее, ответвления, кольца между лучами. Рисуются поверх всего и не
// трясутся вместе с картинкой (это стекло, а не комната). Геометрия
// растеризуется в пиксели один раз на удар — на устройстве это список точек.

window.Cracks = function (ctx, CELL) {
  const RAYS = 7;
  const REACH = [0, 11, 28, 52, 92];      // длина лучей на уровнях 1…4
  const RINGS = [[2, 9], [3, 20], [4, 36]]; // [с какого уровня, радиус] кольца между лучами
  const FADE_MS = 2500;

  let pixels = [];      // [x, y, level]
  let level = 0;
  let alpha = 0;
  let fading = false;

  // Повторяемый генератор (mulberry32): у каждого стекла свой рисунок.
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Брезенхем: отрезок в пиксели с пометкой уровня.
  function line(x0, y0, x1, y1, lv, out) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      out.push([x0, y0, lv]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  function build(cx, cy) {
    const rand = rng((Math.random() * 1e9) | 0);
    const out = [];
    const rays = [];
    for (let i = 0; i < RAYS; i++) {
      // ломаный луч: шаги 4–7 px, угол гуляет; уровень пикселя — по пройденной длине
      let a = (i / RAYS) * Math.PI * 2 + (rand() - 0.5) * 0.6;
      const scale = 0.65 + rand() * 0.6;
      let x = cx, y = cy, dist = 0;
      const pts = [[x, y, 0]];
      while (dist < REACH[4] * scale) {
        const step = 4 + rand() * 3;
        a += (rand() - 0.5) * 0.7;
        const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
        dist += step;
        const lv = REACH.findIndex(r => dist / scale <= r);
        line(x, y, nx, ny, lv < 1 ? 4 : lv, out);
        // ответвление: короткая веточка вбок, появляется на уровень позже
        if (dist > 14 && rand() < 0.22) {
          const ba = a + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.5);
          const bl = 5 + rand() * 11;
          line(nx, ny, nx + Math.cos(ba) * bl, ny + Math.sin(ba) * bl, Math.min(4, (lv < 1 ? 4 : lv) + 1), out);
        }
        x = nx; y = ny;
        pts.push([x, y, dist / scale]);
      }
      rays.push(pts);
    }
    // кольца: соединяем соседние лучи на радиусе r ломаной с изломом посередине
    for (const [lv, r] of RINGS) {
      const at = rays.map(pts => pts.find(p => p[2] >= r) || pts[pts.length - 1]);
      for (let i = 0; i < RAYS; i++) {
        if (rand() < 0.25) continue;   // не каждое звено — стекло трескается неровно
        const p = at[i], q = at[(i + 1) % RAYS];
        const mx = (p[0] + q[0]) / 2 + (rand() - 0.5) * 4, my = (p[1] + q[1]) / 2 + (rand() - 0.5) * 4;
        line(p[0], p[1], mx, my, lv, out);
        line(mx, my, q[0], q[1], lv, out);
      }
    }
    // точка удара — выбитая крошка
    for (let i = 0; i < 9; i++) out.push([cx + Math.round((rand() - 0.5) * 4), cy + Math.round((rand() - 0.5) * 4), 1]);
    return out.filter(([x, y]) => x >= 0 && y >= 0 && x < CELL && y < CELL);
  }

  // Новая серия ударов — целое стекло.
  function reset() {
    level = 0;
    pixels = [];
    fading = false;
  }

  function hit(x, y) {
    if (!level || fading) { pixels = build(x, y); level = 0; }
    level = Math.min(REACH.length - 1, level + 1);
    alpha = 1;
    fading = false;
  }

  // active — идёт анимация с ударами; после неё трещины тают.
  function update(dt, active) {
    if (!level) return;
    if (!active) fading = true;
    if (fading) {
      alpha -= dt / FADE_MS;
      if (alpha <= 0) { level = 0; pixels = []; fading = false; }
    }
  }

  function draw() {
    if (!level) return;
    const a = Math.max(0, alpha);
    ctx.fillStyle = `rgba(16,20,26,${(0.55 * a).toFixed(2)})`;   // тень трещины
    for (const [x, y, lv] of pixels) if (lv <= level) ctx.fillRect(x + 1, y + 1, 1, 1);
    ctx.fillStyle = `rgba(236,244,255,${(0.9 * a).toFixed(2)})`; // блик на изломе
    for (const [x, y, lv] of pixels) if (lv <= level) ctx.fillRect(x, y, 1, 1);
  }

  return { hit, reset, update, draw, get level() { return level; } };
};

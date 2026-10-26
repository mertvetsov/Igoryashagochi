'use strict';
// Куча в углу комнаты. Растёт с каждым «посрать»: сверху падает комок, куча
// плюхается с упругой деформацией и брызгами. Над большой кучей летают мухи
// и поднимается запах. Сама куча — кадр листа pile (кадр = размер), всё
// остальное рисуется кодом из прямоугольников по пикселю — на устройстве так же.

window.Heap = function (ctx, image, cfg) {
  const { CELL, frames } = cfg;
  const [AX, AY] = cfg.anchor;            // низ кучи по центру, как в build_sprites.py
  const DROP_MS = 260, SQUASH_MS = 480, CLEAN_MS = 420;
  const GRAVITY = 0.0005;                 // px/мс² для брызг

  let count = 0;                          // сколько раз сходил (размер ограничен frames)
  let anim = null;                        // { kind: 'plop' | 'clean', from, t }
  let parts = [];                         // брызги и пыль
  let t = 0;                              // часы эффектов, мс

  // Верх и ширина каждого размера — чтобы комок падал на верхушку, а мухи вились над ней.
  const bounds = (() => {
    const c = document.createElement('canvas');
    c.width = CELL * frames;
    c.height = CELL;
    const g = c.getContext('2d');
    g.drawImage(image, 0, 0);
    const data = g.getImageData(0, 0, c.width, CELL).data;
    return Array.from({ length: frames }, (_, f) => {
      let top = CELL, x0 = CELL, x1 = 0;
      for (let y = 0; y < CELL; y++)
        for (let x = 0; x < CELL; x++)
          if (data[(y * c.width + f * CELL + x) * 4 + 3]) {
            top = Math.min(top, y);
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
          }
      return { top, w: x1 - x0 + 1 };
    });
  })();

  const size = n => Math.min(n, frames);  // 0 — пусто, 1…frames — кадр size-1
  const topOf = s => (s ? bounds[s - 1].top : AY);

  function burst(x, y, n, colors, up) {
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.15 + 0.7 * Math.random());
      const v = 0.04 + Math.random() * 0.07;
      parts.push({ x, y, vx: Math.cos(a) * v * (Math.random() < 0.5 ? -1 : 1), vy: -Math.sin(a) * v * up,
                   life: 420 + Math.random() * 260, color: colors[i % colors.length] });
    }
  }

  function add() {
    anim = { kind: 'plop', from: size(count), t: 0 };
    count++;
  }

  function clean() {
    if (!count) return;
    anim = { kind: 'clean', from: size(count), t: 0 };
    burst(AX, topOf(size(count)) + 6, 10, ['#b9b3a4', '#8f897c', '#d6d1c4'], 0.6);
    count = 0;
  }

  function update(dt) {
    t += dt;
    if (anim) {
      const before = anim.t;
      anim.t += dt;
      if (anim.kind === 'plop' && before < DROP_MS && anim.t >= DROP_MS)
        burst(AX, topOf(size(count)), 9, ['#6b3a17', '#8a4f22', '#4a2810'], 1);
      const total = anim.kind === 'plop' ? DROP_MS + SQUASH_MS : CLEAN_MS;
      if (anim.t >= total) anim = null;
    }
    for (const p of parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += GRAVITY * dt;
      if (p.y > AY) { p.y = AY; p.vx *= 0.5; p.vy = 0; }   // брызги ложатся на пол
      p.life -= dt;
    }
    parts = parts.filter(p => p.life > 0);
  }

  function drawFrame(s, sx = 1, sy = 1) {
    if (!s) return;
    ctx.save();
    ctx.translate(AX, AY);
    ctx.scale(sx, sy);
    ctx.translate(-AX, -AY);
    ctx.drawImage(image, (s - 1) * CELL, 0, CELL, CELL, 0, 0, CELL, CELL);
    ctx.restore();
  }

  // Куча — под Игоряшей (он может встать перед ней).
  function drawPile() {
    const s = size(count);
    if (!anim) return drawFrame(s);
    if (anim.kind === 'clean') {
      const k = 1 - Math.min(1, anim.t / CLEAN_MS);
      return drawFrame(anim.from, k * k * (1.15 - 0.15 * k), k);   // сплющивается и исчезает
    }
    if (anim.t < DROP_MS) {
      // старая куча лежит, сверху падает комок (самый маленький размер, поменьше)
      drawFrame(anim.from);
      const k = anim.t / DROP_MS;
      const y = topOf(anim.from) - 46 * (1 - k * k);
      ctx.save();
      ctx.translate(AX, y);
      ctx.scale(0.5, 0.5);
      ctx.translate(-AX, -AY);
      ctx.drawImage(image, 0, 0, CELL, CELL, 0, 0, CELL, CELL);
      ctx.restore();
      return;
    }
    // плюх: новый размер, упругое сплющивание с затуханием
    const tb = anim.t - DROP_MS;
    const wobble = Math.exp(-tb / 120) * Math.cos(tb / 55);
    drawFrame(s, 1 + 0.28 * wobble, 1 - 0.34 * wobble);
  }

  // Брызги, мухи, запах — поверх Игоряши.
  function drawFx() {
    for (const p of parts) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    }
    const s = anim && anim.kind === 'clean' ? 0 : size(count);
    if (!s) return;
    const { top, w } = bounds[s - 1];
    if (s >= cfg.stink.from) drawStink(top, w);
    const flies = cfg.flies.count[s - 1];
    for (let i = 0; i < flies; i++) drawFly(i, top, w);
  }

  // Муха: тельце 3×2 с тёмной головой, крылышки 2×1, машут через 50 мс.
  // Летает по петлям вокруг верхушки (сумма синусов, без случайности — повторяемо).
  function drawFly(i, top, w) {
    const p = i * 2.39;
    const x = AX + (w / 2 + 3) * Math.sin(t * 0.0021 * (1 + i * 0.13) + p) + 3 * Math.sin(t * 0.011 + p * 3);
    const y = top - 9 - 7 * Math.sin(t * 0.0033 * (1 + i * 0.21) + p * 1.7) + 2 * Math.sin(t * 0.017 + p);
    const fx = Math.round(x), fy = Math.round(y), up = Math.floor(t / 50 + i) % 2;
    ctx.fillStyle = '#f2f6f8';
    ctx.fillRect(fx - 2, fy - 1 - up, 2, 1);
    ctx.fillRect(fx + 3, fy - 1 - up, 2, 1);
    ctx.fillStyle = '#0d0c0a';
    ctx.fillRect(fx, fy, 3, 2);
    ctx.fillStyle = '#3a6f2a';   // зелёный отлив, как у мясной мухи
    ctx.fillRect(fx + 1, fy, 1, 1);
  }

  // Запах: три волнистые зелёные струйки в 2 px, поднимаются и тают.
  function drawStink(top, w) {
    for (let j = 0; j < 3; j++) {
      const phase = (t / 2200 + j / 3) % 1;
      const base = top + 2 - phase * 18;
      const x0 = AX - w / 4 + (j * w) / 4;
      const fade = Math.min(1, phase * 5) * (1 - phase);    // проявляется и тает
      for (let k = 0; k < 14; k++) {
        const a = fade * (1 - k / 16) * 1.6;
        ctx.fillStyle = `rgba(166,214,78,${Math.min(0.95, a).toFixed(2)})`;
        ctx.fillRect(Math.round(x0 + 2.5 * Math.sin(k * 0.6 + t * 0.006 + j * 2)), Math.round(base - k), 2, 1);
      }
    }
  }

  return { add, clean, update, drawPile, drawFx, get count() { return count; } };
};

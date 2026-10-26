'use strict';
const { CELL, sheets, animations, play, lighting, timeOfDay, commonPhrases } = window.IGORYASHA;
const COMMON_SHARE = 0.35;   // доля коронных фраз среди реплик
const $ = id => document.getElementById(id);
const canvas = $('screen'), ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const assets = {};
const autoQueue = ['scratch', 'walk', 'hungry', 'eat', 'poop', 'tanks', 'walk', 'love', 'sick', 'scratch'];
const MAX_PILES = 5;

let state = 'idle', current = null, elapsed = 0, auto = true, paused = false, speed = 1, ready = false;
let last = 0, phrase = '', queueIndex = 0, piles = 0, events = [];

function addLog(text) {
  events = [text, ...events].slice(0, 6);
  $('log').replaceChildren(...events.map(t => {
    const s = document.createElement('span');
    s.textContent = t;
    return s;
  }));
}

function setState(next, manual = false) {
  state = next;
  current = play(next);
  elapsed = 0;
  phrase = pickPhrase(animations[next]);
  if (manual) auto = false;
  updateUI();
  addLog(animations[next].label);
}

function updateUI() {
  $('status').textContent = animations[state].label;
  $('mode').textContent = auto ? 'АВТО' : 'ВРУЧНУЮ';
  $('auto').classList.toggle('active', auto);
  $('auto').setAttribute('aria-pressed', auto);
  $('pause').classList.toggle('active', paused);
  $('pause').textContent = paused ? 'Продолжить' : 'Пауза';
  $('pause').setAttribute('aria-pressed', paused);
  $('live').textContent = paused ? 'ПАУЗА' : auto ? 'ЖИВЁТ СВОЮ ЖИЗНЬ' : 'РУЧНОЙ РЕЖИМ';
  document.querySelectorAll('[data-action]').forEach(b => {
    const on = b.dataset.action === (animations[state].group || state);
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on);
  });
  $('poopCount').textContent = 'на полу: ' + piles;
}

// Индекс шага анимации и время внутри него.
function frameAt(t) {
  const frames = current.frames;
  let start = 0;
  for (let i = 0; i < frames.length; i++) {
    if (t < start + frames[i].ms) return { index: i, frame: frames[i].frame, local: t - start };
    start += frames[i].ms;
  }
  const i = frames.length - 1;
  return { index: i, frame: frames[i].frame, local: frames[i].ms };
}

function walkOffset(a, f) {
  const path = a.path;
  let k = 0;
  while (k < path.length - 2 && f.frame >= path[k + 1][0]) k++;
  const [f0, x0] = path[k], [f1, x1] = path[k + 1];
  const pos = Math.min(a.frames.length - 1, f.frame + Math.min(1, f.local / a.frames[f.index].ms));
  return x0 + (x1 - x0) * Math.min(1, (pos - f0) / (f1 - f0));
}

function drawTile(name, frame, dx) {
  const cols = sheets[name].cols;
  ctx.drawImage(assets[name], (frame % cols) * CELL, Math.floor(frame / cols) * CELL, CELL, CELL,
    Math.round(dx), 0, CELL, CELL);
}

function drawBackground() {
  const bg = $('background').value;
  if (bg === 'room') return ctx.drawImage(assets.room, 0, 0, CELL, CELL);
  ctx.fillStyle = { gray: '#808080', light: '#eeeee7', dark: '#272c27', checker: '#c4c4be' }[bg];
  ctx.fillRect(0, 0, CELL, CELL);
  if (bg !== 'checker') return;
  ctx.fillStyle = '#e4e4de';
  for (let y = 0; y < CELL; y += 12)
    for (let x = 0; x < CELL; x += 12)
      if ((x + y) / 12 % 2 === 0) ctx.fillRect(x, y, 12, 12);
}

function drawGrid() {
  ctx.strokeStyle = '#d8f47844';
  ctx.lineWidth = 0.5;
  for (let v = 0; v <= CELL; v += 20) {
    ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, CELL); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(CELL, v); ctx.stroke();
  }
  ctx.fillStyle = '#d8f478';
  ctx.fillRect(0, 200, CELL, 1);
}

// Реплика своя для действия, но иногда Игоряша просто выдаёт коронное.
function pickPhrase(a) {
  const pool = !a.ownPhrasesOnly && Math.random() < COMMON_SHARE ? commonPhrases : a.phrases;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Разбивка по словам в строки, которые влезают в ширину пузыря.
function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  return [...lines, line];
}

// Пузырь во всю ширину экрана, с хвостиком вниз к голове.
const BUBBLE = { x: 6, y: 6, w: CELL - 12, pad: 7, line: 16, font: 'bold 14px monospace' };
function drawSpeech() {
  const b = BUBBLE;
  ctx.font = b.font;
  const lines = wrap(phrase, b.w - 2 * b.pad);
  const h = lines.length * b.line + 2 * b.pad - 2;
  ctx.fillStyle = '#22281e';   // тёмная рамка в 1 px — читается и днём, и ночью
  ctx.fillRect(b.x - 1, b.y - 1, b.w + 2, h + 2);
  ctx.beginPath();
  ctx.moveTo(112, b.y + h); ctx.lineTo(126, b.y + h); ctx.lineTo(119, b.y + h + 9);
  ctx.fill();
  ctx.fillStyle = '#eff1dc';
  ctx.fillRect(b.x, b.y, b.w, h);
  ctx.beginPath();
  ctx.moveTo(113, b.y + h - 1); ctx.lineTo(125, b.y + h - 1); ctx.lineTo(119, b.y + h + 7);
  ctx.fill();
  ctx.fillStyle = '#22281e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, CELL / 2, b.y + b.pad + i * b.line));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// Сдвиг всей картинки при ударе по стеклу. Считается от времени внутри кадра,
// поэтому работает и на паузе, и при покадровом шаге.
function shakeOffset(a, f) {
  const s = a.shake;
  if (!s || !$('shake').checked || !s.frames.includes(f.frame) || f.local >= s.ms) return [0, 0];
  return s.path[Math.floor(f.local / s.ms * s.path.length)];
}

// Карта освещения на каждое время суток: считается один раз, потом
// каждый кадр просто умножается на неё (на устройстве — то же умножение по таблице).
const lightMaps = {};
function lightMap(name) {
  if (name in lightMaps) return lightMaps[name];
  const L = lighting[name];
  if (!L.tint) return (lightMaps[name] = null);
  const map = document.createElement('canvas');
  map.width = map.height = CELL;
  const m = map.getContext('2d');
  m.fillStyle = `rgb(${L.tint})`;
  m.fillRect(0, 0, CELL, CELL);
  m.globalCompositeOperation = 'lighter';
  for (const l of L.lights) {
    const g = m.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
    g.addColorStop(0, `rgba(${l.color},${l.power})`);
    g.addColorStop(1, `rgba(${l.color},0)`);
    m.fillStyle = g;
    m.fillRect(0, 0, CELL, CELL);
  }
  return (lightMaps[name] = map);
}

function currentLight() {
  const v = $('light').value;
  return v === 'auto' ? timeOfDay() : v;
}

function applyLight(name) {
  const map = lightMap(name);
  if (!map) return;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(map, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

function draw() {
  const a = current, f = frameAt(elapsed);
  const [sx, sy] = shakeOffset(a, f);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, CELL, CELL);
  ctx.save();
  ctx.translate(sx, sy);
  drawBackground();
  if ($('grid').checked) drawGrid();

  // Старые кучки отъезжают влево, свежая — в кадре самого спрайта.
  for (let i = 0; i < piles; i++) ctx.drawImage(assets.pile, -(piles - 1 - i) * 8 - (a.leavesPile ? 8 : 0), 0);
  drawTile(a.sheet, f.frame, a.path ? walkOffset(a, f) : 0);
  const light = currentLight();
  applyLight(light);   // реплики — интерфейс, их не затемняем
  if ($('speech').checked && elapsed < 2600) drawSpeech();
  ctx.restore();

  $('lightNow').textContent = lighting[light].label.toLowerCase();
  $('frame').textContent = `кадр ${String(f.frame + 1).padStart(2, '0')} / ${sheets[a.sheet].frames}`;
  $('progress').style.width = Math.min(100, elapsed / a.duration * 100) + '%';
}

function complete() {
  const a = current;
  if (a.leavesPile) piles = Math.min(MAX_PILES, piles + 1);
  if (a.next) return setState(a.next[Math.floor(Math.random() * a.next.length)]);
  if (auto && state === 'idle') setState(autoQueue[queueIndex++ % autoQueue.length]);
  else setState('idle');
}

function tick(now) {
  if (!last) last = now;
  const dt = Math.min(100, now - last);
  last = now;
  if (!paused) {
    elapsed += dt * speed;
    if (elapsed >= current.duration) complete();
  }
  draw();
  requestAnimationFrame(tick);
}

function step() {
  paused = true;
  const f = frameAt(elapsed);
  elapsed += current.frames[f.index].ms - f.local + 0.1;
  if (elapsed >= current.duration) complete();
  updateUI();
  draw();
}

function bindUI() {
  document.querySelectorAll('[data-action]').forEach(b => b.onclick = () => {
    paused = false;
    setState(b.dataset.action, true);
  });
  $('auto').onclick = () => { auto = !auto; updateUI(); };
  $('pause').onclick = () => { paused = !paused; updateUI(); };
  $('step').onclick = step;
  $('clean').onclick = () => { piles = 0; updateUI(); addLog('Пол чистый. Пока.'); };
  $('speed').oninput = e => { speed = Number(e.target.value); $('speedValue').textContent = speed + '×'; };
  $('zoom').onchange = e => { canvas.style.width = Number(e.target.value) * CELL + 'px'; };
  document.addEventListener('keydown', e => {
    if (/INPUT|SELECT|BUTTON/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); $('pause').click(); }
    if (e.code === 'ArrowRight') { e.preventDefault(); step(); }
  });
}

function load(name, src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => { assets[name] = im; resolve(); };
    im.onerror = () => reject(new Error('Не удалось загрузить ' + src));
    im.src = src + '?v=' + window.BUILD;
  });
}

Promise.all(Object.entries(sheets).map(([name, s]) => load(name, s.src)))
  .then(() => {
    ready = true;
    bindUI();
    setState('idle');
    requestAnimationFrame(tick);
  })
  .catch(e => {
    $('error').textContent = e.message;
    $('status').textContent = 'Ошибка загрузки';
  });

window.animationLab = {
  get state() { return state; }, get current() { return current; }, get ready() { return ready; },
  get elapsed() { return elapsed; }, get piles() { return piles; },
  setState, step, animations,
};

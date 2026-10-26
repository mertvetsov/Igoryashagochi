'use strict';
const { CELL, sheets, animations } = window.IGORYASHA;
const $ = id => document.getElementById(id);
const canvas = $('screen'), ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const assets = {};
const autoQueue = ['scratch', 'walk', 'hungry', 'poop', 'walk', 'scratch'];
const MAX_PILES = 5;

let state = 'idle', elapsed = 0, auto = true, paused = false, speed = 1, ready = false;
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
  elapsed = 0;
  const p = animations[next].phrases;
  phrase = p[Math.floor(Math.random() * p.length)];
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
    b.classList.toggle('active', b.dataset.action === state);
    b.setAttribute('aria-pressed', b.dataset.action === state);
  });
  $('poopCount').textContent = 'на полу: ' + piles;
}

// Индекс шага анимации и время внутри него.
function frameAt(t) {
  const frames = animations[state].frames;
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

function drawSpeech() {
  ctx.font = 'bold 9px monospace';
  const w = Math.min(230, ctx.measureText(phrase).width + 16), x = (CELL - w) / 2;
  ctx.fillStyle = '#eff1dc';
  ctx.fillRect(x, 10, w, 21);
  ctx.fillStyle = '#22281e';
  ctx.textAlign = 'center';
  ctx.fillText(phrase, CELL / 2, 24);
  ctx.textAlign = 'left';
}

function draw() {
  ctx.clearRect(0, 0, CELL, CELL);
  drawBackground();
  if ($('grid').checked) drawGrid();

  const a = animations[state], f = frameAt(elapsed);
  // Старые кучки отъезжают влево, свежая — в кадре самого спрайта.
  for (let i = 0; i < piles; i++) ctx.drawImage(assets.pile, -(piles - 1 - i) * 8 - (a.leavesPile ? 8 : 0), 0);
  drawTile(a.sheet, f.frame, a.path ? walkOffset(a, f) : 0);
  if ($('speech').checked && elapsed < 2600) drawSpeech();

  $('frame').textContent = `кадр ${String(f.frame + 1).padStart(2, '0')} / ${sheets[a.sheet].frames}`;
  $('progress').style.width = Math.min(100, elapsed / a.duration * 100) + '%';
}

function complete() {
  if (animations[state].leavesPile) piles = Math.min(MAX_PILES, piles + 1);
  if (auto && state === 'idle') setState(autoQueue[queueIndex++ % autoQueue.length]);
  else setState('idle');
}

function tick(now) {
  if (!last) last = now;
  const dt = Math.min(100, now - last);
  last = now;
  if (!paused) {
    elapsed += dt * speed;
    if (elapsed >= animations[state].duration) complete();
  }
  draw();
  requestAnimationFrame(tick);
}

function step() {
  paused = true;
  const f = frameAt(elapsed);
  elapsed += animations[state].frames[f.index].ms - f.local + 0.1;
  if (elapsed >= animations[state].duration) complete();
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
    im.src = src;
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
  get state() { return state; }, get ready() { return ready; },
  get elapsed() { return elapsed; }, get piles() { return piles; },
  setState, step, animations,
};

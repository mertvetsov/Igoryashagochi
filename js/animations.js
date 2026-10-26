'use strict';
// Данные анимаций. Отдельно от движка, чтобы потом сгенерировать из них
// таблицы для прошивки GeekMagic (ESP8266/ESP32, экран 240×240).
// Спрайтшиты собирает tools/build_sprites.py: ячейка 240×240, ноги на y=199.

(function () {
  const seq = (frames, delays) =>
    frames.map((frame, i) => ({ frame, ms: Array.isArray(delays) ? delays[i] : delays }));
  const range = n => Array.from({ length: n }, (_, i) => i);

  const sheets = {
    // 0–15 дыхание, 16–23 моргание, 24–39 чешет жопу; 0, 15, 16, 24, 39 — одна поза покоя
    idle:    { src: 'assets/sprites/idle.png',    cols: 8, frames: 40 },
    hungry:  { src: 'assets/sprites/hungry.png',  cols: 4, frames: 16 },
    walk:    { src: 'assets/sprites/walk.png',    cols: 6, frames: 24 },
    poop:    { src: 'assets/sprites/poop.png',    cols: 4, frames: 16 },
    eat:     { src: 'assets/sprites/eat.png',     cols: 6, frames: 24 },
    sick:    { src: 'assets/sprites/sick.png',    cols: 6, frames: 24 },
    tanks:      { src: 'assets/sprites/tanks.png',      cols: 6, frames: 24 },
    tanks_win:  { src: 'assets/sprites/tanks_win.png',  cols: 6, frames: 24 },
    tanks_lose: { src: 'assets/sprites/tanks_lose.png', cols: 6, frames: 24 },
    room:    { src: 'assets/sprites/room.png' },
    pile:    { src: 'assets/sprites/pile.png' },
  };

  // Статика: плавное дыхание 0–15 (цикл 3,2 с) и моргание в случайный момент.
  // Моргание (17–21) нарисовано в позе покоя, поэтому вставляется между вдохами.
  const BREATH = seq(range(16), 200);
  const BLINK = seq([17, 18, 19, 20, 21], [40, 40, 50, 40, 50]);
  function idleFrames(rand = Math.random) {
    const cycles = 2 + Math.floor(rand() * 2);   // 2–3 вдоха
    const blinks = new Set([Math.floor(rand() * cycles)]);
    if (rand() < 0.35) blinks.add(Math.floor(rand() * cycles));
    const frames = [];
    for (let c = 0; c < cycles; c++) {
      frames.push(...BREATH);
      if (!blinks.has(c)) continue;
      frames.push(...BLINK);
      if (rand() < 0.25) frames.push({ frame: 16, ms: 140 }, ...BLINK);   // двойное
    }
    return frames;
  }
  // Чешет жопу: заводит руку (25–27), чешет 28–35 (цикл нарисован дважды), опускает (36–38).
  const scratchSeq = range(16).map(i => i + 24);
  const scratchMs = [150, 160, 160, 160, ...Array(8).fill(120), 160, 160, 160, 300];
  // Голод: стучит кулаком в экран (кадры 4–7) два раза подряд, потом показывает на рот и живот.
  const hungrySeq = [0, 1, 2, 3, 4, 5, 6, 7, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const hungryMs = [600, 200, 200, 300, 160, 140, 160, 140, 160, 140, 160, 260,
                    300, 350, 200, 300, 250, 250, 450, 600];
  // Еда: садится и берёт миску (0–7), ест кадрами 8–15 три подхода, встаёт и гладит живот.
  const eatLoop = [8, 9, 10, 11, 12, 13, 14, 15];
  const eatLoopMs = [180, 170, 170, 200, 220, 220, 170, 200];
  const eatSeq = [...range(8), ...eatLoop, ...eatLoop, ...eatLoop, 16, 17, 18, 19, 20, 21, 20, 21, 22, 23];
  const eatMs = [500, 220, 220, 260, 260, 300, 350, 300, ...eatLoopMs, ...eatLoopMs, ...eatLoopMs,
                 300, 260, 220, 220, 300, 300, 300, 300, 300, 600];
  // Танки: достаёт ноут и садится (0–11), рубится кадрами 12–23 три катки подряд,
  // дальше случайно победа или проигрыш (отдельные листы).
  const tanksLoop = range(12).map(i => i + 12);
  const tanksLoopMs = [130, 220, 130, 220, 130, 240, 130, 220, 130, 130, 160, 130];
  const tanksSeq = [...range(12), ...tanksLoop, ...tanksLoop, ...tanksLoop];
  const tanksMs = [500, 250, 250, 300, 250, 250, 300, 250, 250, 250, 250, 250,
                   ...tanksLoopMs, ...tanksLoopMs, ...tanksLoopMs];
  const winSeq = [...range(19), 17, 18, 19, 20, 21, 22, 23];
  const winMs = [300, 300, 250, 400, 250, 250, 220, 220, 220, 220, 220, 220,
                 220, 220, 220, 220, 220, 300, 300, 300, 300, 250, 300, 300, 400, 700];
  const loseMs = [200, 200, 250, 300, 250, 250, 250, 250, 300, 350, 400, 350,
                  250, 250, 350, 250, 450, 350, 350, 500, 350, 350, 350, 700];
  // Удар по стеклу: весь экран дёргается и затухает.
  const SHAKE = [[3, -1], [-3, 1], [2, 1], [-2, -1], [1, 0], [-1, 0]];

  const animations = {
    idle: {
      label: 'Стоит. Подозрительно спокойно.',
      sheet: 'idle',
      build: idleFrames,   // кадры собираются заново на каждый показ
      phrases: ['Ну чо вы смотрите?', 'О_О', 'Я всё контролирую.'],
    },
    scratch: {
      label: 'Чешет жопу',
      sheet: 'idle',
      frames: seq(scratchSeq, scratchMs),
      phrases: ['Задумался.', 'Дела житейские.'],
    },
    walk: {
      label: 'Нервно ходит туда-сюда',
      sheet: 'walk',
      frames: seq(range(24), [450, 170, 170, 170, 170, 170, 280, 170, 170, 170, 170, 170,
                              170, 170, 170, 170, 170, 280, 170, 170, 170, 170, 170, 450]),
      // [кадр, смещение по x]: стоит на развороте, двигается только на шагах
      path: [[0, 0], [1, 0], [6, 44], [7, 44], [17, -44], [18, -44], [23, 0]],
      phrases: ['Чёт нервно мне.', 'Туда. Сюда. Обратно.'],
    },
    hungry: {
      label: 'Требует хинкал',
      sheet: 'hungry',
      frames: seq(hungrySeq, hungryMs),
      // кулак ближе всего к стеклу — удар
      shake: { frames: [5, 7], ms: 140, path: SHAKE },
      phrases: ['А хинкал будет?', 'Ну покормите уже.'],
    },
    eat: {
      label: 'Ест похлёбку',
      sheet: 'eat',
      frames: seq(eatSeq, eatMs),
      phrases: ['Ммм, похлёбочка.', 'Наконец-то покормили.'],
    },
    sick: {
      label: 'Заболел. Тошнит.',
      sheet: 'sick',
      // зеленеет (0–5), согнулся и тошнит (6–17), отходит (18–23)
      frames: seq(range(24), [600, 300, 300, 350, 350, 450, 300, 250, 160, 160, 140, 140,
                              140, 160, 180, 300, 350, 400, 400, 350, 350, 350, 350, 600]),
      phrases: ['Чёт мне нехорошо…', 'Похлёбка была несвежая.'],
    },
    tanks: {
      label: 'Играет в танки',
      sheet: 'tanks',
      frames: seq(tanksSeq, tanksMs),
      next: ['tanks_win', 'tanks_lose'],
      phrases: ['Ща я их всех.', 'Куда ты едешь?!', 'Арта, ну ёпт.'],
    },
    tanks_win: {
      group: 'tanks',
      label: 'Затащил катку',
      sheet: 'tanks_win',
      frames: seq(winSeq, winMs),
      phrases: ['Изи катка!', 'Тащу!'],
    },
    tanks_lose: {
      group: 'tanks',
      label: 'Слил катку. Ноутбуку конец.',
      sheet: 'tanks_lose',
      frames: seq(range(24), loseMs),
      // бьёт ноутом об пол и топчет обломки
      shake: { frames: [11, 14], ms: 180, path: SHAKE },
      phrases: ['Это всё лаги!', 'Ноут виноват.'],
    },
    poop: {
      label: 'У него важное дело',
      sheet: 'poop',
      frames: seq(range(16), [500, 220, 220, 250, 300, 300, 300, 300, 400, 450, 400, 300, 250, 300, 300, 600]),
      leavesPile: true,
      phrases: ['Отойдите на минутку.', 'Хинкал был лишний.'],
    },
  };

  // Показ анимации: собранные кадры и их общая длительность.
  function play(name) {
    const a = animations[name];
    const frames = a.build ? a.build() : a.frames;
    return { ...a, name, frames, duration: frames.reduce((n, f) => n + f.ms, 0) };
  }

  window.IGORYASHA = { CELL: 240, sheets, animations, play };
})();

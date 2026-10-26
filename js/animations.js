'use strict';
// Данные анимаций. Отдельно от движка, чтобы потом сгенерировать из них
// таблицы для прошивки GeekMagic (ESP8266/ESP32, экран 240×240).
// Спрайтшиты собирает tools/build_sprites.py: ячейка 240×240, ноги на y=199.

(function () {
  const seq = (frames, delays) =>
    frames.map((frame, i) => ({ frame, ms: Array.isArray(delays) ? delays[i] : delays }));
  const range = n => Array.from({ length: n }, (_, i) => i);

  const sheets = {
    // 0–5 дыхание, 6–11 те же кадры с закрытыми глазами, 12–23 чешет жопу
    idle:    { src: 'assets/sprites/idle.png',    cols: 6, frames: 24 },
    hungry:  { src: 'assets/sprites/hungry.png',  cols: 4, frames: 16 },
    walk:    { src: 'assets/sprites/walk.png',    cols: 6, frames: 24 },
    poop:    { src: 'assets/sprites/poop.png',    cols: 4, frames: 16 },
    eat:     { src: 'assets/sprites/eat.png',     cols: 6, frames: 24 },
    sick:    { src: 'assets/sprites/sick.png',    cols: 6, frames: 24 },
    tanks:      { src: 'assets/sprites/tanks.png',      cols: 6, frames: 24 },
    tanks_win:  { src: 'assets/sprites/tanks_win.png',  cols: 6, frames: 24 },
    tanks_lose: { src: 'assets/sprites/tanks_lose.png', cols: 6, frames: 24 },
    love:    { src: 'assets/sprites/love.png',    cols: 8, frames: 24 },
    room:    { src: 'assets/sprites/room.png' },
    pile:    { src: 'assets/sprites/pile.png' },
  };

  // Статика: дышит кадрами 0–5 и иногда моргает. Кадр k+BLINK — это кадр
  // дыхания k с пересаженными закрытыми веками, поэтому моргнуть можно на любой фазе.
  const BREATH = [400, 300, 300, 400, 300, 300];
  const BLINK = 6, BLINK_MS = 100;
  function idleFrames(rand = Math.random) {
    const cycles = 3 + Math.floor(rand() * 3);   // 3–5 вдохов
    const frames = [];
    for (let c = 0; c < cycles; c++) BREATH.forEach((ms, k) => frames.push({ frame: k, ms }));
    const blinks = rand() < 0.35 ? 2 : 1;
    for (let b = 0; b < blinks; b++) {
      const i = Math.floor(rand() * frames.length);
      const k = frames[i].frame;
      if (k >= BLINK) continue;
      const blink = [{ frame: k + BLINK, ms: BLINK_MS }];
      if (rand() < 0.25) blink.push({ frame: k, ms: 120 }, { frame: k + BLINK, ms: BLINK_MS });   // двойное
      frames.splice(i + 1, 0, ...blink);
    }
    return frames;
  }
  // Чешет жопу: заводит руку (12–13), чешет кадрами 14–17 три раза, опускает руку (18–23).
  const scratchLoop = [14, 15, 16, 17];
  const scratchSeq = [12, 13, ...scratchLoop, ...scratchLoop, ...scratchLoop, 18, 19, 20, 21, 22, 23];
  const scratchMs = [300, 220, ...Array(12).fill(130), 220, 220, 200, 220, 260, 500];
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
  // Акт любви: достаёт куклу и надувает (0–7), обнимашки 8–15 по кругу,
  // кукла сдувается и лопается (16–17), испуг с прыжком и отходняк (18–23).
  const loveLoop = range(8).map(i => i + 8);
  const loveLoopMs = [240, 240, 380, 240, 240, 380, 240, 240];
  const loveSeq = [...range(8), ...loveLoop, ...loveLoop, ...loveLoop, ...range(8).map(i => i + 16)];
  const loveMs = [500, 300, 350, 400, 500, 350, 450, 350,
                  ...loveLoopMs, ...loveLoopMs, ...loveLoopMs,
                  450, 300, 250, 350, 350, 400, 400, 600];
  // Удар по стеклу: весь экран дёргается и затухает.
  const SHAKE = [[3, -1], [-3, 1], [2, 1], [-2, -1], [1, 0], [-1, 0]];

  const animations = {
    idle: {
      label: 'Стоит. Подозрительно спокойно.',
      sheet: 'idle',
      build: idleFrames,   // кадры собираются заново на каждый показ
      phrases: ['Ну чо вы смотрите?', 'О_О', 'Я всё контролирую.', 'Ну стою. И шо?', 'Ой, не начинайте.'],
    },
    scratch: {
      label: 'Чешет жопу',
      sheet: 'idle',
      frames: seq(scratchSeq, scratchMs),
      phrases: ['Задумался.', 'Дела житейские.', 'Ой вей, чешется.', 'Ну а шо, имею право.'],
    },
    walk: {
      label: 'Нервно ходит туда-сюда',
      sheet: 'walk',
      frames: seq(range(24), [450, 170, 170, 170, 170, 170, 280, 170, 170, 170, 170, 170,
                              170, 170, 170, 170, 170, 280, 170, 170, 170, 170, 170, 450]),
      // [кадр, смещение по x]: стоит на развороте, двигается только на шагах
      path: [[0, 0], [1, 0], [6, 44], [7, 44], [17, -44], [18, -44], [23, 0]],
      phrases: ['Чёт нервно мне.', 'Туда. Сюда. Обратно.', 'Ой вей, шо ж делать-то.', 'Ну ой, ну нервы.'],
    },
    hungry: {
      label: 'Требует хинкал',
      sheet: 'hungry',
      frames: seq(hungrySeq, hungryMs),
      // кулак ближе всего к стеклу — удар
      shake: { frames: [5, 7], ms: 140, path: SHAKE },
      phrases: ['А хинкал будет?', 'Ну покормите уже.', 'Ой вей, я голодный!', 'Ну ой, где еда?'],
    },
    eat: {
      label: 'Ест похлёбку',
      sheet: 'eat',
      frames: seq(eatSeq, eatMs),
      phrases: ['Ммм, похлёбочка.', 'Наконец-то покормили.', 'Ой, вкусно, ой.', 'Ну хоть шо-то.'],
    },
    sick: {
      label: 'Заболел. Тошнит.',
      sheet: 'sick',
      // зеленеет (0–5), согнулся и тошнит (6–17), отходит (18–23)
      frames: seq(range(24), [600, 300, 300, 350, 350, 450, 300, 250, 160, 160, 140, 140,
                              140, 160, 180, 300, 350, 400, 400, 350, 350, 350, 350, 600]),
      phrases: ['Чёт мне нехорошо…', 'Похлёбка была несвежая.', 'Ой вей, помираю.', 'Ну ой… ну всё.'],
    },
    tanks: {
      label: 'Играет в танки',
      sheet: 'tanks',
      frames: seq(tanksSeq, tanksMs),
      next: ['tanks_win', 'tanks_lose'],
      phrases: ['Ща я их всех.', 'Куда ты едешь?!', 'Арта, ну ёпт.', 'Ой вей, союзники…'],
    },
    tanks_win: {
      group: 'tanks',
      label: 'Затащил катку',
      sheet: 'tanks_win',
      frames: seq(winSeq, winMs),
      phrases: ['Ахаха, то есть мяу!', 'Лох и чичикака!'],
      ownPhrasesOnly: true,   // победный крик — без коронных «ой вей»
    },
    tanks_lose: {
      group: 'tanks',
      label: 'Слил катку. Ноутбуку конец.',
      sheet: 'tanks_lose',
      frames: seq(range(24), loseMs),
      // бьёт ноутом об пол и топчет обломки
      shake: { frames: [11, 14], ms: 180, path: SHAKE },
      phrases: ['Это всё лаги!', 'Ноут виноват.', 'ОЙ ВЕЙ!!!', 'Ну ой, ну шо такое…'],
    },
    love: {
      label: 'Акт любви',
      sheet: 'love',
      frames: seq(loveSeq, loveMs),
      // кукла лопается
      shake: { frames: [17], ms: 200, path: SHAKE },
      phrases: ['Ты у меня одна.', 'Только не лопни.', 'Ой, ну шо ты как неродная.'],
    },
    poop: {
      label: 'У него важное дело',
      sheet: 'poop',
      frames: seq(range(16), [500, 220, 220, 250, 300, 300, 300, 300, 400, 450, 400, 300, 250, 300, 300, 600]),
      leavesPile: true,
      phrases: ['Отойдите на минутку.', 'Хинкал был лишний.', 'Ой вей, ну вы чего смотрите.'],
    },
  };

  // Коронное Игоряши — иногда вместо реплики к действию.
  const commonPhrases = [
    'Ой вей.', 'Ну ой.', 'Ой вей из мир.', 'Ну ой, ну шо.', 'Ой, всё.',
    'Ну такое.', 'Ой, да ладно.', 'Ну шо началось-то?', 'Ой, мама.', 'Ну и ну.',
    'Вей.', 'Ну ой, ну куда.', 'Ой, не говорите.', 'Ну шо вы хотите от меня?',
  ];

  // Время суток. Свет накладывается на весь кадр — комнату и Игоряшу:
  // кадр умножается на карту освещения = общий тон + пятна от источников.
  // Источник: x, y, радиус, цвет «r,g,b», сила 0–1. День — без изменений.
  const lighting = {
    morning: {
      label: 'Утро',
      tint: [226, 192, 166],
      lights: [{ x: 217, y: 55, r: 170, color: [255, 236, 200], power: 0.9 }],   // солнце из окна
    },
    day: { label: 'День', tint: null, lights: [] },
    night: {
      label: 'Ночь',
      tint: [52, 62, 104],
      lights: [
        { x: 48, y: 82, r: 135, color: [255, 196, 120], power: 0.85 },   // торшер
        { x: 48, y: 80, r: 22, color: [255, 236, 180], power: 0.7 },     // сам абажур
        { x: 217, y: 55, r: 60, color: [90, 110, 160], power: 0.5 },     // фонари за окном
      ],
    },
  };
  // Утро 5–11, день 11–19, ночь — остальное.
  const timeOfDay = (hour = new Date().getHours()) =>
    hour >= 5 && hour < 11 ? 'morning' : hour >= 11 && hour < 19 ? 'day' : 'night';

  // Показ анимации: собранные кадры и их общая длительность.
  function play(name) {
    const a = animations[name];
    const frames = a.build ? a.build() : a.frames;
    return { ...a, name, frames, duration: frames.reduce((n, f) => n + f.ms, 0) };
  }

  window.IGORYASHA = { CELL: 240, sheets, animations, play, lighting, timeOfDay, commonPhrases };
})();

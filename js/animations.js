'use strict';
// Данные анимаций. Отдельно от движка, чтобы потом сгенерировать из них
// таблицы для прошивки GeekMagic (ESP8266/ESP32, экран 240×240).
// Спрайтшиты собирает tools/build_sprites.py: ячейка 240×240, ноги на y=199.

(function () {
  const seq = (frames, delays) =>
    frames.map((frame, i) => ({ frame, ms: Array.isArray(delays) ? delays[i] : delays }));
  const range = n => Array.from({ length: n }, (_, i) => i);

  const sheets = {
    // 0–5 дыхание, 6–11 те же кадры с закрытыми глазами
    idle:    { src: 'assets/sprites/idle.png',    cols: 6, frames: 12 },
    hungry:  { src: 'assets/sprites/hungry.png',  cols: 4, frames: 16 },
    walk:    { src: 'assets/sprites/walk.png',    cols: 6, frames: 24 },
    poop:    { src: 'assets/sprites/poop.png',    cols: 4, frames: 16 },
    eat:     { src: 'assets/sprites/eat.png',     cols: 6, frames: 24 },
    sick:    { src: 'assets/sprites/sick.png',    cols: 6, frames: 24 },
    tanks:      { src: 'assets/sprites/tanks.png',      cols: 6, frames: 24 },
    tanks_win:  { src: 'assets/sprites/tanks_win.png',  cols: 6, frames: 24 },
    tanks_lose: { src: 'assets/sprites/tanks_lose.png', cols: 6, frames: 24 },
    love:    { src: 'assets/sprites/love.png',    cols: 8, frames: 24 },
    sleep:   { src: 'assets/sprites/sleep.png',   cols: 6, frames: 24 },
    sad:     { src: 'assets/sprites/sad.png',     cols: 6, frames: 24 },
    pill:    { src: 'assets/sprites/pill.png',    cols: 4, frames: 16 },
    pill_item: { src: 'assets/sprites/pill_item.png' },   // таблетка 11×7, падает сверху
    dance:   { src: 'assets/sprites/dance.png',   cols: 6, frames: 24 },
    tv:      { src: 'assets/sprites/tv.png',      cols: 6, frames: 24 },
    scratch: { src: 'assets/sprites/scratch.png', cols: 4, frames: 16 },
    scared:  { src: 'assets/sprites/scared.png',  cols: 4, frames: 16 },
    love2:   { src: 'assets/sprites/love2.png',   cols: 6, frames: 24 },
    room:    { src: 'assets/sprites/room.png' },
    // куча в углу: кадр = размер (27…66 px в ширину), собирает build_sprites.py
    pile:    { src: 'assets/sprites/pile.png', cols: 6, frames: 6 },
  };

  // Статика: дышит кадрами 0–5 и иногда моргает. Кадр k+BLINK — это кадр
  // дыхания k с закрытыми глазами, поэтому моргнуть можно на любой фазе.
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
  // Другой акт любви, без куклы: отворачивается и садится спиной (0–9),
  // раскачивается 10–17 три раза, встаёт и поворачивается довольный (18–23).
  const love2Loop = range(8).map(i => i + 10);
  const love2LoopMs = [260, 240, 320, 240, 260, 240, 320, 240];
  const love2Seq = [...range(10), ...love2Loop, ...love2Loop, ...love2Loop, ...range(6).map(i => i + 18)];
  const love2Ms = [500, 250, 250, 300, 300, 350, 400, 350, 350, 450,
                   ...love2LoopMs, ...love2LoopMs, ...love2LoopMs,
                   400, 350, 300, 350, 400, 800];
  const loveLoop = range(8).map(i => i + 8);
  const loveLoopMs = [240, 240, 380, 240, 240, 380, 240, 240];
  const loveSeq = [...range(8), ...loveLoop, ...loveLoop, ...loveLoop, ...range(8).map(i => i + 16)];
  const loveMs = [500, 300, 350, 400, 500, 350, 450, 350,
                  ...loveLoopMs, ...loveLoopMs, ...loveLoopMs,
                  450, 300, 250, 350, 350, 400, 400, 600];
  // Сон: устаёт и ложится (0–7), спит и храпит 8–15 четыре круга, просыпается (16–23).
  const sleepLoop = range(8).map(i => i + 8);
  const sleepLoopMs = [320, 300, 360, 420, 300, 300, 360, 420];
  const sleepSeq = [...range(8), ...sleepLoop, ...sleepLoop, ...sleepLoop, ...sleepLoop, ...range(8).map(i => i + 16)];
  const sleepMs = [500, 450, 650, 350, 350, 400, 400, 500,
                   ...sleepLoopMs, ...sleepLoopMs, ...sleepLoopMs, ...sleepLoopMs,
                   400, 650, 350, 500, 350, 350, 400, 600];
  // Истерика: грустнеет и пускает слезу (0–5), ревёт — сжимает кулаки, хватается
  // за голову, машет руками (6–17) два круга, вытирает слёзы и успокаивается (18–23).
  // Кадры 10 и 17 пропускаем: в исходнике у них обрезаны кисти.
  const sobLoop = [6, 7, 8, 9, 11, 12, 13, 14, 15, 16];
  const sobMs = [300, 260, 240, 320, 380, 300, 260, 240, 300, 340];
  const sadSeq = [...range(6), ...sobLoop, ...sobLoop, ...range(6).map(i => i + 18)];
  const sadMs = [600, 450, 450, 400, 450, 450,
                 ...sobMs, ...sobMs, 450, 500, 450, 450, 500, 700];
  // Таблетка: падает сверху, пока он на неё смотрит (1), поднимает (2–3), смотрит (4–5), глотает
  // (6–7 дважды), проглотил (8–9), «бизики» — кулаки (10), скачет 11→12→13 шесть раз, кулаки (10).
  // Кадр 0 и концовку 13–15 пропускаем: начинается и кончается сразу статикой.
  const hop = [11, 12, 13];
  const hopMs = [120, 150, 110];
  const pillSeq = [1, 2, 3, 4, 5, 6, 7, 6, 7, 8, 9, 10,
                   ...hop, ...hop, ...hop, ...hop, ...hop, ...hop, 10];
  const pillMs = [1300, 350, 450, 380, 380, 260, 260, 260, 260, 500, 600, 400,
                  ...hopMs, ...hopMs, ...hopMs, ...hopMs, ...hopMs, ...hopMs, 500];
  // Танец: кадры 1–20 целиком, потом ещё круг 6–19 (тыкает пальцем, руки вверх,
  // подскок на 14) и выдох 20–21. Стоячие 0 и 22–23 пропускаем — сразу из статики и в неё.
  const danceSeq = [...range(20).map(i => i + 1), ...range(14).map(i => i + 6), 20, 21];
  const danceMs = danceSeq.map(f => (f === 14 ? 260 : f === 7 || f === 8 || f === 12 ? 280 : f >= 20 ? 320 : 200));
  // Смотрит телик: садится (1–5), смотрит (6–9), ржёт (10–13), опять смотрит (14–15),
  // ещё раз ржёт и встаёт (16–22). Стоячие 0 и 23 пропускаем — из статики и в неё.
  const tvSeq = [1, 2, 3, 4, 5, 6, 7, 8, 9, 6, 7, 8, 9, 10, 11, 12, 13, 10, 11, 12, 13,
                 14, 15, 14, 15, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
  const tvMs = tvSeq.map(f => (f <= 5 ? 300 : f <= 9 ? 450 : f <= 13 ? 220 : f <= 15 ? 450 : 260));
  // Чешет жопу. В листе 16 кадров, но рука почти не двигается: 2 — заводит руку
  // за спину, 3–14 — одна поза с шумом генератора, 15–16 — возвращает. Берём только
  // заход (1), самую спокойную тройку 2–3–4 «туда-обратно» четыре раза и выход (14–15).
  const itch = [2, 3, 4, 3];
  const scratchSeq = [1, ...itch, ...itch, ...itch, ...itch, 14, 15];
  const scratchMs = [200, ...Array(16).fill(150), 220, 280];
  // Пугается: насторожился (1), ахнул (2), вздрогнул и сжался (3), озирается по
  // сторонам (4–9), выдыхает и успокаивается (10–15). Стоячий 0 пропускаем.
  const scaredSeq = [1, 2, 3, 3, 4, 5, 6, 7, 8, 9, 6, 7, 10, 11, 12, 13, 14, 15];
  const scaredMs = [300, 220, 120, 380, 350, 300, 350, 300, 400, 380, 300, 300, 350, 350, 400, 400, 450, 500];
  // Удар по стеклу: весь экран дёргается и затухает.
  const SHAKE = [[3, -1], [-3, 1], [2, 1], [-2, -1], [1, 0], [-1, 0]];

  const animations = {
    idle: {
      label: 'Стоит. Подозрительно спокойно.',
      sheet: 'idle',
      build: idleFrames,   // кадры собираются заново на каждый показ
      phrases: ['Ну чо вы смотрите?', 'Я всё контролирую.', 'Ну стою. И шо?', 'Ой, не начинайте.'],
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
      cracks: { x: 86, y: 114 },   // куда приходится кулак — отсюда трескается стекло
      phrases: ['А хинкал будет?', 'Ну покормите уже.', 'Ой вей, я голодный!', 'Ну ой, где еда?'],
    },
    eat: {
      label: 'Ест хинкал',
      sheet: 'eat',
      frames: seq(eatSeq, eatMs),
      phrases: ['Ммм, хинкалик.', 'Наконец-то покормили.', 'Ой, вкусно, ой.', 'Ну хоть шо-то.'],
    },
    sick: {
      label: 'Заболел. Тошнит.',
      sheet: 'sick',
      // зеленеет (0–5), согнулся и тошнит (6–17), отходит (18–23)
      frames: seq(range(24), [600, 300, 300, 350, 350, 450, 300, 250, 160, 160, 140, 140,
                              140, 160, 180, 300, 350, 400, 400, 350, 350, 350, 350, 600]),
      phrases: ['Чёт мне нехорошо…', 'Хинкал был несвежий.', 'Ой вей, помираю.', 'Ну ой… ну всё.'],
    },
    tanks: {
      label: 'Играет в танки',
      sheet: 'tanks',
      frames: seq(tanksSeq, tanksMs),
      next: ['tanks_win', 'tanks_lose'],
      // ночью экран ноутбука подсвечивает лицо: свет между экраном и лицом, пока ноут открыт
      glow: { from: 10, x: 132, y: 146, r: 52, color: [150, 200, 255], power: 0.85, flicker: 'game' },
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
    love2: {
      label: 'Акт любви. Сам с собой.',
      sheet: 'love2',
      frames: seq(love2Seq, love2Ms),
      // поворачивается обратно довольный
      say: { frame: 21, text: ['Ничего не было, ясно?', 'Фух. Как заново родился.', 'Это была зарядка.',
                               'Ну и шо вы смотрите?', 'Никому ни слова.', 'Сам себя не похвалишь…'] },
      phrases: ['Не смотрите, я занят.', 'Отвернитесь, ну!', 'Это не то, шо вы думаете.', 'Ой вей, только не входите!',
                'Мама говорила, ослепну.', 'Ну а шо, мне одиноко.', 'Я сам себе лучший друг.', 'Сеанс любви к себе.'],
      ownPhrasesOnly: true,
    },
    sleep: {
      label: 'Спит. Храпит.',
      sheet: 'sleep',
      frames: seq(sleepSeq, sleepMs),
      // пока лежит — от головы всплывают «z» (x, y — где голова, кадры — когда)
      zzz: { frames: sleepLoop, x: 72, y: 124 },
      phrases: ['Чёт я устал…', 'Ой вей, спать.', 'Разбудите к хинкалу.'],
    },
    sad: {
      label: 'Истерика. Ревёт.',
      sheet: 'sad',
      frames: seq(sadSeq, sadMs),
      phrases: ['Ой вей, никто меня не любит…', 'Ну ой… ну за шо?!', 'Хинкала нет, и жизни нет!', 'Да за шо мне это всё?!'],
    },
    pill: {
      label: 'Съел таблетку. На бизиках.',
      sheet: 'pill',
      frames: seq(pillSeq, pillMs),
      // таблетка падает сверху ровно туда, где лежит в кадре 2 (pill_item, см. build_sprites.py)
      drop: { sprite: 'pill_item', x: 158, y: 192, fallMs: 600, until: 0 },
      say: { frame: 10, text: 'Я на жёстких бизиках!' },
      shake: { frames: [13], ms: 110, path: [[0, 2], [0, -1], [0, 1], [0, 0]] },   // приземления
      phrases: ['О, таблеточка!', 'Шо это? Ну давай.'],
      ownPhrasesOnly: true,
    },
    dance: {
      label: 'Танцует. Как умеет.',
      sheet: 'dance',
      frames: seq(danceSeq, danceMs),
      phrases: ['Танцуют все!', 'Ой, ну я в ударе.', 'Ну а шо, я пластичный.', 'Диско, ой вей!'],
    },
    tv: {
      label: 'Смотрит телик',
      sheet: 'tv',
      frames: seq(tvSeq, tvMs),
      phrases: ['О, «Камеди» началось.', 'Ахаха, ну дурак!', 'Ой вей, шо творят.', 'Не мешайте, тут самое интересное.'],
    },
    scratch: {
      label: 'Чешет жопу',
      sheet: 'scratch',
      frames: seq(scratchSeq, scratchMs),
      phrases: ['Задумался.', 'Дела житейские.', 'Ой вей, чешется.', 'Ну а шо, имею право.'],
    },
    scared: {
      label: 'Испугался',
      sheet: 'scared',
      frames: seq(scaredSeq, scaredMs),
      // вздрогнул — короткий толчок экрана
      shake: { frames: [3], ms: 120, path: [[0, -2], [1, 1], [-1, 0], [0, 0]] },
      phrases: ['Шо это было?!', 'Ой вей! Кто здесь?', 'Ну ой… показалось.', 'Мама…'],
    },
    poop: {
      label: 'У него важное дело',
      sheet: 'poop',
      frames: seq(range(16), [500, 220, 220, 250, 300, 300, 300, 300, 400, 450, 400, 300, 250, 300, 300, 600]),
      poopsAt: 8,   // с этого кадра (натуга) куча в углу плюхается и растёт
      phrases: ['Отойдите на минутку.', 'Хинкал был лишний.', 'Ой вей, ну вы чего смотрите.'],
    },
  };

  // Куча в углу (js/heap.js). anchor — низ по центру, как HEAP_ANCHOR в build_sprites.py.
  // Мухи и запах — с какого размера (1…6) и сколько мух на каждом.
  const heapConfig = {
    anchor: [42, 198],
    flies: { from: 4, count: [0, 0, 0, 2, 3, 5] },
    stink: { from: 5 },
  };

  // Коронное Игоряши — иногда вместо реплики к действию.
  const commonPhrases = [
    'Ой вей.', 'Ну ой.', 'Ой вей из мир.', 'Ну ой, ну шо.', 'Ой, всё.',
    'Ну такое.', 'Ой, да ладно.', 'Ну шо началось-то?', 'Ой, мама.', 'Ну и ну.',
    'Ну ой, ну куда.', 'Ой, не говорите.', 'Ну шо вы хотите от меня?',
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
      // мерцающие источники, считаются каждый кадр
      live: [
        { x: 224, y: 128, r: 105, color: [110, 150, 235], power: 0.8, flicker: 'tv' },   // телевизор в углу
        { x: 227, y: 123, r: 16, color: [190, 215, 255], power: 0.5, flicker: 'tv' },   // сам экран
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

  window.IGORYASHA = { CELL: 240, sheets, animations, play, lighting, timeOfDay, commonPhrases, heapConfig };
})();

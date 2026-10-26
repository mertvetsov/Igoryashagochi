'use strict';
// Данные анимаций. Отдельно от движка, чтобы потом сгенерировать из них
// таблицы для прошивки GeekMagic (ESP8266/ESP32, экран 240×240).
// Спрайтшиты собирает tools/build_sprites.py: ячейка 240×240, ноги на y=199.

(function () {
  const seq = (frames, delays) =>
    frames.map((frame, i) => ({ frame, ms: Array.isArray(delays) ? delays[i] : delays }));
  const range = n => Array.from({ length: n }, (_, i) => i);

  const sheets = {
    scratch: { src: 'assets/sprites/scratch.png', cols: 4, frames: 16 },
    hungry:  { src: 'assets/sprites/hungry.png',  cols: 4, frames: 16 },
    walk:    { src: 'assets/sprites/walk.png',    cols: 6, frames: 24 },
    poop:    { src: 'assets/sprites/poop.png',    cols: 4, frames: 16 },
    room:    { src: 'assets/sprites/room.png' },
    pile:    { src: 'assets/sprites/pile.png' },
  };

  // Чешется: замах, три цикла чесания (кадры 8–11), возврат.
  const scratchSeq = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 8, 9, 10, 11, 8, 9, 10, 11, 12, 13, 14, 15];

  const animations = {
    idle: {
      label: 'Стоит. Подозрительно спокойно.',
      sheet: 'scratch',
      frames: seq([0, 1, 2, 3, 0], [1600, 700, 100, 1400, 1200]),
      phrases: ['Ну чо вы смотрите?', 'О_О', 'Я всё контролирую.'],
    },
    scratch: {
      label: 'Чешет жопу',
      sheet: 'scratch',
      frames: seq(scratchSeq, scratchSeq.map((_, i) => (i === 0 ? 400 : i === 23 ? 600 : 130))),
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
      frames: seq(range(16), [600, 200, 200, 300, 180, 180, 180, 180, 300, 350, 200, 300, 250, 250, 450, 600]),
      phrases: ['А хинкал будет?', 'Ну покормите уже.'],
    },
    poop: {
      label: 'У него важное дело',
      sheet: 'poop',
      frames: seq(range(16), [500, 220, 220, 250, 300, 300, 300, 300, 400, 450, 400, 300, 250, 300, 300, 600]),
      leavesPile: true,
      phrases: ['Отойдите на минутку.', 'Хинкал был лишний.'],
    },
  };

  for (const a of Object.values(animations)) a.duration = a.frames.reduce((n, f) => n + f.ms, 0);

  window.IGORYASHA = { CELL: 240, sheets, animations };
})();

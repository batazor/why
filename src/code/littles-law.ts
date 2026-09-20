import type { CodeDeck } from './types';
import type { WidgetSpec } from './widgets';
// Расширение обязательно: колоду импортирует ещё и node-скрипт проверки.
import posterSpec from './littles-law.poster.ts';

/**
 * Закон Литтла: L = λ × W.
 *
 * Урок стоит перед разбором задачи про скрейпинг-джобы, потому что там этот
 * закон уже работает — им считается размер пула, — но объясняется одной
 * строкой. Здесь он разбирается сам по себе, без предметной области: формула
 * одинаково отвечает про очередь сообщений, пул воркеров и очередь на кассе, и
 * именно эта независимость от предмета — главное, что в ней стоит понять.
 *
 * Ведущий элемент разбора — калькулятор, а не код: у формулы из трёх величин
 * смысл появляется, когда двигаешь одну и смотришь на остальные. Код есть не у
 * каждого шага; шаг без кода — легальный случай.
 *
 * ПРАВИЛО (как и везде): код, вывод и подписи на схеме общие для всех локалей,
 * значит только английские. Проза — в `narration` локализованного урока.
 */

/** Постер: суть проблемы одной схемой — карточка каталога и блок «Проблема». */
export const poster = posterSpec;

export const widgets: WidgetSpec = {
  /**
   * Калькулятор закона. Значения по умолчанию подобраны так, чтобы три числа
   * различались и читались вслух: поток 10 в секунду, тридцать секунд внутри,
   * из них десять — обслуживание. Триста внутри, сто обслуживаются, двести
   * ждут; ожидание видно как разницу, а не как отдельную формулу.
   */
  calc: {
    widget: 'littles-law',
    // В колонке рядом с текстом: читатель двигает ползунок и тут же читает
    // абзац о том, что это число значит.
    wide: false,
    data: {
      inputs: [
        // Поток и время внутри растут на порядки: от единиц в секунду до
        // тысяч, от секунды до десяти минут. Такие ползунки идут по логарифму.
        { key: 'arrivals', min: 1, max: 10_000, scale: 'log', value: 10 },
        { key: 'timeInSystem', min: 1, max: 600, scale: 'log', value: 30 },
        { key: 'serviceSeconds', min: 1, max: 600, scale: 'log', value: 10 },
        { key: 'perServer', min: 1, max: 100, scale: 'log', value: 1 },
      ],
    },
  },
};

const deck: CodeDeck = [
  // Вопрос, на который отвечают на глаз, хотя ответ выводится.
  { id: 'problem' },

  {
    id: 'law',
    lang: 'ts',
    caption: 'little.ts',
    code: `// {{formula}}
const inSystem = arrivalsPerSecond * secondsInSystem; // [!code highlight]`,
    output: `10 /s × 30 s = 300 in the system at any moment
no assumption about arrival pattern, service order or server count`,
  },

  // Калькулятор: три величины, двигается любая.
  { id: 'calc' },

  {
    id: 'split',
    lang: 'ts',
    caption: 'little.ts',
    code: `// {{smallerBox}}
const inService = arrivalsPerSecond * serviceSeconds;
const waiting = inSystem - inService; // [!code highlight]

// {{poolFromService}}
const workers = Math.ceil(inService / itemsPerWorker);`,
    output: `10 /s × 10 s = 100 being served, 200 waiting in the queue
100 / 1 item per worker = 100 workers`,
  },

  {
    id: 'inverse',
    lang: 'ts',
    caption: 'little.ts',
    code: `// {{solvedForTime}}
const secondsToDrain = queueDepth / drainedPerSecond; // [!code highlight]`,
    output: `40 000 messages / 200 per second = 200 s before the queue is empty
alert threshold "depth > 40 000" == "the oldest message is 200 s old"`,
  },

  // На чём равенство держится: устойчивость и длинное окно.
  { id: 'stable' },

  // Чего закон не обещает.
  { id: 'traps' },

  { id: 'answer' },
];

export default deck;

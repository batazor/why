import type { FlowSpec } from './flow';

/**
 * Схема разбора: цена — это высота.
 *
 * 50.00 наверху, 0 внизу, закупочная нарисована планкой поперёк. Поэтому
 * «пара акций пробила закупочную» не требует чтения подписей: цепочка просто
 * уходит ниже планки.
 *
 * React Flow позиционирует узел по верхнему левому углу, а цену обозначает его
 * СЕРЕДИНА — иначе карточка высотой 82px съезжает на пол-карточки вниз и
 * наползает на планку. Отсюда `at()`: уровень минус половина высоты.
 */
const SCALE = 420; // пикселей на весь диапазон от 50.00 до нуля
const CARD = 82; // измеренная высота карточки
const BAR = 32; // измеренная высота планки

const level = (cents: number) => ((5000 - cents) / 5000) * SCALE;
const at = (cents: number, height = CARD) => Math.round(level(cents) - height / 2);

const STACKED = ['stack', 'clamp', 'rule', 'refute', 'instantiate', 'contradict'];
const BUDGETED = ['budget', 'spend', 'proof', 'evolve', 'declare'];

const flow: FlowSpec = {
  height: 470,
  nodes: [
    {
      id: 'floor',
      kind: '{{kindRule}}',
      title: '{{costFloor}} · 32.00',
      // Откуда 32.00: это не вывод схемы, а второе поле Item — то, что за товар
      // заплатили. Без подписи планка выглядит порогом, взятым с потолка.
      sub: 'Item.cost · {{wePaid}}',
      position: { x: -20, y: at(3200, BAR) },
      width: 880,
      variant: 'bar',
      focus: ['rule'],
      bad: ['stack', 'clamp'],
    },

    /**
     * Две цены товара — это два поля одной структуры, и подписи названы полями
     * намеренно. Обе на схеме есть, но на разной высоте: закупочная лежит
     * планкой на своей отметке, потому что высота здесь означает цену. Написать
     * «cost 32.00» на карточке, стоящей на отметке 50.00, значит поставить
     * число не на своё место.
     */
    { id: 'list', kind: '{{kindPrice}}', title: '50.00', sub: 'Item.price · {{listPrice}}', position: { x: 0, y: at(5000) } },

    {
      id: 'v3750',
      kind: '{{kindPrice}}',
      title: '37.50',
      sub: '{{after}} −25%',
      position: { x: 300, y: at(3750) },
      only: ['item', 'promo', 'cut', 'engine', 'one'],
      focus: ['one'],
    },

    {
      id: 'vFirst',
      kind: '{{kindPrice}}',
      title: '37.50',
      sub: '{{after}} −25% {{category}}',
      position: { x: 280, y: at(3750) },
      only: STACKED,
    },
    {
      id: 'v2813',
      kind: '{{kindPrice}}',
      title: '28.13',
      sub: '{{after}} −25% {{coupon}}',
      position: { x: 560, y: at(2813) },
      only: STACKED,
      bad: STACKED,
      focus: ['stack'],
    },

    {
      id: 'b3750',
      kind: '{{kindPrice}}',
      title: '37.50',
      sub: '{{after}} −25% {{category}}',
      // После первой акции остаётся запас 5.50; вторая может потратить только его.
      position: { x: 360, y: at(3750) },
      only: BUDGETED,
      focus: ['budget'],
    },
    {
      id: 'b32b',
      kind: '{{kindPrice}}',
      title: '32.00',
      sub: '{{budgetSpent}}, −5.50',
      position: { x: 640, y: at(3200) },
      only: BUDGETED,
    },
  ],
  edges: [
    /**
      * Акция сама узлом не рисуется: узлы здесь — цены, и высота узла означает
      * цену. Поэтому механика живёт подписью на стрелке, и подпись обязана
      * называть процент, иначе «−10.00» берётся ниоткуда.
      */
    { id: 'eFirst', source: 'list', target: 'v3750', sourceHandle: 'r', targetHandle: 'l', label: '−25% = −12.50', only: ['item', 'promo', 'cut', 'engine', 'one'] },

    { id: 'eCategory', source: 'list', target: 'vFirst', sourceHandle: 'r', targetHandle: 'l', label: '−25% = −12.50', only: STACKED },
    // База второго процента — уже сниженная цена. Обе акции по отдельности
    // безопасны, но их сочетание пересекает закупочную.
    { id: 'eCoupon', source: 'vFirst', target: 'v2813', sourceHandle: 'r', targetHandle: 'l', label: '−9.37', tone: 'bad', only: STACKED },

    { id: 'eb1', source: 'list', target: 'b3750', sourceHandle: 'r', targetHandle: 'l', label: '−25% = −12.50', only: BUDGETED },
    { id: 'eb2', source: 'b3750', target: 'b32b', sourceHandle: 'r', targetHandle: 'l', label: '−5.50', tone: 'ok', only: BUDGETED },
  ],

  // Вторую акцию читатель приносит сам: пока карточка не в слоте, цепочка
  // обрывается, и куда она уводит цену — ещё не видно.
  drop: {
    step: 'stack',
    reveals: ['v2813', 'eCoupon'],
    // До действия не подсказываем ответ положением слота ниже закупочной.
    slot: { x: 560, y: at(3750) },
    width: 184,
  },

  /**
   * Только геометрия: текст пометки переводится и лежит в steps[].note урока.
   * Каждая целится в конкретный узел — стрелка, указывающая в пустоту, хуже,
   * чем её отсутствие.
   */
  annotations: [
    { step: 'item', position: { x: 210, y: -55 }, arrow: 'left', width: 200 },
    { step: 'promo', position: { x: 210, y: -55 }, arrow: 'left', width: 200 },
    { step: 'cut', position: { x: 0, y: 185 }, arrow: 'up', width: 215 },
    { step: 'engine', position: { x: 0, y: 185 }, arrow: 'up', width: 215 },
    { step: 'one', position: { x: 510, y: 30 }, arrow: 'left', width: 200 },
    { step: 'stack', position: { x: 560, y: 265 }, arrow: 'up', width: 210 },
    { step: 'clamp', position: { x: 560, y: 265 }, arrow: 'up', width: 215 },
    { step: 'rule', position: { x: 0, y: 185 }, arrow: 'up', width: 220 },
    { step: 'refute', position: { x: 0, y: 185 }, arrow: 'up', width: 220 },
    { step: 'instantiate', position: { x: 0, y: 185 }, arrow: 'up', width: 220 },
    { step: 'contradict', position: { x: 0, y: 185 }, arrow: 'up', width: 220 },
    { step: 'budget', position: { x: 360, y: 215 }, arrow: 'up', width: 215 },
    { step: 'spend', position: { x: 360, y: 215 }, arrow: 'up', width: 215 },
    { step: 'proof', position: { x: 360, y: 215 }, arrow: 'up', width: 215 },
    { step: 'evolve', position: { x: 360, y: 215 }, arrow: 'up', width: 215 },
    { step: 'declare', position: { x: 360, y: 215 }, arrow: 'up', width: 215 },
  ],
};

export default flow;

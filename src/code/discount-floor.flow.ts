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

const NAIVE = ['stack', 'clamp', 'rule'];
const BUDGETED = ['budget', 'evolve'];

const flow: FlowSpec = {
  height: 470,
  nodes: [
    {
      id: 'floor',
      kind: 'rule',
      title: 'cost floor · 32.00',
      position: { x: -20, y: at(3200, BAR) },
      width: 820,
      variant: 'bar',
      focus: ['rule'],
      bad: ['stack', 'clamp'],
    },

    { id: 'list', kind: 'price', title: '50.00', sub: 'list price', position: { x: 0, y: at(5000) } },

    {
      id: 'v40',
      kind: 'price',
      title: '40.00',
      sub: 'after −20%',
      position: { x: 300, y: at(4000) },
      only: ['item', 'promo', 'engine', 'one'],
      focus: ['one'],
    },

    {
      id: 'v25',
      kind: 'price',
      title: '25.00',
      sub: 'after −50% category',
      position: { x: 280, y: at(2500) },
      only: NAIVE,
    },
    {
      id: 'v10',
      kind: 'price',
      title: '10.00',
      sub: 'after −60% coupon',
      position: { x: 560, y: at(1000) },
      only: NAIVE,
      bad: NAIVE,
      focus: ['stack'],
    },

    {
      id: 'b32a',
      kind: 'price',
      title: '32.00',
      sub: 'budget spent, −18.00',
      position: { x: 280, y: at(3200) },
      only: BUDGETED,
      focus: ['budget'],
    },
    {
      id: 'b32b',
      kind: 'price',
      title: '32.00',
      sub: 'nothing left to spend',
      position: { x: 560, y: at(3200) },
      only: BUDGETED,
    },
  ],
  edges: [
    { id: 'e20', source: 'list', target: 'v40', sourceHandle: 'r', targetHandle: 'l', label: '−10.00', only: ['item', 'promo', 'engine', 'one'] },

    { id: 'e50', source: 'list', target: 'v25', sourceHandle: 'r', targetHandle: 'l', label: '−25.00', only: NAIVE },
    { id: 'e60', source: 'v25', target: 'v10', sourceHandle: 'r', targetHandle: 'l', label: '−15.00', tone: 'bad', only: NAIVE },

    { id: 'eb1', source: 'list', target: 'b32a', sourceHandle: 'r', targetHandle: 'l', label: '−18.00, all there was', only: BUDGETED },
    { id: 'eb2', source: 'b32a', target: 'b32b', sourceHandle: 'r', targetHandle: 'l', label: '−0.00', tone: 'ok', only: BUDGETED },
  ],

  // Вторую акцию читатель приносит сам: пока карточка не в слоте, цепочка
  // обрывается, и куда она уводит цену — ещё не видно.
  drop: {
    step: 'stack',
    reveals: ['v10', 'e60'],
    slot: { x: 560, y: at(1000) },
    width: 184,
  },

  /**
   * Только геометрия: текст пометки переводится и лежит в steps[].note урока.
   * Каждая целится в конкретный узел — стрелка, указывающая в пустоту, хуже,
   * чем её отсутствие.
   */
  annotations: [
    { step: 'item', position: { x: 230, y: at(5000) + 8 }, arrow: 'left', width: 200 },
    { step: 'promo', position: { x: 230, y: at(5000) + 8 }, arrow: 'left', width: 200 },
    { step: 'engine', position: { x: 300, y: at(3200, BAR) + 66 }, arrow: 'up', width: 215 },
    { step: 'one', position: { x: 520, y: at(4000) + 8 }, arrow: 'left', width: 200 },
    { step: 'stack', position: { x: 300, y: at(1000) + 110 }, arrow: 'right', width: 210 },
    { step: 'clamp', position: { x: 300, y: at(1000) + 110 }, arrow: 'right', width: 215 },
    { step: 'rule', position: { x: 300, y: at(3200, BAR) + 66 }, arrow: 'up', width: 220 },
    { step: 'budget', position: { x: 280, y: at(3200) + 110 }, arrow: 'up', width: 215 },
    { step: 'evolve', position: { x: 280, y: at(3200) + 110 }, arrow: 'up', width: 215 },
  ],
};

export default flow;

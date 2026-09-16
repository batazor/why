import type { FlowSpec } from './flow';

/**
 * Схема разбора: цена по вертикали.
 *
 * Высота узла — это его цена: 50.00 наверху, 0 внизу. Пол закупочной нарисован
 * планкой поперёк. Поэтому «пара акций пробила закупочную» не требует чтения
 * подписей — цепочка просто уходит ниже планки.
 *
 * y = (5000 − цена) / 5000 * 300
 */
const NAIVE = ['stack', 'clamp', 'rule'];
const BUDGETED = ['budget', 'evolve'];

const flow: FlowSpec = {
  height: 430,
  nodes: [
    {
      id: 'floor',
      kind: 'rule',
      title: 'cost floor · 32.00',
      position: { x: -20, y: 108 },
      width: 820,
      variant: 'bar',
      focus: ['rule'],
      bad: ['stack', 'clamp'],
    },

    { id: 'list', kind: 'price', title: '50.00', sub: 'list price', position: { x: 0, y: 0 } },

    {
      id: 'v40',
      kind: 'price',
      title: '40.00',
      sub: 'after −20%',
      position: { x: 300, y: 60 },
      only: ['item', 'promo', 'engine', 'one'],
      focus: ['one'],
    },

    {
      id: 'v25',
      kind: 'price',
      title: '25.00',
      sub: 'after −50% category',
      position: { x: 280, y: 150 },
      only: NAIVE,
    },
    {
      id: 'v10',
      kind: 'price',
      title: '10.00',
      sub: 'after −60% coupon',
      position: { x: 560, y: 240 },
      only: NAIVE,
      bad: NAIVE,
      focus: ['stack'],
    },

    {
      id: 'b32a',
      kind: 'price',
      title: '32.00',
      sub: 'budget spent, −18.00',
      position: { x: 280, y: 108 },
      only: BUDGETED,
      focus: ['budget'],
    },
    {
      id: 'b32b',
      kind: 'price',
      title: '32.00',
      sub: 'nothing left to spend',
      position: { x: 560, y: 108 },
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
    slot: { x: 560, y: 240 },
    width: 190,
  },
  // Только геометрия: текст пометки переводится и лежит в steps[].note урока.
  annotations: [
    { step: 'item', position: { x: 0, y: 300 }, arrow: 'up', width: 210 },
    { step: 'promo', position: { x: 0, y: 300 }, arrow: 'up', width: 210 },
    { step: 'engine', position: { x: 0, y: 300 }, arrow: 'up', width: 215 },
    { step: 'one', position: { x: 300, y: 300 }, arrow: 'up', width: 200 },
    { step: 'stack', position: { x: 560, y: 330 }, arrow: 'up', width: 210 },
    { step: 'clamp', position: { x: 560, y: 330 }, arrow: 'up', width: 215 },
    { step: 'rule', position: { x: 0, y: 300 }, arrow: 'up', width: 220 },
    { step: 'budget', position: { x: 280, y: 300 }, arrow: 'up', width: 215 },
    { step: 'evolve', position: { x: 280, y: 300 }, arrow: 'up', width: 215 },
  ],
};

export default flow;

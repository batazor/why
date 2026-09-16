import type { FlowSpec } from './flow';

const NAIVE = ['one', 'stack', 'clamp', 'rule'];
const BUDGETED = ['budget', 'evolve'];

/**
 * Схема разбора: куда механики скидок бьют.
 *
 * Ключевой кадр — второй: акции подключены прямо к чекауту, и ничто не мешает
 * им вместе пробить пол. На пятом между ними и чекаутом появляется бюджет
 * маржи, и пробить пол становится нечем.
 */
const flow: FlowSpec = {
  height: 470,
  nodes: [
    { id: 'price', kind: 'input', title: 'list price', sub: '50.00', position: { x: 0, y: 0 } },
    {
      id: 'promoA',
      kind: 'promo',
      title: '−50% category',
      sub: 'marketing, May',
      position: { x: 0, y: 140 },
    },
    {
      id: 'promoB',
      kind: 'promo',
      title: '−60% coupon',
      sub: 'marketing, June',
      position: { x: 0, y: 270 },
      only: ['stack', 'clamp', 'rule', 'budget', 'evolve'],
    },
    {
      id: 'promoC',
      kind: 'promo',
      title: 'cashback 5%',
      sub: 'marketing, July',
      position: { x: 0, y: 400 },
      only: ['evolve'],
      focus: ['evolve'],
    },
    {
      id: 'budget',
      kind: 'guard',
      title: 'margin budget',
      sub: '18.00, shared',
      position: { x: 280, y: 200 },
      only: BUDGETED,
      focus: ['budget'],
    },
    {
      id: 'checkout',
      kind: 'result',
      title: 'customer pays',
      sub: 'after all promos',
      position: { x: 560, y: 60 },
      bad: ['stack', 'clamp', 'rule'],
    },
    {
      id: 'floor',
      kind: 'rule',
      title: 'cost floor',
      sub: '32.00, never below',
      position: { x: 560, y: 250 },
      focus: ['rule'],
      bad: ['stack', 'clamp'],
    },
  ],
  edges: [
    { id: 'p', source: 'price', target: 'checkout', sourceHandle: 'r', targetHandle: 'l', label: '50.00' },

    { id: 'a-direct', source: 'promoA', target: 'checkout', sourceHandle: 'r', targetHandle: 'l', label: '−25.00', only: NAIVE },
    { id: 'b-direct', source: 'promoB', target: 'checkout', sourceHandle: 'r', targetHandle: 'l', label: '−15.00', tone: 'bad', only: ['stack', 'clamp', 'rule'] },

    { id: 'a-budget', source: 'promoA', target: 'budget', sourceHandle: 'r', targetHandle: 'l', only: BUDGETED },
    { id: 'b-budget', source: 'promoB', target: 'budget', sourceHandle: 'r', targetHandle: 'l', only: BUDGETED },
    { id: 'c-budget', source: 'promoC', target: 'budget', sourceHandle: 'r', targetHandle: 'b', only: ['evolve'] },
    { id: 'budget-out', source: 'budget', target: 'checkout', sourceHandle: 'r', targetHandle: 'b', label: 'at most 18.00', only: BUDGETED },

    { id: 'breach', source: 'checkout', target: 'floor', sourceHandle: 'b', targetHandle: 't', label: '10.00 < 32.00', tone: 'bad', dashed: true, only: ['stack', 'clamp', 'rule'] },
    { id: 'held', source: 'checkout', target: 'floor', sourceHandle: 'b', targetHandle: 't', label: '32.00 ≥ 32.00', tone: 'ok', only: BUDGETED },
  ],
  // Только геометрия: текст пометки переводится и лежит в steps[].note урока.
  annotations: [
    { step: 'one', position: { x: 556, y: 356 }, arrow: 'up', width: 190 },
    { step: 'stack', position: { x: 556, y: 356 }, arrow: 'up', width: 200 },
    { step: 'clamp', position: { x: 556, y: 356 }, arrow: 'up', width: 210 },
    { step: 'rule', position: { x: 556, y: 356 }, arrow: 'up', width: 215 },
    { step: 'budget', position: { x: 250, y: 320 }, arrow: 'up', width: 215 },
    { step: 'evolve', position: { x: 250, y: 320 }, arrow: 'up', width: 215 },
  ],
};

export default flow;

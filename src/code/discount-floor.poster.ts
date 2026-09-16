import type { FlowSpec } from './flow';

/** Постер: суть проблемы одной схемой. Один шаг, поэтому fixedStep. */
const poster: FlowSpec = {
  height: 215,
  fixedStep: 'problem',
  compact: true,
  nodes: [
    { id: 'promos', kind: 'promo', title: 'two promos', sub: 'each one is fine', position: { x: 0, y: 30 } },
    {
      id: 'paid',
      kind: 'result',
      title: 'paid 10.00',
      sub: 'cost was 32.00',
      position: { x: 240, y: 30 },
      bad: ['problem'],
    },
  ],
  edges: [
    { id: 'stack', source: 'promos', target: 'paid', sourceHandle: 'r', targetHandle: 'l', label: 'stacked', tone: 'bad' },
    {
      id: 'untested',
      source: 'promos',
      target: 'paid',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: 'nobody tested this pair',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

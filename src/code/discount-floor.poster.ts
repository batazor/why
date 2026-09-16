import type { FlowSpec } from './flow';

/** Постер: суть проблемы одной схемой. Один шаг, поэтому fixedStep. */
const poster: FlowSpec = {
  height: 215,
  fixedStep: 'problem',
  compact: true,
  nodes: [
    { id: 'promos', kind: '{{kindPromo}}', title: '{{twoPromos}}', sub: '{{eachFine}}', position: { x: 0, y: 30 } },
    {
      id: 'paid',
      kind: '{{kindResult}}',
      title: '{{paid}} 28.13',
      sub: '{{costWas}} 32.00',
      position: { x: 240, y: 30 },
      bad: ['problem'],
    },
  ],
  edges: [
    { id: 'stack', source: 'promos', target: 'paid', sourceHandle: 'r', targetHandle: 'l', label: '{{stacked}}', tone: 'bad' },
    {
      id: 'untested',
      source: 'promos',
      target: 'paid',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: '{{nobodyTested}}',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

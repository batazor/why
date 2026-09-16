import type { FlowSpec } from './flow';

/** Постер: суть проблемы одной схемой. Один шаг, поэтому fixedStep. */
const poster: FlowSpec = {
  height: 215,
  fixedStep: 'problem',
  compact: true,
  nodes: [
    { id: 'client', kind: 'service', title: 'Client', sub: 'checkout flow', position: { x: 0, y: 30 } },
    {
      id: 'payments',
      kind: 'external',
      title: 'Payments API',
      sub: 'not idempotent',
      position: { x: 240, y: 30 },
      bad: ['problem'],
    },
  ],
  edges: [
    {
      id: 'charge',
      source: 'client',
      target: 'payments',
      sourceHandle: 'r',
      targetHandle: 'l',
      label: 'charge 99.00',
    },
    {
      id: 'retry',
      source: 'client',
      target: 'payments',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: 'retry, same body → charged twice',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

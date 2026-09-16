import type { FlowSpec } from './flow';

/** Постер: суть проблемы одной схемой. Один шаг, поэтому fixedStep. */
const poster: FlowSpec = {
  height: 215,
  fixedStep: 'problem',
  compact: true,
  nodes: [
    { id: 'client', kind: '{{kindService}}', title: '{{client}}', sub: '× 400 {{instances}}', position: { x: 0, y: 30 } },
    {
      id: 'payments',
      kind: '{{kindExternal}}',
      title: 'Payments API',
      sub: '{{down}}',
      position: { x: 240, y: 30 },
      bad: ['problem'],
    },
  ],
  edges: [
    {
      id: 'retries',
      source: 'client',
      target: 'payments',
      sourceHandle: 'r',
      targetHandle: 'l',
      label: '{{retry}} × 5',
      tone: 'bad',
    },
    {
      id: 'load',
      source: 'client',
      target: 'payments',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: '10 000 rps, {{zeroServed}}',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

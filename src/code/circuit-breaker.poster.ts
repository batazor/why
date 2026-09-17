import type { FlowSpec } from './flow';

/**
 * Главная связь идёт сверху: в зазоре между карточками подписи не хватает
 * строки, и она налезает на соседний узел.
 *
 * Постер: суть проблемы одной схемой. Один шаг, поэтому fixedStep.
 */
const poster: FlowSpec = {
  height: 235,
  fixedStep: 'problem',
  compact: true,
  nodes: [
    { id: 'client', kind: '{{kindService}}', title: '{{client}}', sub: '× 400 {{instances}}', position: { x: 0, y: 62 } },
    {
      id: 'payments',
      kind: '{{kindExternal}}',
      title: 'Payments API',
      sub: '{{down}}',
      position: { x: 240, y: 62 },
      bad: ['problem'],
    },
  ],
  edges: [
    {
      id: 'retries',
      source: 'client',
      target: 'payments',
      sourceHandle: 't',
      targetHandle: 't',
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

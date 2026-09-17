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
    { id: 'client', kind: '{{kindService}}', title: '{{client}}', sub: '{{checkoutFlow}}', position: { x: 0, y: 62 } },
    {
      id: 'payments',
      kind: '{{kindExternal}}',
      title: 'Payments API',
      sub: '{{notIdempotent}}',
      position: { x: 240, y: 62 },
      bad: ['problem'],
    },
  ],
  edges: [
    {
      id: 'charge',
      source: 'client',
      target: 'payments',
      sourceHandle: 't',
      targetHandle: 't',
      label: '{{charge}} 99.00',
    },
    {
      id: 'retry',
      source: 'client',
      target: 'payments',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: '{{retrySameBody}}',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

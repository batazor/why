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
    { id: 'promos', kind: '{{kindPromo}}', title: '{{twoPromos}}', sub: '{{eachFine}}', position: { x: 0, y: 62 } },
    {
      id: 'paid',
      kind: '{{kindResult}}',
      title: '{{paid}} 28.13',
      sub: '{{costWas}} 32.00',
      position: { x: 240, y: 62 },
      bad: ['problem'],
    },
  ],
  edges: [
    { id: 'stack', source: 'promos', target: 'paid', sourceHandle: 't', targetHandle: 't', label: '{{stacked}}', tone: 'bad' },
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

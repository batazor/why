import type { FlowSpec } from './flow';

/**
 * Главная связь идёт сверху: в зазоре между карточками подписи не хватает
 * строки, и она налезает на соседний узел.
 *
 * Постер: одно правило, размноженное по трём местам.
 * Один шаг, поэтому fixedStep.
 */
const poster: FlowSpec = {
  height: 235,
  fixedStep: 'problem',
  compact: true,
  nodes: [
    {
      id: 'rule',
      kind: '{{kindRule}}',
      title: '{{rule}}',
      sub: '{{ruleParts}}',
      position: { x: 0, y: 62 },
    },
    {
      id: 'places',
      kind: '{{kindRule}}',
      title: '{{places}}',
      sub: '{{placesList}}',
      position: { x: 240, y: 62 },
      bad: ['problem'],
    },
  ],
  edges: [
    {
      id: 'copies',
      source: 'rule',
      target: 'places',
      sourceHandle: 't',
      targetHandle: 't',
      label: '{{threeCopies}}',
      tone: 'bad',
    },
    {
      id: 'drift',
      source: 'rule',
      target: 'places',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: '{{onlyOne}}',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

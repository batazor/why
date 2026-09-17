import type { FlowSpec } from './flow';

/**
 * Главная связь идёт сверху: подпись у неё длинная, а между карточками места
 * на строку нет — она налезала на соседний узел.
 *
 * Постер: доменный факт уехал на шину как есть и стал чужим контрактом.
 * Один шаг, поэтому fixedStep.
 */
const poster: FlowSpec = {
  height: 235,
  fixedStep: 'leak',
  compact: true,
  nodes: [
    {
      id: 'ours',
      kind: '{{kindService}}',
      title: '{{ours}}',
      sub: '{{oursDoes}}',
      position: { x: 0, y: 62 },
    },
    {
      id: 'theirs',
      kind: '{{kindService}}',
      title: '{{theirs}}',
      sub: '{{theirsDoes}}',
      position: { x: 240, y: 62 },
      bad: ['leak'],
    },
  ],
  edges: [
    {
      id: 'asIs',
      source: 'ours',
      target: 'theirs',
      sourceHandle: 't',
      targetHandle: 't',
      label: '{{asIs}}',
      tone: 'bad',
    },
    {
      id: 'renamed',
      source: 'ours',
      target: 'theirs',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: '{{renamed}}',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

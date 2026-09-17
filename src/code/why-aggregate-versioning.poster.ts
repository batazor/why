import type { FlowSpec } from './flow';

/**
 * Главная связь идёт сверху: подпись у неё длинная, а между карточками места
 * на строку нет — она налезала на соседний узел.
 *
 * Постер: два вызова прочитали одно состояние, записал последний.
 * Один шаг, поэтому fixedStep.
 */
const poster: FlowSpec = {
  height: 235,
  fixedStep: 'lost',
  compact: true,
  nodes: [
    {
      id: 'first',
      kind: '{{kindCall}}',
      title: '{{first}}',
      sub: '{{firstDoes}}',
      position: { x: 0, y: 62 },
    },
    {
      id: 'second',
      kind: '{{kindCall}}',
      title: '{{second}}',
      sub: '{{secondDoes}}',
      position: { x: 240, y: 62 },
      bad: ['lost'],
    },
  ],
  edges: [
    {
      id: 'sameState',
      source: 'first',
      target: 'second',
      sourceHandle: 't',
      targetHandle: 't',
      label: '{{sameState}}',
      tone: 'bad',
    },
    {
      id: 'lastWins',
      source: 'first',
      target: 'second',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: '{{lastWins}}',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

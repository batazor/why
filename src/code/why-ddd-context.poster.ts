import type { FlowSpec } from './flow';

/**
 * Главная связь идёт сверху, а не между узлами: подпись у неё длинная, а
 * между карточками места на строку нет — она налезала на соседний узел.
 *
 * Постер: одно слово, два разных события. Один шаг, поэтому fixedStep.
 */
const poster: FlowSpec = {
  height: 235,
  fixedStep: 'boundary',
  compact: true,
  nodes: [
    {
      id: 'product',
      kind: '{{kindTeam}}',
      title: '{{product}}',
      sub: '{{productSays}}',
      position: { x: 0, y: 62 },
    },
    {
      id: 'ledger',
      kind: '{{kindTeam}}',
      title: '{{ledger}}',
      sub: '{{ledgerSays}}',
      position: { x: 240, y: 62 },
      bad: ['boundary'],
    },
  ],
  edges: [
    {
      id: 'same',
      source: 'product',
      target: 'ledger',
      sourceHandle: 't',
      targetHandle: 't',
      label: '{{sameWord}}',
      tone: 'bad',
    },
    {
      id: 'nobody',
      source: 'product',
      target: 'ledger',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: '{{nobodyAsked}}',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

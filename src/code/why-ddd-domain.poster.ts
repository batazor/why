import type { FlowSpec } from './flow';

/**
 * Главная связь идёт сверху, а не между узлами: подпись у неё длинная, а
 * между карточками места на строку нет — она налезала на соседний узел.
 *
 * Постер: итог не равен сумме строк. Один шаг, поэтому fixedStep.
 */
const poster: FlowSpec = {
  height: 235,
  fixedStep: 'domain',
  compact: true,
  nodes: [
    {
      id: 'lines',
      kind: '{{kindData}}',
      title: '{{lines}}',
      sub: '{{linesSum}}',
      position: { x: 0, y: 62 },
    },
    {
      id: 'total',
      kind: '{{kindData}}',
      title: '{{total}}',
      sub: '{{totalSaved}}',
      position: { x: 240, y: 62 },
      bad: ['domain'],
    },
  ],
  edges: [
    {
      id: 'given',
      source: 'lines',
      target: 'total',
      sourceHandle: 't',
      targetHandle: 't',
      label: '{{passedIn}}',
      tone: 'bad',
    },
    {
      id: 'nochecks',
      source: 'lines',
      target: 'total',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: '{{noRule}}',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

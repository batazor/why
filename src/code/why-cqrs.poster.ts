import type { FlowSpec } from './flow';

/**
 * Главная связь идёт сверху, а не между узлами: подпись у неё длинная, а
 * между карточками места на строку нет — она налезала на соседний узел.
 *
 * Постер: одна модель обслуживает и запись, и чтение — и обе страдают. */
const poster: FlowSpec = {
  height: 235,
  fixedStep: 'problem',
  compact: true,
  nodes: [
    {
      id: 'write',
      kind: '{{kindSide}}',
      title: '{{write}}',
      sub: '{{writeNeeds}}',
      position: { x: 0, y: 62 },
    },
    {
      id: 'read',
      kind: '{{kindSide}}',
      title: '{{read}}',
      sub: '{{readNeeds}}',
      position: { x: 240, y: 62 },
      bad: ['problem'],
    },
  ],
  edges: [
    {
      id: 'shared',
      source: 'write',
      target: 'read',
      sourceHandle: 't',
      targetHandle: 't',
      label: '{{oneModel}}',
      tone: 'bad',
    },
    {
      id: 'both',
      source: 'write',
      target: 'read',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: '{{bothSuffer}}',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

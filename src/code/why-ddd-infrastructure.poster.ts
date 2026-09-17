import type { FlowSpec } from './flow';

/**
 * Главная связь идёт сверху, а не между узлами: подпись у неё длинная, а
 * между карточками места на строку нет — она налезала на соседний узел.
 *
 * Постер: факт уехал, а в базе его нет. Один шаг, поэтому fixedStep.
 */
const poster: FlowSpec = {
  height: 235,
  fixedStep: 'issuing',
  compact: true,
  nodes: [
    {
      id: 'scenario',
      kind: '{{kindStep}}',
      title: '{{scenario}}',
      sub: '{{scenarioSub}}',
      position: { x: 0, y: 62 },
    },
    {
      id: 'subscriber',
      kind: '{{kindStep}}',
      title: '{{subscriber}}',
      sub: '{{subscriberSub}}',
      position: { x: 240, y: 62 },
      bad: ['issuing'],
    },
  ],
  edges: [
    {
      id: 'published',
      source: 'scenario',
      target: 'subscriber',
      sourceHandle: 't',
      targetHandle: 't',
      label: '{{published}}',
      tone: 'bad',
    },
    {
      id: 'lost',
      source: 'scenario',
      target: 'subscriber',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: '{{notSaved}}',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

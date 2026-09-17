import type { FlowSpec } from './flow';

/**
 * Главная связь идёт сверху: подпись у неё длинная, а между карточками места
 * на строку нет — она налезала на соседний узел.
 *
 * Постер: снаружи JSON, внутри доменные сущности, и между ними никого.
 * Один шаг, поэтому fixedStep.
 */
const poster: FlowSpec = {
  height: 235,
  fixedStep: 'entry',
  compact: true,
  nodes: [
    {
      id: 'request',
      kind: '{{kindEdge}}',
      title: '{{request}}',
      sub: '{{requestHas}}',
      position: { x: 0, y: 62 },
      bad: ['entry'],
    },
    {
      id: 'scenario',
      kind: '{{kindEdge}}',
      title: '{{scenario}}',
      sub: '{{scenarioWants}}',
      position: { x: 240, y: 62 },
    },
  ],
  edges: [
    {
      id: 'noTranslator',
      source: 'request',
      target: 'scenario',
      sourceHandle: 't',
      targetHandle: 't',
      label: '{{noTranslator}}',
      tone: 'bad',
    },
    {
      id: 'noMain',
      source: 'request',
      target: 'scenario',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: '{{noMain}}',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

import type { FlowSpec } from './flow';

/**
 * Главная связь идёт сверху: в зазоре между карточками подписи не хватает
 * строки, и она налезает на соседний узел.
 *
 * Постер: правило, которому не место ни в агрегате, ни в сценарии.
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
      sub: '{{ruleNeeds}}',
      position: { x: 0, y: 62 },
    },
    {
      id: 'invoice',
      kind: '{{kindRule}}',
      title: '{{invoice}}',
      sub: '{{invoiceKnows}}',
      position: { x: 240, y: 62 },
      bad: ['problem'],
    },
  ],
  edges: [
    {
      id: 'notone',
      source: 'rule',
      target: 'invoice',
      sourceHandle: 't',
      targetHandle: 't',
      label: '{{notOneAggregate}}',
      tone: 'bad',
    },
    {
      id: 'leaks',
      source: 'rule',
      target: 'invoice',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: '{{leaksToScenario}}',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

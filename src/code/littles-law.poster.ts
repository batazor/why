import type { FlowSpec } from './flow';

/**
 * Постер: суть проблемы одной схемой. Один шаг, поэтому fixedStep.
 *
 * Оба числа, из которых ответ выводится однозначно, на схеме есть — и ящик
 * всё равно со знаком вопроса. Ровно так задачу и обсуждают: поток известен,
 * время известно, а размер пула называют на глаз.
 */
const poster: FlowSpec = {
  height: 235,
  fixedStep: 'problem',
  compact: true,
  nodes: [
    {
      id: 'arrivals',
      kind: '{{kindFlow}}',
      title: '{{arrivals}}',
      sub: '10 /s · 30 s',
      position: { x: 0, y: 62 },
    },
    {
      id: 'system',
      kind: '{{kindSystem}}',
      title: '{{system}}',
      sub: '{{howMany}}',
      position: { x: 240, y: 62 },
      bad: ['problem'],
    },
  ],
  edges: [
    {
      id: 'in',
      source: 'arrivals',
      target: 'system',
      sourceHandle: 't',
      targetHandle: 't',
      label: 'λ, W',
    },
    {
      id: 'guess',
      source: 'arrivals',
      target: 'system',
      sourceHandle: 'b',
      targetHandle: 'b',
      label: '{{guessed}}',
      tone: 'bad',
      dashed: true,
    },
  ],
};

export default poster;

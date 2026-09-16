import type { FlowSpec } from './flow';

const WITH_BREAKER = ['closed', 'open', 'halfopen', 'recover'];

const flow: FlowSpec = {
  height: 430,
  nodes: [
    { id: 'client', kind: 'service', title: 'Client', sub: '× 400 instances', position: { x: 0, y: 0 } },
    {
      id: 'breaker',
      kind: 'pattern',
      title: 'Circuit breaker',
      sub: 'wraps the call',
      position: { x: 235, y: 0 },
      only: WITH_BREAKER,
    },
    {
      id: 'payments',
      kind: 'external',
      title: 'Payments API',
      sub: 'third party',
      position: { x: 470, y: 0 },
      bad: ['cascade', 'open'],
    },

    {
      id: 'closed',
      kind: 'state',
      title: 'Closed',
      sub: 'calls pass through',
      position: { x: 0, y: 160 },
      active: WITH_BREAKER,
      focus: ['closed', 'recover'],
    },
    {
      id: 'open',
      kind: 'state',
      title: 'Open',
      sub: 'calls rejected',
      position: { x: 235, y: 285 },
      active: WITH_BREAKER,
      focus: ['open'],
      bad: ['open'],
    },
    {
      id: 'halfopen',
      kind: 'state',
      title: 'Half-open',
      sub: 'one probe',
      position: { x: 470, y: 160 },
      active: WITH_BREAKER,
      focus: ['halfopen'],
    },
  ],
  edges: [
    {
      id: 'direct',
      source: 'client',
      target: 'payments',
      sourceHandle: 'r',
      targetHandle: 'l',
      label: 'retry × 5',
      tone: 'bad',
      only: ['cascade'],
    },
    { id: 'in', source: 'client', target: 'breaker', sourceHandle: 'r', targetHandle: 'l', only: WITH_BREAKER },
    { id: 'out', source: 'breaker', target: 'payments', sourceHandle: 'r', targetHandle: 'l', only: WITH_BREAKER },

    {
      id: 'trip',
      source: 'closed',
      target: 'open',
      sourceHandle: 'b',
      targetHandle: 'l',
      label: 'failures ≥ 5',
      only: ['open', 'recover'],
    },
    {
      id: 'cooldown',
      source: 'open',
      target: 'halfopen',
      sourceHandle: 'r',
      targetHandle: 'b',
      label: 'after 30 s',
      only: ['halfopen', 'recover'],
    },
    {
      id: 'probe-ok',
      source: 'halfopen',
      target: 'closed',
      sourceHandle: 'l',
      targetHandle: 'r',
      label: 'probe ok',
      tone: 'ok',
      only: ['recover'],
    },
    {
      id: 'probe-fail',
      source: 'halfopen',
      target: 'open',
      sourceHandle: 'b',
      targetHandle: 't',
      label: 'probe fails',
      tone: 'bad',
      dashed: true,
      only: ['recover'],
    },
  ],
  // Только геометрия: текст пометки переводится и лежит в steps[].note урока.
  annotations: [
    { step: 'cascade', position: { x: 482, y: 114 }, arrow: 'up' },
    { step: 'closed', position: { x: 0, y: 84 }, arrow: 'down', width: 210 },
    { step: 'open', position: { x: 460, y: 302 }, arrow: 'left', width: 175 },
    { step: 'halfopen', position: { x: 482, y: 254 }, arrow: 'up', width: 190 },
    { step: 'recover', position: { x: 0, y: 84 }, arrow: 'down', width: 210 },
  ],
};

export default flow;

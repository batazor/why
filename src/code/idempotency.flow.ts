import type { FlowSpec } from './flow';

const BEFORE_HANDLER = ['naive', 'timeout', 'key', 'store'];

/**
 * Схема разбора: что происходит с одним намерением «списать 99.00» на каждом шаге.
 *
 * Ключевой кадр — последний: банк гаснет до призрака. Это и есть суть
 * идемпотентности, показанная схемой, а не текстом: повтор доехал до сервиса,
 * но не доехал до провайдера.
 */
const flow: FlowSpec = {
  height: 370,
  nodes: [
    {
      id: 'client',
      kind: '{{kindService}}',
      title: '{{client}}',
      sub: '{{checkoutFlow}}',
      position: { x: 0, y: 40 },
      focus: ['key'],
    },
    {
      id: 'api',
      kind: '{{kindService}}',
      title: 'POST /charge',
      sub: '{{yourService}}',
      position: { x: 300, y: 40 },
      focus: ['naive', 'handler'],
    },
    {
      id: 'bank',
      kind: '{{kindExternal}}',
      title: 'Payments API',
      sub: '{{moneyMoves}}',
      position: { x: 600, y: 40 },
      // На шаге handler банк гаснет: повтор до него не доехал.
      active: BEFORE_HANDLER,
      bad: ['timeout'],
    },
    {
      id: 'keys',
      kind: '{{kindStorage}}',
      title: 'idempotency_keys',
      sub: '{{keyIsPk}}',
      position: { x: 300, y: 240 },
      only: ['store', 'handler'],
      focus: ['store'],
    },
  ],
  edges: [
    // 1. Наивный обработчик: один вызов, один платёж.
    { id: 'n1', source: 'client', target: 'api', sourceHandle: 'r', targetHandle: 'l', label: 'POST /charge', only: ['naive'] },
    { id: 'n2', source: 'api', target: 'bank', sourceHandle: 'r', targetHandle: 'l', label: '{{charge}} 99.00', only: ['naive'] },

    // 2. Ответ потерян, клиент повторяет — платёж уходит дважды.
    { id: 't1', source: 'client', target: 'api', sourceHandle: 'r', targetHandle: 'l', label: '{{attempts}} 1 + 2', tone: 'bad', only: ['timeout'] },
    { id: 't2', source: 'api', target: 'bank', sourceHandle: 'r', targetHandle: 'l', label: '{{charge}} 99.00 × 2', tone: 'bad', only: ['timeout'] },
    { id: 't3', source: 'api', target: 'client', sourceHandle: 't', targetHandle: 't', label: '{{responseLost}}', tone: 'bad', dashed: true, only: ['timeout'] },

    // 3. Ключ именует намерение и переживает ретрай.
    { id: 'k1', source: 'client', target: 'api', sourceHandle: 'r', targetHandle: 'l', label: '{{key}}: k_7f3', only: ['key'] },
    { id: 'k2', source: 'api', target: 'bank', sourceHandle: 'r', targetHandle: 'l', label: '{{charge}} 99.00', only: ['key'] },

    // 4. Уникальность живёт в базе, а не в памяти процесса.
    { id: 's1', source: 'client', target: 'api', sourceHandle: 'r', targetHandle: 'l', label: '{{key}}: k_7f3', only: ['store'] },
    { id: 's2', source: 'api', target: 'keys', sourceHandle: 'b', targetHandle: 't', label: '{{insertIfAbsent}}', only: ['store'] },
    { id: 's3', source: 'api', target: 'bank', sourceHandle: 'r', targetHandle: 'l', label: '{{charge}} 99.00', only: ['store'] },

    // 5. Повтор проигрывает гонку на вставке и до банка не доезжает.
    { id: 'h1', source: 'client', target: 'api', sourceHandle: 'r', targetHandle: 'l', label: '{{sameKeyRetry}}', only: ['handler'] },
    { id: 'h2', source: 'api', target: 'keys', sourceHandle: 'b', targetHandle: 't', label: '{{keyClaimed}}', only: ['handler'] },
    { id: 'h3', source: 'api', target: 'client', sourceHandle: 't', targetHandle: 't', label: '200, {{sameChargeId}}', tone: 'ok', only: ['handler'] },
  ],
  // Только геометрия: текст пометки переводится и лежит в steps[].note урока.
  annotations: [
    { step: 'naive', position: { x: 612, y: 152 }, arrow: 'up' },
    { step: 'timeout', position: { x: 612, y: 152 }, arrow: 'up', width: 200 },
    { step: 'key', position: { x: 0, y: 152 }, arrow: 'up', width: 200 },
    { step: 'store', position: { x: 536, y: 250 }, arrow: 'left', width: 170 },
    { step: 'handler', position: { x: 612, y: 152 }, arrow: 'up', width: 200 },
  ],
};

export default flow;

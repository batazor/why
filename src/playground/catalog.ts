/**
 * Каталог блоков, из которых собирается схема.
 *
 * Иконка — имя codicon, цвет — оттенок категории: по цвету на схеме сразу
 * видно, где хранилища, а где вычисления. Названия блоков — ключи локали,
 * чтобы каталог был один на все языки.
 */

export type BlockCategory = 'client' | 'edge' | 'compute' | 'storage' | 'messaging' | 'infra';

export interface BlockSpec {
  kind: string;
  category: BlockCategory;
  icon: string;
  /** Хранилище состояния: для подсказки про единую точку отказа. */
  stateful?: boolean;
}

export const CATEGORIES: BlockCategory[] = ['client', 'edge', 'compute', 'storage', 'messaging', 'infra'];

export const BLOCKS: BlockSpec[] = [
  { kind: 'user', category: 'client', icon: 'person' },
  { kind: 'mobile', category: 'client', icon: 'device-mobile' },
  { kind: 'external', category: 'client', icon: 'globe' },

  { kind: 'dns', category: 'edge', icon: 'radio-tower' },
  { kind: 'cdn', category: 'edge', icon: 'cloud' },
  { kind: 'lb', category: 'edge', icon: 'type-hierarchy' },
  { kind: 'gateway', category: 'edge', icon: 'shield' },
  { kind: 'ratelimit', category: 'edge', icon: 'filter' },

  { kind: 'service', category: 'compute', icon: 'server-process' },
  { kind: 'worker', category: 'compute', icon: 'gear' },
  { kind: 'function', category: 'compute', icon: 'zap' },
  { kind: 'cron', category: 'compute', icon: 'clock' },

  { kind: 'sql', category: 'storage', icon: 'database', stateful: true },
  { kind: 'nosql', category: 'storage', icon: 'table', stateful: true },
  { kind: 'kv', category: 'storage', icon: 'key', stateful: true },
  { kind: 'cache', category: 'storage', icon: 'rocket', stateful: true },
  { kind: 'object', category: 'storage', icon: 'archive', stateful: true },
  { kind: 'search', category: 'storage', icon: 'search', stateful: true },
  { kind: 'tsdb', category: 'storage', icon: 'graph', stateful: true },

  { kind: 'queue', category: 'messaging', icon: 'inbox', stateful: true },
  { kind: 'stream', category: 'messaging', icon: 'list-ordered', stateful: true },
  { kind: 'pubsub', category: 'messaging', icon: 'broadcast', stateful: true },
  { kind: 'outbox', category: 'messaging', icon: 'output' },

  { kind: 'auth', category: 'infra', icon: 'lock' },
  { kind: 'config', category: 'infra', icon: 'symbol-misc' },
  { kind: 'metrics', category: 'infra', icon: 'pulse' },
  { kind: 'logs', category: 'infra', icon: 'history' },
];

export const BLOCK_BY_KIND = new Map(BLOCKS.map((block) => [block.kind, block]));

export const STATEFUL_KINDS: ReadonlySet<string> = new Set(
  BLOCKS.filter((block) => block.stateful).map((block) => block.kind),
);

/** Неизвестный тип из чужого файла рисуется обычным сервисом, а не роняет схему. */
export function blockSpec(kind: string): BlockSpec {
  return BLOCK_BY_KIND.get(kind) ?? { kind, category: 'compute', icon: 'symbol-misc' };
}

/** Протоколы-подсказки для подписи связи. */
export const EDGE_PRESETS = ['HTTP', 'gRPC', 'SQL', 'TCP', 'WebSocket', 'publish', 'consume', 'CDC'];

import { emptyDesign, uid, type Design, type DesignEdge, type DesignNode, type Endpoint, type HttpMethod, type Requirement } from './model';

/**
 * Пример сценария: сокращатель ссылок. Задача классическая и маленькая — на
 * ней видно всё, что умеет песочница: эталон с блоками, технологиями и
 * связями обоих видов, ФТ и НФТ с числами, подсказки, критерии и вопросы.
 */

type Text = { en: string; ru: string };

const TITLE: Text = { en: 'URL shortener', ru: 'Сокращатель ссылок' };

const TASK: Text = {
  en: `Design a URL shortener.

Users paste a long URL and get a short one (7 characters). Following the short link redirects to the original. Links live for 5 years. Users see click counts for their links.

Out of scope: custom domains, link editing, billing.`,
  ru: `Спроектировать сокращатель ссылок.

Пользователь вставляет длинный URL и получает короткий (7 символов). Переход по короткой ссылке редиректит на исходную. Ссылка живёт 5 лет. Автор видит число переходов по своим ссылкам.

За рамками: свои домены, редактирование ссылок, биллинг.`,
};

const NODES: Array<[string, string, Text, number, number, Text?, string?]> = [
  ['user', 'user', { en: 'User', ru: 'Пользователь' }, 0, 160],
  ['cdn', 'cdn', { en: 'CDN', ru: 'CDN' }, 200, 40, { en: 'Caches 301s for hot links', ru: 'Кэширует 301 для горячих ссылок' }],
  ['lb', 'lb', { en: 'Load balancer', ru: 'Балансировщик' }, 200, 260, undefined, 'cloudlb'],
  ['api', 'service', { en: 'Shortener API', ru: 'API сокращателя' }, 420, 160, { en: 'Stateless, scales horizontally', ru: 'Без состояния, масштабируется вширь' }],
  ['cache', 'cache', { en: 'Hot links', ru: 'Горячие ссылки' }, 660, 40, { en: 'code → URL, LRU', ru: 'код → URL, LRU' }, 'redis'],
  ['db', 'nosql', { en: 'Links DB', ru: 'БД ссылок' }, 660, 180, { en: 'Partitioned by code', ru: 'Партиционирована по коду' }, 'dynamodb'],
  ['queue', 'stream', { en: 'Click log', ru: 'Лог кликов' }, 660, 330, undefined, 'kafka'],
  ['agg', 'worker', { en: 'Click aggregator', ru: 'Агрегатор кликов' }, 900, 330],
  ['stats', 'tsdb', { en: 'Click stats', ru: 'Статистика кликов' }, 1120, 330, undefined, 'clickhouse'],
];

const EDGES: Array<[string, string, string, 'sync' | 'async']> = [
  ['user', 'cdn', 'GET /abc123', 'sync'],
  ['user', 'lb', 'POST /links', 'sync'],
  ['cdn', 'lb', 'miss', 'sync'],
  ['lb', 'api', 'HTTP', 'sync'],
  ['api', 'cache', 'GET', 'sync'],
  ['api', 'db', 'read / write', 'sync'],
  ['api', 'queue', 'publish', 'async'],
  ['queue', 'agg', 'consume', 'async'],
  ['agg', 'stats', 'batch upsert', 'sync'],
];

const REQS: Array<[string, Text, Text?, Requirement['category']?, string[]?]> = [
  ['FR-1', { en: 'Create a short link for a long URL', ru: 'Создать короткую ссылку для длинного URL' }, undefined, undefined, ['api', 'db']],
  ['FR-2', { en: 'Redirect from a short link to the original', ru: 'Редирект с короткой ссылки на исходную' }, undefined, undefined, ['cdn', 'api', 'cache']],
  ['FR-3', { en: 'Show click counts for my links', ru: 'Показать число переходов по моим ссылкам' }, undefined, undefined, ['queue', 'agg', 'stats']],
  ['NFR-1', { en: 'Redirect is fast', ru: 'Редирект быстрый' }, { en: 'p99 ≤ 50 ms', ru: 'p99 ≤ 50 мс' }, 'latency', ['cdn', 'cache']],
  ['NFR-2', { en: 'Redirect is always available', ru: 'Редирект доступен всегда' }, { en: '99.99% over 30 days', ru: '99,99% за 30 дней' }, 'availability', ['lb', 'cdn']],
  ['NFR-3', { en: 'A created link is never lost', ru: 'Созданная ссылка не теряется' }, { en: '3 replicas, RPO = 0', ru: '3 реплики, RPO = 0' }, 'durability', ['db']],
  ['NFR-4', { en: 'Click counts may lag', ru: 'Счётчики могут отставать' }, { en: 'eventual, ≤ 1 min', ru: 'в конечном счёте, ≤ 1 мин' }, 'consistency', ['queue', 'agg']],
];

const ROUTES: Array<[HttpMethod, string, number, Text, string[], string[], string, string[]]> = [
  [
    'POST',
    '/links',
    201,
    { en: 'Create a short link. A retry with the same key returns the same code.', ru: 'Создать короткую ссылку. Повтор с тем же ключом вернёт тот же код.' },
    ['Idempotency-Key', 'url'],
    ['code', 'short_url'],
    'api',
    ['FR-1'],
  ],
  [
    'GET',
    '/{code}',
    302,
    { en: 'Redirect. 302, not 301: the browser must not cache it, or clicks go uncounted.', ru: 'Редирект. 302, а не 301: браузер не должен его кэшировать, иначе клики не посчитаются.' },
    [],
    ['Location'],
    'api',
    ['FR-2'],
  ],
  [
    'GET',
    '/links/{code}/stats',
    200,
    { en: 'Click counts; may lag up to a minute.', ru: 'Число переходов; может отставать до минуты.' },
    [],
    ['clicks', 'updated_at'],
    'api',
    ['FR-3'],
  ],
];

const GUIDE: Text = {
  en: 'Expect requirements first, then numbers (reads ≫ writes, ~100:1), then the design. Strong candidates separate the redirect path from click analytics and discuss how codes are generated without collisions.',
  ru: 'Ждём сначала требования, потом числа (чтений намного больше записей, ~100:1), потом схему. Сильный кандидат отделяет путь редиректа от аналитики кликов и обсуждает, как генерировать коды без коллизий.',
};

const HINTS: Text[] = [
  { en: 'How many redirects per second at peak compared to link creations?', ru: 'Сколько редиректов в секунду на пике по сравнению с созданием ссылок?' },
  { en: 'The redirect path must not wait for anything but the lookup.', ru: 'Путь редиректа не должен ждать ничего, кроме поиска ссылки.' },
  { en: 'Counting clicks does not have to happen in the request.', ru: 'Считать клики не обязательно внутри запроса.' },
];

const RUBRIC: Array<[Text, number]> = [
  [{ en: 'Clarifies requirements and scope', ru: 'Уточняет требования и рамки' }, 1],
  [{ en: 'Estimates load and storage', ru: 'Оценивает нагрузку и объём' }, 1],
  [{ en: 'Fast, cacheable redirect path', ru: 'Быстрый, кэшируемый путь редиректа' }, 2],
  [{ en: 'Collision-free code generation', ru: 'Генерация кодов без коллизий' }, 2],
  [{ en: 'Analytics off the hot path', ru: 'Аналитика вне горячего пути' }, 1],
  [{ en: 'Trade-offs are named and justified', ru: 'Называет и обосновывает компромиссы' }, 2],
];

const QUESTIONS: Text[] = [
  { en: 'How do you generate 7-character codes without collisions across instances?', ru: 'Как генерировать 7-символьные коды без коллизий между инстансами?' },
  { en: '301 or 302 — and what does each do to your click counts?', ru: '301 или 302 — и что каждый делает со счётчиком кликов?' },
  { en: 'A celebrity posts a link: 100k redirects per second to one code. What breaks?', ru: 'Знаменитость публикует ссылку: 100 тысяч редиректов в секунду на один код. Что ломается?' },
  { en: 'How do you expire links after 5 years without a full scan?', ru: 'Как удалять ссылки через 5 лет без полного сканирования?' },
];

export function exampleDesign(lang: string): Design {
  const pick = (text: Text) => (lang === 'ru' ? text.ru : text.en);
  const design = emptyDesign(pick(TITLE));

  const ids = new Map<string, string>();
  const nodes = NODES.map(([key, kind, label, x, y, note, tech]): DesignNode => {
    const id = `${design.id}_${key}`;
    ids.set(key, id);
    return { id, kind, label: pick(label), note: note ? pick(note) : '', x, y, ...(tech ? { tech } : {}) };
  });
  const edges = EDGES.map(([from, to, label, mode], index): DesignEdge => ({
    id: `${design.id}_e${index}`,
    source: ids.get(from)!,
    target: ids.get(to)!,
    label,
    mode,
  }));
  const requirements = REQS.map(([id, text, target, category, covers]): Requirement => ({
    id,
    kind: id.startsWith('NFR') ? 'nfr' : 'fr',
    text: pick(text),
    target: target ? pick(target) : '',
    category,
    covers: (covers ?? []).map((key) => ids.get(key)!),
  }));
  const api: Endpoint[] = ROUTES.map(([method, path, status, about, request, response, service, covers]) => ({
    id: uid('api'),
    method,
    path,
    status,
    about: pick(about),
    request,
    response,
    outbound: false,
    service: ids.get(service),
    covers,
  }));
  /**
   * Схема и требования — эталон автора. Кандидат начинает с пустой доски:
   * иначе собеседовать не о чем.
   */
  design.scenario = {
    reference: { nodes, edges, requirements, api },
    hints: HINTS.map((text) => ({ id: uid('h'), text: pick(text) })),
    rubric: RUBRIC.map(([text, weight]) => ({ id: uid('r'), text: pick(text), weight })),
    questions: QUESTIONS.map((text) => ({ id: uid('q'), text: pick(text) })),
    allowChecks: false,
    guide: pick(GUIDE),
  };
  design.task = pick(TASK);
  design.taskSource = 'Product Owner';
  design.calc = {
    enabled: true,
    values: { dau: 10_000_000, writesPerUser: 0.1, readRatio: 100, peakFactor: 3, objectKb: 0.5, retentionDays: 1825, replication: 3, latencyMs: 20 },
  };
  return design;
}

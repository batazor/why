import type { DbTable, KeyFlag } from './schema';
import { emptyDesign, uid, type Design, type DesignEdge, type DesignNode, type Endpoint, type HttpMethod, type Requirement } from './model';

/**
 * Пример сценария — та же задача, что в разборе «System design: сервис
 * скрейпинг-джоб»: приём джоб, очередь, пул воркеров, результаты в объектном
 * хранилище.
 *
 * Задача выбрана не случайно: в ней есть всё, ради чего песочница и сделана —
 * требования с числами, очередь между приёмом и работой, идемпотентность,
 * outbox прямо в строке джобы, аренда, ретраи и приоритеты. Разбор этой же
 * задачи по шагам лежит на сайте, и автор сценария может дать на него ссылку.
 */

type Text = { en: string; ru: string };

const TITLE: Text = { en: 'Scraping jobs service', ru: 'Сервис скрейпинг-джоб' };

/** Задание — дословно то, что приносит продукт: ни одного числа. */
const TASK: Text = {
  en: `We need a system that lets users run scraping jobs against various APIs without making them wait for the results. Users should be able to see what's happening with their jobs and get the data when it's done.

Sometimes the APIs can be slow or unreliable, so we need to make sure jobs don't just fail for no reason. Also, we expect this to be used by a lot of people, so it should be able to handle a lot of jobs at once.`,
  ru: `Нужна система, в которой пользователи запускают скрейпинг-джобы против разных API и не ждут результата. Пользователь должен видеть, что происходит с его джобами, и получить данные, когда они готовы.

API бывают медленные и ненадёжные, поэтому джобы не должны падать просто так. И пользоваться этим будут многие — система должна тянуть много джоб одновременно.`,
};

const NODES: Array<[string, string, Text, number, number, Text?, string?]> = [
  ['user', 'user', { en: 'User / script', ru: 'Пользователь / скрипт' }, 0, 430],
  ['gateway', 'gateway', { en: 'API gateway', ru: 'API-шлюз' }, 330, 430],
  [
    'command',
    'service',
    { en: 'job-command', ru: 'job-command' },
    680,
    170,
    {
      en: 'The only writer of a job. Never calls the targets: a slow target must not slow intake down.',
      ru: 'Единственный, кто пишет джобу. В цели не ходит никогда: медленная цель не должна замедлять приём.',
    },
  ],
  [
    'reader',
    'service',
    { en: 'job-query', ru: 'job-query' },
    680,
    680,
    {
      en: 'Status and attempt history. Reads happen an order of magnitude more often than writes.',
      ru: 'Статусы и история попыток. Читают на порядок чаще, чем пишут.',
    },
  ],
  [
    'db',
    'sql',
    { en: 'jobs-pg', ru: 'jobs-pg' },
    1030,
    420,
    {
      en: 'Jobs and attempts. The job row is its own outbox: published_at marks what has not reached the bus yet.',
      ru: 'Джобы и попытки. Строка джобы сама служит outbox: published_at показывает, что ещё не ушло в шину.',
    },
    'postgres',
  ],
  [
    'publisher',
    'worker',
    { en: 'job-publisher', ru: 'job-publisher' },
    1030,
    0,
    {
      en: 'Reads unpublished rows and puts them on the bus. Nobody else writes to the queue, so there is no dual write.',
      ru: 'Читает неопубликованные строки и кладёт их в шину. Больше в очередь не пишет никто — двойной записи нет.',
    },
  ],
  [
    'mq',
    'queue',
    { en: 'MQ: jobs.high / normal / low', ru: 'MQ: jobs.high / normal / low' },
    1390,
    0,
    {
      en: 'Three queues by priority, taken with weights 6 : 3 : 1. An empty queue gives its share to the rest.',
      ru: 'Три очереди по приоритету, разбираются с весами 6 : 3 : 1. Пустая очередь отдаёт долю остальным.',
    },
    'rabbitmq',
  ],
  [
    'worker',
    'worker',
    { en: 'scrape-worker', ru: 'scrape-worker' },
    1760,
    0,
    {
      en: 'Takes a job under a lease, calls the target, saves the result, moves the status.',
      ru: 'Берёт джобу под аренду, ходит в цель, складывает результат, двигает статус.',
    },
  ],
  ['targets', 'external', { en: 'Target APIs', ru: 'Целевые API' }, 1790, 300],
  [
    'results',
    'object',
    { en: 'results-s3', ru: 'results-s3' },
    1390,
    330,
    {
      en: 'Terabytes that have no place in a state database. The client downloads by a presigned URL.',
      ru: 'Терабайты, которым нечего делать в базе состояний. Клиент скачивает по подписанной ссылке.',
    },
    's3',
  ],
  [
    'scheduler',
    'cron',
    { en: 'job-scheduler', ru: 'job-scheduler' },
    1030,
    740,
    {
      en: 'Returns jobs with expired leases, plans retries with backoff, decides when attempts are exhausted.',
      ru: 'Возвращает джобы с истёкшей арендой, планирует ретраи с backoff, решает, когда попытки кончились.',
    },
  ],
];

const EDGES: Array<[string, string, Text, 'sync' | 'async']> = [
  ['user', 'gateway', { en: 'submit, status', ru: 'приём, статус' }, 'sync'],
  ['gateway', 'command', { en: 'create job', ru: 'создать джобу' }, 'sync'],
  ['gateway', 'reader', { en: 'status, list', ru: 'статус, список' }, 'sync'],
  ['command', 'db', { en: 'published_at = null', ru: 'published_at = null' }, 'sync'],
  ['db', 'reader', { en: 'status, attempts', ru: 'статус, попытки' }, 'sync'],
  ['db', 'publisher', { en: 'unpublished rows', ru: 'неопубликованные строки' }, 'sync'],
  ['publisher', 'mq', { en: 'job events', ru: 'события джобы' }, 'async'],
  ['mq', 'worker', { en: 'weights 6 : 3 : 1', ru: 'веса 6 : 3 : 1' }, 'async'],
  ['worker', 'targets', { en: 'fetch, per-domain limit', ru: 'запрос, лимит домена' }, 'sync'],
  ['worker', 'results', { en: 'payload', ru: 'результат' }, 'sync'],
  ['worker', 'db', { en: 'status, lease', ru: 'статус, аренда' }, 'sync'],
  ['results', 'user', { en: 'presigned URL', ru: 'подписанная ссылка' }, 'sync'],
  ['scheduler', 'db', { en: 'leases, retries', ru: 'аренда, ретраи' }, 'sync'],
];

/** Требования из разбора: номера те же, чтобы сценарий и статья не разъезжались. */
const REQS: Array<[string, Text, Text?, Requirement['category']?, string[]?]> = [
  ['FR-1', { en: 'Accept a job — what to fetch, from where, with what parameters — and return an id', ru: 'Принять джобу — что забрать, откуда, с какими параметрами — и вернуть идентификатор' }, undefined, undefined, ['gateway', 'command', 'db']],
  ['FR-2', { en: 'Show a job’s state by its id', ru: 'Показать состояние джобы по идентификатору' }, undefined, undefined, ['reader', 'db']],
  ['FR-3', { en: 'List one’s own jobs, filtered by state', ru: 'Показать список своих джоб с фильтром по состоянию' }, undefined, undefined, ['reader', 'db']],
  ['FR-4', { en: 'Hand over a finished job’s result', ru: 'Отдать результат готовой джобы' }, undefined, undefined, ['reader', 'results']],
  ['FR-5', { en: 'Cancel a job that has not run yet', ru: 'Отменить джобу, которая ещё не выполнилась' }, undefined, undefined, ['command', 'db']],
  ['FR-6', { en: 'Repeat a job — as a new job linked to the old one', ru: 'Повторить джобу — новой джобой со ссылкой на прежнюю' }, undefined, undefined, ['command', 'db']],
  ['FR-7', { en: 'Call back when a job is finished', ru: 'Позвать обратно, когда джоба закончилась' }, undefined, undefined, ['publisher', 'mq', 'worker']],
  ['FR-8', { en: 'Show a job’s attempt history with the target’s answers', ru: 'Показать историю попыток джобы с ответами цели' }, undefined, undefined, ['reader', 'db']],
  ['FR-9', { en: 'Set a job priority: high, normal or low', ru: 'Задать джобе приоритет: high, normal или low' }, undefined, undefined, ['command', 'publisher', 'mq']],

  ['NFR-1', { en: 'Intake survives the targets being down', ru: 'Приём переживает падение целей' }, { en: '99.9% successful intake responses over 30 days', ru: '99,9% успешных ответов приёма за 30 дней' }, 'availability', ['gateway', 'command', 'db']],
  ['NFR-2', { en: 'Intake answers fast', ru: 'Приём отвечает быстро' }, { en: 'p99 ≤ 200 ms', ru: 'p99 ≤ 200 мс' }, 'latency', ['gateway', 'command']],
  ['NFR-3', { en: 'An accepted job is not lost', ru: 'Принятая джоба не теряется' }, { en: '99% of jobs reach a final state with no human', ru: '99% джоб доходят до конечного состояния без человека' }, 'durability', ['db', 'publisher', 'mq']],
  ['NFR-4', { en: 'Tenants are isolated', ru: 'Арендаторы изолированы' }, { en: 'one tenant cannot take the whole pool', ru: 'один арендатор не занимает весь пул' }, 'scalability', ['mq', 'worker']],
  ['NFR-5', { en: 'Repeating a submission does not create a second job', ru: 'Повтор приёма не создаёт вторую джобу' }, { en: 'an idempotency key on every POST /jobs', ru: 'ключ идемпотентности в каждом POST /jobs' }, 'consistency', ['command', 'db']],
  ['NFR-6', { en: 'We are polite to targets', ru: 'Мы вежливы к целям' }, { en: 'request and connection limits per domain, Retry-After honoured', ru: 'лимит запросов и соединений на домен, Retry-After соблюдается' }, 'throughput', ['worker']],
  ['NFR-7', { en: 'A job’s history is visible', ru: 'По джобе видно, что с ней было' }, { en: 'attempt history with the target’s answers; oldest job age on the dashboard', ru: 'история попыток с ответами цели; возраст старейшей джобы на дашборде' }, 'observability', ['db', 'reader']],
  ['NFR-8', { en: 'A job starts without a long wait', ru: 'Джоба стартует без долгого ожидания' }, { en: '95% of jobs start within the first minute', ru: '95% джоб стартуют в первую минуту' }, 'latency', ['mq', 'worker', 'scheduler']],
  ['NFR-9', { en: 'The system handles the peak flow', ru: 'Система выдерживает пиковый поток' }, { en: '28 jobs/s at peak, up to 556 in flight', ru: '28 джоб/с на пике, до 556 одновременно в работе' }, 'throughput', ['mq', 'worker']],
  ['NFR-10', { en: 'A result is kept for the retention period', ru: 'Результат хранится срок ретеншна' }, { en: '30 days, about 2.3 TB', ru: '30 дней, около 2,3 ТБ' }, 'cost', ['results']],
  ['NFR-11', { en: 'Temporary target failures do not fail the job', ru: 'Временные отказы цели не роняют джобу' }, { en: 'up to 5 attempts, exponential backoff with jitter', ru: 'до 5 попыток, экспоненциальный backoff с разбросом' }, 'durability', ['scheduler', 'worker']],
  ['NFR-12', { en: 'Urgent jobs go faster, low priority does not starve', ru: 'Срочные джобы идут быстрее, низкий приоритет не голодает' }, { en: 'queue weights 6 : 3 : 1; an empty queue gives its share to the rest', ru: 'веса очередей 6 : 3 : 1; пустая очередь отдаёт долю остальным' }, 'throughput', ['mq', 'publisher', 'worker']],
];

const ROUTES: Array<[HttpMethod, string, number, Text, string[], string[], string, string[], boolean?]> = [
  [
    'POST',
    '/jobs',
    202,
    { en: 'Submit a job. The answer is immediate and carries no data: just a receipt and where to track it.', ru: 'Поставить джобу. Ответ сразу, данных в нём нет: только расписка и адрес, где следить.' },
    ['Idempotency-Key', 'url', 'params', 'priority', 'callback_url?'],
    ['id', 'status: queued', 'links.self'],
    'gateway',
    ['FR-1', 'FR-9'],
  ],
  [
    'GET',
    '/jobs/{id}',
    200,
    { en: 'Job state, number of attempts and the last target error.', ru: 'Состояние джобы, число попыток и последняя ошибка цели.' },
    [],
    ['status', 'attempts', 'last_error'],
    'gateway',
    ['FR-2'],
  ],
  [
    'GET',
    '/jobs?status=&cursor=',
    200,
    { en: 'Your jobs filtered by state: a script with a thousand jobs needs one request.', ru: 'Свои джобы с фильтром по состоянию: скрипту с тысячей джоб хватает одного запроса.' },
    [],
    ['items[]', 'next_cursor'],
    'gateway',
    ['FR-3'],
  ],
  [
    'GET',
    '/jobs/{id}/result',
    200,
    { en: 'Not the data but a signed storage link with an expiry.', ru: 'Не данные, а подписанная ссылка на хранилище со сроком действия.' },
    [],
    ['url', 'expires_at'],
    'gateway',
    ['FR-4'],
  ],
  [
    'DELETE',
    '/jobs/{id}',
    202,
    { en: 'Cancel. A running attempt finishes first; the state moves to cancelled.', ru: 'Отменить. Идущая попытка сначала доработает; состояние уходит в cancelled.' },
    [],
    ['status: cancelling'],
    'gateway',
    ['FR-5'],
  ],
  [
    'POST',
    '/jobs/{id}/retry',
    202,
    { en: 'Repeat as a new job that links to the old one. The old job keeps its history.', ru: 'Повторить новой джобой со ссылкой на прежнюю. У старой остаётся её история.' },
    ['Idempotency-Key'],
    ['id', 'rerun_of'],
    'gateway',
    ['FR-6'],
  ],
  [
    'GET',
    '/jobs/{id}/attempts',
    200,
    { en: 'Attempt history: when, how long, what the target answered.', ru: 'История попыток: когда, сколько шла, что ответила цель.' },
    [],
    ['items[]'],
    'gateway',
    ['FR-8'],
  ],
  [
    'POST',
    '{callback_url}',
    200,
    { en: 'We call the client when the job is finished. It may not arrive, so polling stays.', ru: 'Мы зовём клиента, когда джоба закончилась. Может не дойти, поэтому опрос остаётся.' },
    ['id', 'status', 'finished_at', 'X-Signature'],
    [],
    'publisher',
    ['FR-7'],
    true,
  ],
];

/** Поле схемы: имя, тип, ключи. Имена и типы — идентификаторы, не переводятся. */
type Field = [string, string, KeyFlag[]?];

/** Строк на одну принятую джобу, если не одна: попыток в среднем полторы. */
const ROWS_PER_WRITE: Record<string, number> = { attempts: 1.5 };

const SCHEMAS: Record<string, Array<[string, Text, Field[]]>> = {
  db: [
    [
      'jobs',
      { en: 'The row is its own outbox: an empty published_at means the event has not reached the bus.', ru: 'Строка сама себе outbox: пустой published_at значит, что событие ещё не ушло в шину.' },
      [
        ['id', 'uuid', ['pk']],
        ['tenant_id', 'uuid', ['index']],
        ['idempotency_key', 'text', ['unique']],
        ['status', 'text', ['index']],
        ['priority', 'text'],
        ['url', 'text'],
        ['params', 'jsonb'],
        ['attempt', 'int'],
        ['lease_until', 'timestamptz', ['index']],
        ['published_at', 'timestamptz', ['index']],
        ['result_key', 'text'],
        ['created_at', 'timestamptz'],
      ],
    ],
    [
      'attempts',
      { en: 'What the target answered, attempt by attempt: this is FR-8 and the ground for a retry.', ru: 'Что ответила цель, попытка за попыткой: это и FR-8, и основание для ретрая.' },
      [
        ['id', 'bigint', ['pk']],
        ['job_id', 'uuid', ['fk', 'index']],
        ['started_at', 'timestamptz'],
        ['duration_ms', 'int'],
        ['status_code', 'int'],
        ['error', 'text'],
      ],
    ],
  ],
  mq: [
    [
      'job_queued',
      { en: 'Keyed by job id; the queue is chosen by priority.', ru: 'Ключ — идентификатор джобы; очередь выбирается по приоритету.' },
      [
        ['job_id', 'uuid', ['partition']],
        ['tenant_id', 'uuid'],
        ['priority', 'string'],
        ['enqueued_at', 'timestamp'],
      ],
    ],
    [
      'job_finished',
      { en: 'The fact the webhook and the dashboards are built on.', ru: 'Факт, на котором строятся вебхук и дашборды.' },
      [
        ['job_id', 'uuid', ['partition']],
        ['status', 'string'],
        ['finished_at', 'timestamp'],
      ],
    ],
  ],
};

const ESTIMATE: Text = {
  en: `Flow: 50k users × 8 jobs/day = 400k jobs/day ≈ 4.6/s on average, peak ×6 ≈ 28/s.
In flight (Little's law): 28/s × 20 s per job ≈ 556 jobs at once → about 28 workers at 20 concurrent jobs each.
Results: 200 KB × 400k/day = 80 GB/day, 30 days ≈ 2.3 TB in object storage; jobs-pg only holds state.
The queue is not there for throughput but for the gap between average and peak: five peak minutes pile up ~7k jobs.`,
  ru: `Поток: 50 тыс. пользователей × 8 джоб в сутки = 400 тыс. джоб/сутки ≈ 4,6/с в среднем, пик ×6 ≈ 28/с.
Одновременно в работе (закон Литтла): 28/с × 20 с на джобу ≈ 556 джоб → около 28 воркеров по 20 джоб каждый.
Результаты: 200 КБ × 400 тыс./сутки = 80 ГБ/сутки, за 30 дней ≈ 2,3 ТБ в объектном хранилище; в jobs-pg только состояния.
Очередь нужна не ради пропускной способности, а ради разницы между средним и пиком: пять минут пика копят ~7 тыс. джоб.`,
};

const GUIDE: Text = {
  en: 'Expect requirements first, then numbers, then the diagram. Strong candidates keep intake away from the targets, notice that "accepted" must survive a restart (an outbox or its equivalent), and ask about idempotency before you do. Weak ones draw a queue in the first minute and cannot say what it is for. A step-by-step write-up of this exact task is on the site.',
  ru: 'Ждём сначала требования, потом числа, потом схему. Сильный кандидат уводит приём от целей, замечает, что «принято» должно пережить перезапуск (outbox или его аналог), и спрашивает про идемпотентность раньше вас. Слабый рисует очередь на первой минуте и не может сказать, зачем она. Разбор этой же задачи по шагам есть на сайте.',
};

const HINTS: Text[] = [
  { en: 'The client got "accepted" and the process restarted. What happens to the job?', ru: 'Клиент получил «принято», и процесс перезапустился. Что будет с джобой?' },
  { en: 'The client resends the same submission after a timeout. How many jobs are there now?', ru: 'Клиент после таймаута повторяет тот же приём. Сколько теперь джоб?' },
  { en: 'A worker took a job and died. Who notices, and when?', ru: 'Воркер взял джобу и умер. Кто это заметит и когда?' },
  { en: 'One tenant submits 100k jobs. What happens to everyone else?', ru: 'Один арендатор поставил 100 тысяч джоб. Что будет со всеми остальными?' },
];

const RUBRIC: Array<[Text, number]> = [
  [{ en: 'Asks back before drawing: who uses it, what counts as done, what is out of scope', ru: 'Спрашивает раньше, чем рисует: кто пользуется, что считается готовым, что за рамками' }, 2],
  [{ en: 'Turns the paragraph into requirements with numbers', ru: 'Превращает абзац в требования с числами' }, 2],
  [{ en: 'Estimates the flow and the pool (Little’s law) before choosing anything', ru: 'Оценивает поток и пул (закон Литтла) до выбора технологий' }, 1],
  [{ en: 'Intake does not depend on the targets', ru: 'Приём не зависит от целей' }, 2],
  [{ en: 'An accepted job survives a restart: an outbox or an equivalent, no dual write', ru: 'Принятая джоба переживает перезапуск: outbox или аналог, без двойной записи' }, 3],
  [{ en: 'Idempotent submission, retries with backoff, a lease against a stuck worker', ru: 'Идемпотентный приём, ретраи с backoff, аренда против зависшего воркера' }, 2],
  [{ en: 'Tenant fairness and priorities without starvation', ru: 'Честность между арендаторами и приоритеты без голодания' }, 1],
  [{ en: 'Names trade-offs instead of listing technologies', ru: 'Называет компромиссы, а не перечисляет технологии' }, 2],
];

const QUESTIONS: Text[] = [
  { en: 'Exactly-once or at-least-once for the worker? What makes the handler safe to run twice?', ru: 'Exactly-once или at-least-once у воркера? Что делает обработчик безопасным при повторе?' },
  { en: 'The result is 5 GB. What changes in the design?', ru: 'Результат весит 5 ГБ. Что меняется в схеме?' },
  { en: 'The target answers 429 with Retry-After: 300. Where does that wait live?', ru: 'Цель отвечает 429 с Retry-After: 300. Где живёт это ожидание?' },
  { en: 'How do you know the system is healthy without opening the logs?', ru: 'Как понять, что система здорова, не открывая логи?' },
  { en: 'The queue keeps growing. What do you look at first, and what do you change?', ru: 'Очередь растёт и растёт. На что смотрите первым делом и что меняете?' },
];

/**
 * Идентификатор примера постоянный: «Открыть пример» перезаписывает его, а не
 * плодит копии, и нетронутый пример обновляется вместе с песочницей.
 */
export const exampleId = (lang: string) => `example-${lang === 'ru' ? 'ru' : 'en'}`;

/** Правил ли человек пример: у нетронутого правка не двигала отметку времени. */
export const isUntouched = (design: Design) => design.updatedAt === design.createdAt;

export function exampleDesign(lang: string): Design {
  const pick = (text: Text) => (lang === 'ru' ? text.ru : text.en);
  const design = { ...emptyDesign(pick(TITLE)), id: exampleId(lang) };

  const ids = new Map<string, string>();
  const nodes = NODES.map(([key, kind, label, x, y, note, tech]): DesignNode => {
    const id = `${design.id}_${key}`;
    ids.set(key, id);
    const schema = SCHEMAS[key]?.map(
      ([name, about, fields]): DbTable => ({
        id: uid('t'),
        name,
        note: pick(about),
        columns: fields.map(([field, type, keys]) => ({ id: uid('c'), name: field, type, keys: keys ?? [], nullable: false })),
        ...(ROWS_PER_WRITE[name] ? { rowsPerWrite: ROWS_PER_WRITE[name] } : {}),
      }),
    );
    return {
      id,
      kind,
      label: pick(label),
      note: note ? pick(note) : '',
      x,
      y,
      ...(tech ? { tech } : {}),
      ...(schema ? { schema } : {}),
    };
  });

  const edges = EDGES.map(([from, to, label, mode], index): DesignEdge => ({
    id: `${design.id}_e${index}`,
    source: ids.get(from)!,
    target: ids.get(to)!,
    label: pick(label),
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

  const api: Endpoint[] = ROUTES.map(([method, path, status, about, request, response, service, covers, outbound]) => ({
    id: uid('api'),
    method,
    path,
    status,
    about: pick(about),
    request,
    response,
    outbound: Boolean(outbound),
    service: ids.get(service),
    covers,
  }));

  /**
   * Схема, требования, API и прикидка — эталон автора. Кандидат начинает с
   * пустой доски: иначе собеседовать не о чем.
   */
  design.scenario = {
    reference: { nodes, edges, requirements, api, estimate: pick(ESTIMATE) },
    hints: HINTS.map((text) => ({ id: uid('h'), text: pick(text) })),
    rubric: RUBRIC.map(([text, weight]) => ({ id: uid('r'), text: pick(text), weight })),
    questions: QUESTIONS.map((text) => ({ id: uid('q'), text: pick(text) })),
    allowChecks: false,
    guide: pick(GUIDE),
  };
  design.task = pick(TASK);
  design.taskSource = 'Product Owner';
  /**
   * Числа из разбора: 50 тыс. пользователей, 8 джоб в сутки, джоба 20 секунд,
   * пик ×6, результат 200 КБ, ретеншн 30 дней. Реплика одна: 2,3 ТБ из
   * разбора — это объём результатов, а не место на дисках хранилища.
   */
  design.calc = {
    mode: 'text',
    values: {
      dau: 50_000,
      writesPerUser: 8,
      readRatio: 20,
      peakFactor: 6,
      objectKb: 200,
      retentionDays: 30,
      replication: 1,
      latencyMs: 200,
    },
  };
  return design;
}

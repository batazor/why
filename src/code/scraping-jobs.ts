import type { CodeDeck } from './types';
import type { RequirementsData, WidgetSpec } from './widgets';
import type { LikeC4Spec } from './likec4';

/**
 * Колода разбора системного дизайна: сервис скрейпинг-джоб.
 *
 * Разбор идёт в том же порядке, в каком задачу разбирают вслух: понять, что
 * просят → спросить недостающее → записать требования → посчитать → и только
 * потом рисовать. Схема появляется не с первого шага намеренно: пока нет
 * чисел, любая схема — угадывание.
 *
 * ПРАВИЛО: код, дерево и схема общие для всех локалей, поэтому в них только
 * английский. Вся проза идёт в `narration` локализованного урока.
 *
 * Пока написана только вводная часть. Дальше — скелет: id шага закреплён,
 * панель у него появится вместе с текстом. Шаги про архитектуру получат
 * `likec4`-view'ы, когда модель для них будет написана; объявлять спеку
 * заранее нельзя — check-steps ловит ссылку на несуществующий view.
 */
/**
 * Схема разбора: C2 по одному элементу за кадр.
 *
 * Каждый следующий кадр добавляет ровно то, о чём говорит его шаг, — читателю
 * видно, какой вопрос вызвал к жизни каждую коробку. Кадры стоят рядом с
 * текстом; итоговый идёт во всю ширину: в половине его подписи не прочитать.
 */
/** Обложка в каталоге: акварель — джобы, очередь, воркеры, чужие сайты. */
export const cover = 'covers/scraping-jobs.svg';

export const likec4: LikeC4Spec = {
  height: 460,
  views: {
    c1: 'scrape_context',
    'c2-gateway': 'scrape_gateway',
    'c2-command': 'scrape_command',
    'c2-outbox': 'scrape_outbox',
    'c2-workers': 'scrape_workers',
    'c2-lease': 'scrape_lease',
    'c2-results': 'scrape_results',
    'c2-view': 'scrape_read',
    cache: 'scrape_cache',
    'c2-full': 'scrape_full',
    'seq-submit': 'scrape_submit_seq',
    'seq-read': 'scrape_read_seq',
    'c3-scheduler': 'scrape_scheduler',
    priority: 'scrape_priority',
  },
  // Итоговая схема и последовательности — во всю ширину: в половине экрана их
  // подписи не прочитать.
  wide: ['c2-full', 'seq-submit', 'seq-read'],
  // Итоговому кадру своя высота: схема целиком почти квадратная, и в общей
  // высоте сжималась до мелких подписей. Сверху её ограничивает ещё 88% экрана.
  // C3 — тоже своя высота: схема вертикальная, и в общей высоте кадра она
  // сжималась сильнее, чем вытянутая вбок.
  heights: { 'c2-full': 1000, 'c3-scheduler': 900, 'seq-submit': 760, 'seq-read': 560 },
  // Итоговая схема — только связи: подписи запросов живут на последовательностях.
  bare: ['c2-full'],
  // Группы шагов на последовательности записи: две транзакции и обработка.
  // Номера — шаги динамического view `scrape_submit_seq`.
  groups: {
    'seq-submit': [
      { from: 2, to: 4, label: 'seq.intake' },
      { from: 6, to: 8, label: 'seq.publisher' },
      { from: 9, to: 13, label: 'seq.worker' },
    ],
  },
  // Стикеры поверх кадров — только там, где схема показывает то, что легко
  // пропустить или понять неправильно: отсутствующую коробку, встречные
  // стрелки, связь в обход. Текст — `note` шага в уроке.
  notes: {
    'c1': { element: 'targets', side: 'bottom' },
    'c2-outbox': { element: 'scraper.jobs_db', side: 'bottom' },
    'c2-lease': { element: 'scraper.scheduler', side: 'bottom' },
    'c2-results': { element: 'scraper.results', side: 'bottom' },
    'c2-full': { element: 'scraper.mq', side: 'bottom' },
  },
};

/**
 * Документ требований, который читатель собирает сам.
 *
 * Строки появляются на шаге, который их вводит, а цели — числа — могут
 * прийти позже: «приём отвечает быстро» записывают на шаге про свойства,
 * «за 200 мс» — на шаге про SLO. Так таблица растёт вместе с разбором, и к
 * концу в ней всё, до чего он договорился.
 *
 * Текст строк — проза, живёт в `labels` урока. Здесь только номера, виды и
 * шаги.
 */
const requirements: RequirementsData = {
  name: 'scraping-jobs',
  rows: [
    { id: 'FR-1', kind: 'fr', step: 'fr' },
    { id: 'FR-2', kind: 'fr', step: 'fr' },
    { id: 'FR-3', kind: 'fr', step: 'fr' },
    { id: 'FR-4', kind: 'fr', step: 'fr' },
    { id: 'FR-5', kind: 'fr', step: 'fr' },
    { id: 'FR-6', kind: 'fr', step: 'fr' },
    { id: 'FR-7', kind: 'fr', step: 'fr' },
    { id: 'FR-8', kind: 'fr', step: 'fr' },
    { id: 'NFR-1', kind: 'nfr', step: 'nfr', goal: 'slo' },
    { id: 'NFR-2', kind: 'nfr', step: 'nfr', goal: 'slo' },
    { id: 'NFR-3', kind: 'nfr', step: 'nfr', goal: 'slo' },
    { id: 'NFR-4', kind: 'nfr', step: 'nfr' },
    { id: 'NFR-5', kind: 'nfr', step: 'nfr', goal: 'api' },
    { id: 'NFR-6', kind: 'nfr', step: 'nfr', goal: 'politeness' },
    { id: 'NFR-7', kind: 'nfr', step: 'nfr', goal: 'observability' },
    // Новые строки по ходу разбора: их не было в разговоре с продуктом, они
    // выросли из чисел и из того, что всплыло на схеме.
    { id: 'NFR-8', kind: 'nfr', step: 'slo', goal: 'slo' },
    { id: 'NFR-9', kind: 'nfr', step: 'concurrency', goal: 'concurrency' },
    { id: 'NFR-10', kind: 'nfr', step: 'storage', goal: 'storage' },
    { id: 'NFR-11', kind: 'nfr', step: 'retries', goal: 'retries' },
    // Чтение. Строка приходит на шаге расчёта, где впервые видно, что запросов
    // статуса на порядок больше, чем принятых джоб; число к ней — на шаге про
    // кеш, где решено, куда этот поток девать.
    { id: 'NFR-13', kind: 'nfr', step: 'load', goal: 'cache' },
    { id: 'NFR-14', kind: 'nfr', step: 'cache', goal: 'cache' },
    // Требование, пришедшее после основного разбора: приоритет джобы.
    { id: 'FR-9', kind: 'fr', step: 'priority' },
    { id: 'NFR-12', kind: 'nfr', step: 'priority', goal: 'priority' },
  ],
};

/** Таблица стоит на каждом шаге, который что-то в неё приносит. */
const board = { widget: 'requirements', data: requirements } as const;

/**
 * Врезки разбора. Числа в них — конструкция, а не перевод: диапазоны ползунков
 * и правильные ответы одинаковы во всех локалях, а подписи живут в `labels`
 * локализованного урока.
 */
export const widgets: WidgetSpec = {
  /**
   * Транзакция изнутри — sub-flow на React Flow. Отдельным шагом после
   * outbox: там кадр C2 показывает, что появилось в архитектуре, здесь — что
   * происходит внутри одной транзакции и что остаётся, когда что-то падает.
   */
  'c2-transaction': {
    widget: 'transaction-flow',
    data: { scenarios: ['ok', 'crash', 'redeliver'] },
  },

  /**
   * Жизненный цикл джобы — стейт-машина. Цвет перехода — кто его делает:
   * отсюда видно, что в `failed` джобу переводит планировщик, а не воркер.
   */
  lifecycle: {
    widget: 'job-lifecycle',
    data: {
      initial: 'running',
      states: [
        { key: 'start', x: -90, y: 128, start: true },
        { key: 'queued', x: 80, y: 110 },
        { key: 'running', x: 330, y: 110 },
        { key: 'succeeded', x: 600, y: 20, terminal: true },
        { key: 'failed', x: 600, y: 200, terminal: true },
        { key: 'cancelled', x: 205, y: 290, terminal: true },
      ],
      transitions: [
        { id: 'submit', from: 'start', to: 'queued', actor: 'command', out: 'right', in: 'left' },
        { id: 'take', from: 'queued', to: 'running', actor: 'worker', out: 'right', in: 'left' },
        { id: 'done', from: 'running', to: 'succeeded', actor: 'worker', out: 'right', in: 'left' },
        { id: 'retry', from: 'running', to: 'queued', actor: 'scheduler', out: 'top', in: 'top' },
        { id: 'exhausted', from: 'running', to: 'failed', actor: 'scheduler', out: 'right', in: 'left' },
        { id: 'cancelQueued', from: 'queued', to: 'cancelled', actor: 'client', out: 'bottom', in: 'left' },
        { id: 'cancelRunning', from: 'running', to: 'cancelled', actor: 'client', out: 'bottom', in: 'right' },
      ],
    },
  },

  /**
   * Итог: решения разбора против требований. Каждая строка таблицы закрыта
   * хотя бы одной карточкой — это проверяет check-steps, иначе итог обещал бы
   * ответ, которого нет.
   */
  answer: {
    widget: 'requirement-match',
    wide: true,
    data: {
      requirements,
      cards: [
        { key: 'intake', fits: ['FR-1', 'NFR-1', 'NFR-2'] },
        { key: 'idempotency', fits: ['NFR-5'] },
        { key: 'outbox', fits: ['NFR-3'] },
        { key: 'lease', fits: ['NFR-3'] },
        { key: 'query', fits: ['FR-2', 'FR-3'] },
        { key: 'cache', fits: ['NFR-13', 'NFR-14'] },
        { key: 'results', fits: ['FR-4', 'NFR-10'] },
        { key: 'cancel', fits: ['FR-5'] },
        { key: 'rerun', fits: ['FR-6'] },
        { key: 'webhook', fits: ['FR-7'] },
        { key: 'attempts', fits: ['FR-8', 'NFR-7'] },
        { key: 'backoff', fits: ['NFR-11'] },
        { key: 'domainLimit', fits: ['NFR-6'] },
        { key: 'fairQueue', fits: ['NFR-4'] },
        { key: 'autoscale', fits: ['NFR-8', 'NFR-9'] },
        { key: 'priorityQueues', fits: ['FR-9', 'NFR-12'] },
      ],
    },
  },
  fr: board,
  nfr: board,
  slo: board,
  concurrency: board,
  storage: board,
  api: board,
  retries: board,
  politeness: board,
  observability: board,

  /**
   * Калькулятор нагрузки. Значения по умолчанию — небольшой, но настоящий
   * сервис: полсотни тысяч пользователей, восемь джоб в сутки на каждого. С
   * них и начинается разговор «а если вырастем в двадцать раз».
   */
  load: {
    widget: 'load-calculator',
    // В колонке рядом с текстом: читатель двигает ползунок и тут же читает
    // абзац о том, что это число значит.
    wide: false,
    data: {
      inputs: [
        { key: 'users', min: 100, max: 5_000_000, scale: 'log', value: 50_000 },
        { key: 'jobsPerUser', min: 1, max: 200, value: 8 },
        // Длительность джобы растёт на порядки: страница отдаётся за секунду,
        // медленный чужой API — за минуту.
        { key: 'jobSeconds', min: 1, max: 300, scale: 'log', value: 20 },
        { key: 'peakFactor', min: 1, max: 20, value: 6 },
        // Как часто клиент спрашивает «ну что там». Отсюда берётся поток
        // чтения: он не равен потоку джоб и в норме на порядок больше него.
        // Секунда — опрос в цикле без паузы, две минуты — «проверю попозже».
        { key: 'pollSeconds', min: 1, max: 120, scale: 'log', value: 5 },
        { key: 'perWorker', min: 1, max: 100, scale: 'log', value: 20 },
        { key: 'resultKb', min: 1, max: 20_000, scale: 'log', value: 200 },
        { key: 'retentionDays', min: 1, max: 365, value: 30 },
      ],
      // Границы в джобах в секунду на пике: где хватает одной машины, где нужен
      // пул и где разговор переходит к шардированию по целям.
      verdict: { single: 5, pool: 200 },
    },
  },

  /**
   * Сортировка требований. Стоит на шаге про рамки: к этому месту названы и
   * функции, и свойства, и читатель может разложить утверждения сам — а
   * половина из них сядет не туда, где он ожидал.
   *
   * Ответы здесь, а не в локали: «отменить джобу — функция» верно на всех
   * языках. В локали только формулировки и объяснения.
   */
  scope: {
    widget: 'requirement-sort',
    // В колонке рядом с текстом: читатель раскладывает, не теряя из виду
    // абзац про то, чем функция отличается от свойства.
    wide: false,
    data: {
      bins: ['fr', 'nfr', 'out'],
      items: [
        { key: 'submit', bin: 'fr' },
        { key: 'status', bin: 'fr' },
        { key: 'result', bin: 'fr' },
        { key: 'cancel', bin: 'fr' },
        { key: 'latency', bin: 'nfr' },
        { key: 'durability', bin: 'nfr' },
        { key: 'isolation', bin: 'nfr' },
        { key: 'intake', bin: 'nfr' },
        { key: 'captcha', bin: 'out' },
        { key: 'billing', bin: 'out' },
      ],
    },
  },

  /**
   * Шумный сосед. Числа подобраны так, чтобы разница между порядками была
   * видна за десяток секунд: два спокойных арендатора по джобе в две секунды и
   * один, который приходит с залпом в четыреста штук.
   *
   * Восемь воркеров по четыре секунды — это две джобы в секунду. Залп соседа
   * при общей очереди занимает пул на три минуты, и всё это время остальные
   * стоят за ним.
   */
  /**
   * Какую MQ взять: матрица сравнения под наши требования. Оценки — часть
   * конструкции, пояснения в ячейках — проза локали.
   */
  broker: {
    widget: 'broker-matrix',
    wide: true,
    data: {
      choice: 'rabbitmq',
      brokers: [
        { key: 'kafka', name: 'Kafka' },
        { key: 'rabbitmq', name: 'RabbitMQ' },
        { key: 'nats', name: 'NATS JetStream' },
        { key: 'sqs', name: 'SQS' },
      ],
      rows: [
        { key: 'ack', req: 'NFR-3', scores: { kafka: 'no', rabbitmq: 'yes', nats: 'yes', sqs: 'yes' } },
        { key: 'backoff', req: 'NFR-11', scores: { kafka: 'no', rabbitmq: 'partial', nats: 'yes', sqs: 'yes' } },
        { key: 'priority', req: 'NFR-12', scores: { kafka: 'partial', rabbitmq: 'yes', nats: 'partial', sqs: 'partial' } },
        { key: 'dlq', req: 'NFR-3', scores: { kafka: 'no', rabbitmq: 'yes', nats: 'partial', sqs: 'yes' } },
        { key: 'fanout', req: 'FR-7', scores: { kafka: 'yes', rabbitmq: 'yes', nats: 'yes', sqs: 'no' } },
        { key: 'throughput', req: 'NFR-9', scores: { kafka: 'yes', rabbitmq: 'yes', nats: 'yes', sqs: 'yes' } },
        { key: 'ops', scores: { kafka: 'no', rabbitmq: 'partial', nats: 'yes', sqs: 'yes' } },
        { key: 'lockin', scores: { kafka: 'yes', rabbitmq: 'yes', nats: 'yes', sqs: 'no' } },
      ],
    },
  },

  /**
   * Тот же шумный сосед, но с приоритетами. Краулер со своим залпом — normal,
   * магазин — high, аналитик — low: на «строго» аналитик не стартует, пока у
   * краулера есть работа, на весах получает свою десятую долю.
   */
  'priority-sim': {
    widget: 'noisy-neighbour',
    wide: false,
    data: {
      tenants: [
        { key: 'shop', rate: 0.5, burst: 0, weight: 1, priority: 'high' },
        { key: 'analyst', rate: 0.5, burst: 0, weight: 1, priority: 'low' },
        { key: 'crawler', rate: 1, burst: 400, weight: 1, priority: 'normal' },
      ],
      workers: 8,
      jobSeconds: 4,
      policies: ['strict', 'weights'],
      priorities: { weights: { high: 6, normal: 3, low: 1 } },
    },
  },
  fairness: {
    widget: 'noisy-neighbour',
    // В колонке рядом с текстом: читатель переключает политику и тут же
    // читает, что она меняет.
    wide: false,
    data: {
      tenants: [
        { key: 'shop', rate: 0.5, burst: 0, weight: 1 },
        { key: 'analyst', rate: 0.5, burst: 0, weight: 1 },
        { key: 'crawler', rate: 1, burst: 400, weight: 3 },
      ],
      workers: 8,
      jobSeconds: 4,
      policies: ['fifo', 'fair', 'weighted'],
    },
  },
};

const deck: CodeDeck = [
  // Что просят и чего в условии нет.
  { id: 'overview' },
  { id: 'questions' },

  // Требования: сперва кто и что, потом какими свойствами.
  { id: 'actors' },
  { id: 'fr' },
  { id: 'scope' },
  { id: 'nfr' },
  { id: 'slo' },

  // Расчёты. Без них выбор между «один воркер в цикле» и «пул на сто машин»
  // делается на вкус, а он у всех разный.
  { id: 'load' },
  { id: 'concurrency' },
  { id: 'storage' },

  // Архитектура: сверху вниз по C4.
  { id: 'c1' },

  // C2 растёт по кадру на шаг: вход, запись, outbox, пул, аренда, результаты,
  // читающая сторона — и всё вместе.
  { id: 'c2-gateway' },
  { id: 'c2-command' },
  { id: 'c2-outbox' },
  { id: 'c2-transaction' },
  { id: 'c2-workers' },
  { id: 'c2-lease' },
  // Сначала читающая сторона, потом кеш под ней — поток чтения посчитан на
  // шаге `load`, и без кеша он упирается в ту же базу, что и приём, — и только
  // потом получение результата поверх всего этого.
  { id: 'c2-view' },
  { id: 'cache' },
  { id: 'c2-results' },
  { id: 'c2-full' },

  // Структура показана, дальше — порядок: запросы по шагам, последовательностью.
  { id: 'seq-submit' },
  { id: 'seq-read' },

  // C3: спуск внутрь одного сервиса — планировщика.
  { id: 'c3-scheduler' },
  { id: 'api' },
  { id: 'lifecycle' },

  // Вызовы, ради которых задача и задана: чужие API медленные и ненадёжные,
  // а пользователей много.
  { id: 'retries' },
  { id: 'politeness' },
  { id: 'fairness' },
  { id: 'results' },
  { id: 'observability' },
  { id: 'priority' },
  { id: 'priority-sim' },
  { id: 'broker' },
  { id: 'tradeoffs' },
  { id: 'answer' },
];

export default deck;

/** Врезки внутри текста шага: колонка рядом у этих шагов занята. */
export const inlineWidgets: WidgetSpec = {
  /**
   * Контракт карточками: метод, путь, код ответа и поля. Стоят в тексте
   * шага: колонку рядом занимает таблица требований, куда на этом шаге
   * приходит цель NFR-5.
   */
  api: {
    widget: 'api-cards',
    data: {
      endpoints: [
        {
          key: 'submit',
          method: 'POST',
          path: '/jobs',
          status: 202,
          statusText: 'Accepted',
          request: ['Idempotency-Key', 'url', 'params', 'priority'],
          response: ['id', 'status: queued', 'links.self'],
        },
        {
          key: 'status',
          method: 'GET',
          path: '/jobs/{id}',
          status: 200,
          statusText: 'OK',
          response: ['status', 'attempts', 'last_error'],
        },
        {
          key: 'list',
          method: 'GET',
          path: '/jobs?status=',
          status: 200,
          statusText: 'OK',
          response: ['items[]', 'next_cursor'],
        },
        {
          key: 'result',
          method: 'GET',
          path: '/jobs/{id}/result',
          status: 200,
          statusText: 'OK',
          response: ['url', 'expires_at'],
        },
        {
          key: 'webhook',
          method: 'POST',
          path: '{callback_url}',
          status: 200,
          statusText: 'OK',
          request: ['id', 'status', 'finished_at'],
          outbound: true,
        },
      ],
    },
  },
};

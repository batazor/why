import type { CodeDeck } from './types';
import type { RequirementsData, WidgetSpec } from './widgets';
import type { LikeC4Spec } from './likec4';

/**
 * Колода разбора системного дизайна: сервис клипов с пандами.
 *
 * Задача с собеседования: пользователь загружает видео из зоопарка, система
 * сама находит куски, где в кадре панда, клипы можно тегировать, искать и
 * смотреть. Разбор идёт в том же порядке, что и у скрейпинг-джоб: понять →
 * спросить → записать требования → посчитать → нарисовать.
 *
 * Чем этот разбор отличается от скрейпера: поток крошечный — доли видео в
 * секунду, — а единица тяжёлая: сотни мегабайт на входе и минута GPU в
 * обработке. Поэтому брокера здесь нет, очередь — таблица в базе. Клип — не
 * файл, а пара таймкодов в оригинале: нарезки и второго хранилища нет,
 * оригинал хранится целиком и раздаётся по диапазону через CDN. Главные
 * решения — про байты: куда их лить, что хранить, откуда раздавать.
 *
 * ПРАВИЛО: код, дерево и схема общие для всех локалей, поэтому в них только
 * английский. Вся проза идёт в `narration` локализованного урока.
 */

/** Обложка в каталоге: акварель, public/covers/panda-clips.svg (scripts/covers/build.py). */
export const cover = 'covers/panda-clips.svg';

/**
 * Схема разбора: C2 по одному элементу за кадр, порядок — порядок байтов.
 * Два шага делят один кадр: очередь и аренда — об одной и той же таблице.
 */
export const likec4: LikeC4Spec = {
  height: 460,
  views: {
    c1: 'pandas_context',
    'c2-upload': 'pandas_upload',
    'c2-queue': 'pandas_queue',
    'c2-pipeline': 'pandas_pipeline',
    'c2-lease': 'pandas_queue',
    'c2-read': 'pandas_read',
    'c2-delivery': 'pandas_delivery',
    'c2-full': 'pandas_full',
    'seq-upload': 'pandas_upload_seq',
    'seq-watch': 'pandas_watch_seq',
    'c3-pipeline': 'pandas_pipeline_c3',
  },
  // Итоговая схема и последовательности — во всю ширину: в половине экрана их
  // подписи не прочитать.
  wide: ['c2-full', 'seq-upload', 'seq-watch'],
  heights: { 'c2-full': 1000, 'c3-pipeline': 720, 'seq-upload': 820, 'seq-watch': 500 },
  // Итоговая схема — только связи: подписи запросов живут на последовательностях.
  bare: ['c2-full'],
  // Рамки на последовательности загрузки: старт, завершение, обработка.
  // Между первой и второй — части в хранилище, мимо API.
  groups: {
    'seq-upload': [
      { from: 1, to: 5, label: 'seq.start' },
      { from: 7, to: 10, label: 'seq.complete' },
      { from: 11, to: 14, label: 'seq.pipeline' },
    ],
  },
  // Стикеры — только там, где схема показывает то, что легко пропустить:
  // отсутствующую коробку очереди, отсутствующее второе хранилище, байты
  // мимо API.
  notes: {
    c1: { element: 'cdn', side: 'bottom' },
    'c2-queue': { element: 'pandas.db', side: 'bottom' },
    'c2-pipeline': { element: 'pandas.raw', side: 'bottom' },
    'c2-lease': { element: 'pandas.pipeline', side: 'bottom' },
    'c2-delivery': { element: 'cdn', side: 'bottom' },
    'c2-full': { element: 'pandas.db', side: 'bottom' },
  },
};

/**
 * Документ требований, который читатель собирает сам.
 *
 * Строки появляются на шаге, который их вводит, цели — числа — могут прийти
 * позже. Текст строк — проза, живёт в `labels` урока; здесь только номера,
 * виды и шаги.
 */
const requirements: RequirementsData = {
  name: 'panda-clips',
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
    { id: 'NFR-2', kind: 'nfr', step: 'nfr', goal: 'api' },
    { id: 'NFR-3', kind: 'nfr', step: 'nfr', goal: 'slo' },
    { id: 'NFR-4', kind: 'nfr', step: 'nfr', goal: 'slo' },
    { id: 'NFR-5', kind: 'nfr', step: 'nfr', goal: 'slo' },
    { id: 'NFR-6', kind: 'nfr', step: 'nfr', goal: 'slo' },
    { id: 'NFR-7', kind: 'nfr', step: 'nfr', goal: 'fairness' },
    { id: 'NFR-8', kind: 'nfr', step: 'nfr', goal: 'api' },
    // Новые строки по ходу разбора: выросли из чисел и из того, что всплыло
    // на схеме.
    { id: 'NFR-9', kind: 'nfr', step: 'calc-pipeline', goal: 'calc-pipeline' },
    { id: 'NFR-10', kind: 'nfr', step: 'calc-storage', goal: 'retention' },
    { id: 'NFR-11', kind: 'nfr', step: 'c2-lease', goal: 'c2-lease' },
    { id: 'NFR-12', kind: 'nfr', step: 'calc-delivery', goal: 'c2-delivery' },
    { id: 'NFR-13', kind: 'nfr', step: 'detection', goal: 'detection' },
    { id: 'NFR-14', kind: 'nfr', step: 'observability', goal: 'observability' },
  ],
};

/** Таблица стоит на каждом шаге, который что-то в неё приносит и у которого колонка свободна. */
const board = { widget: 'requirements', data: requirements } as const;

/**
 * Ползунки, общие для калькуляторов. Значения по умолчанию — небольшой, но
 * настоящий сервис: пять тысяч пятиминутных видео в сутки с телефона.
 */
const uploadsPerDay = { key: 'uploadsPerDay', min: 100, max: 1_000_000, scale: 'log', value: 5_000 } as const;
const videoMinutes = { key: 'videoMinutes', min: 1, max: 120, scale: 'log', value: 5 } as const;
const peakFactor = { key: 'peakFactor', min: 1, max: 20, value: 4 } as const;
const clipSeconds = { key: 'clipSeconds', min: 5, max: 120, value: 20 } as const;

export const widgets: WidgetSpec = {
  fr: board,
  nfr: board,
  slo: board,
  api: board,
  detection: board,
  retention: board,
  observability: board,

  /**
   * Сортировка требований. Стоит на шаге про рамки: к этому месту названы и
   * функции, и свойства, и читатель может разложить утверждения сам.
   */
  scope: {
    widget: 'requirement-sort',
    wide: false,
    data: {
      bins: ['fr', 'nfr', 'out'],
      items: [
        { key: 'upload', bin: 'fr' },
        { key: 'watch', bin: 'fr' },
        { key: 'tag', bin: 'fr' },
        { key: 'search', bin: 'fr' },
        { key: 'resumable', bin: 'nfr' },
        { key: 'startFast', bin: 'nfr' },
        { key: 'fairness', bin: 'nfr' },
        { key: 'fresh', bin: 'nfr' },
        { key: 'moderation', bin: 'out' },
        { key: 'recommend', bin: 'out' },
      ],
    },
  },

  /**
   * Пайплайн: от загрузок до числа GPU. `gpuFactor` — секунд GPU на секунду
   * видео: детектор смотрит не каждый кадр, и 0,2 — это минута на
   * пятиминутный ролик. Ожидание в очереди — вход, а не результат: закон
   * Литтла переводит его в видео, а обещание про него даёт NFR-4.
   */
  'calc-pipeline': {
    widget: 'clips-calculator',
    wide: false,
    data: {
      model: 'pipeline',
      inputs: [
        uploadsPerDay,
        videoMinutes,
        { key: 'gpuFactor', min: 0.05, max: 5, scale: 'log', value: 0.2 },
        peakFactor,
        { key: 'queueMinutes', min: 1, max: 600, scale: 'log', value: 5 },
      ],
    },
  },

  /**
   * Хранилище: клип — таймкоды, поэтому хранится оригинал целиком и живёт,
   * пока живёт видео. Битрейт телефона — 10 Мбит/с. Рядом альтернатива:
   * нарезать клипы в отдельные файлы в битрейте раздачи и хранить только
   * их — разница в десятки раз, и это цена решения. Горячий класс — первые
   * тридцать дней, дальше видео уходит в класс с редким доступом.
   */
  'calc-storage': {
    widget: 'clips-calculator',
    wide: false,
    data: {
      model: 'storage',
      inputs: [
        uploadsPerDay,
        videoMinutes,
        { key: 'mbps', min: 1, max: 100, scale: 'log', value: 10 },
        { key: 'pandaShare', min: 1, max: 100, value: 20 },
        clipSeconds,
        { key: 'clipMbps', min: 0.5, max: 20, scale: 'log', value: 3 },
        { key: 'hotDays', min: 0, max: 365, value: 30 },
      ],
    },
  },

  /**
   * Раздача: сто просмотров на загруженное видео, каждый пятый зритель
   * ищет. Байты идут с CDN в битрейте оригинала — клип не перекодирован, —
   * и ползунок битрейта показывает, что сэкономила бы разовая
   * перекодировка при загрузке.
   */
  'calc-delivery': {
    widget: 'clips-calculator',
    wide: false,
    data: {
      model: 'delivery',
      inputs: [
        uploadsPerDay,
        { key: 'clipsPerVideo', min: 1, max: 30, value: 3 },
        { key: 'watchRatio', min: 1, max: 10_000, scale: 'log', value: 100 },
        clipSeconds,
        { key: 'playMbps', min: 0.5, max: 50, scale: 'log', value: 10 },
        peakFactor,
        { key: 'searchesPerView', min: 0.05, max: 1, step: 0.05, value: 0.2 },
      ],
    },
  },

  /**
   * Таблица или брокер: матрица под наши требования. Оценки — часть
   * конструкции, пояснения в ячейках — проза локали.
   */
  'queue-choice': {
    widget: 'broker-matrix',
    wide: true,
    data: {
      choice: 'table',
      brokers: [
        { key: 'table', name: 'Postgres table' },
        { key: 'rabbitmq', name: 'RabbitMQ' },
        { key: 'kafka', name: 'Kafka' },
        { key: 'sqs', name: 'SQS' },
      ],
      rows: [
        { key: 'flow', req: 'NFR-9', scores: { table: 'yes', rabbitmq: 'yes', kafka: 'yes', sqs: 'yes' } },
        { key: 'long', req: 'NFR-3', scores: { table: 'yes', rabbitmq: 'partial', kafka: 'no', sqs: 'partial' } },
        { key: 'atomic', req: 'NFR-3', scores: { table: 'yes', rabbitmq: 'no', kafka: 'no', sqs: 'no' } },
        { key: 'retry', req: 'NFR-11', scores: { table: 'yes', rabbitmq: 'partial', kafka: 'no', sqs: 'yes' } },
        { key: 'fair', req: 'NFR-7', scores: { table: 'yes', rabbitmq: 'partial', kafka: 'no', sqs: 'no' } },
        { key: 'visible', req: 'NFR-14', scores: { table: 'yes', rabbitmq: 'partial', kafka: 'partial', sqs: 'partial' } },
        { key: 'ops', scores: { table: 'yes', rabbitmq: 'partial', kafka: 'no', sqs: 'yes' } },
        { key: 'growth', scores: { table: 'partial', rabbitmq: 'yes', kafka: 'yes', sqs: 'yes' } },
      ],
    },
  },

  /**
   * ER-схема: видео, клипы, теги. Кадром шага во всю ширину — таблицам
   * нужна она вся. Строка videos — она же задача обработки; строка clips —
   * таймкоды, а не файл.
   */
  data: {
    widget: 'er-diagram',
    wide: true,
    data: {
      tables: [
        {
          name: 'videos',
          position: { x: 0, y: 0 },
          columns: [
            { name: 'id', type: 'uuid', keys: ['pk'] },
            { name: 'owner_id', type: 'uuid' },
            { name: 'status', type: 'text' },
            { name: 'video_key', type: 'text' },
            { name: 'duration_s', type: 'int' },
            { name: 'attempt', type: 'int' },
            { name: 'lease_until', type: 'timestamptz' },
            { name: 'next_run_at', type: 'timestamptz' },
            { name: 'error', type: 'text' },
            { name: 'created_at', type: 'timestamptz' },
          ],
        },
        {
          name: 'clips',
          position: { x: 380, y: 0 },
          columns: [
            { name: 'id', type: 'uuid', keys: ['pk'] },
            { name: 'video_id', type: 'uuid', keys: ['fk'] },
            { name: 'start_ms', type: 'int' },
            { name: 'end_ms', type: 'int' },
            { name: 'score', type: 'real' },
            { name: 'thumb_key', type: 'text' },
            { name: 'title', type: 'text' },
            { name: 'description', type: 'text' },
            { name: 'tags', type: 'text[]' },
            { name: 'created_at', type: 'timestamptz' },
          ],
        },
        {
          name: 'tags',
          position: { x: 760, y: 0 },
          columns: [
            { name: 'id', type: 'bigint', keys: ['pk'] },
            { name: 'name', type: 'text' },
          ],
        },
        {
          name: 'clip_tags',
          position: { x: 760, y: 140 },
          columns: [
            { name: 'clip_id', type: 'uuid', keys: ['pk', 'fk'] },
            { name: 'tag_id', type: 'bigint', keys: ['pk', 'fk'] },
            { name: 'user_id', type: 'uuid' },
            { name: 'created_at', type: 'timestamptz' },
          ],
        },
      ],
      relations: [
        { parent: 'videos', parentColumn: 'id', child: 'clips', childColumn: 'video_id' },
        { parent: 'clips', parentColumn: 'id', child: 'clip_tags', childColumn: 'clip_id' },
        { parent: 'tags', parentColumn: 'id', child: 'clip_tags', childColumn: 'tag_id' },
      ],
    },
  },

  /**
   * Жизненный цикл видео — стейт-машина. Цвет перехода — кто его делает:
   * отсюда видно, что в `failed` видео переводит поллер по аренде и
   * попыткам, а не детектор.
   */
  lifecycle: {
    widget: 'job-lifecycle',
    data: {
      initial: 'processing',
      states: [
        { key: 'start', x: -90, y: 128, start: true },
        { key: 'uploading', x: 60, y: 110 },
        { key: 'uploaded', x: 290, y: 110 },
        { key: 'processing', x: 520, y: 110 },
        { key: 'ready', x: 760, y: 30, terminal: true },
        { key: 'empty', x: 760, y: 190, terminal: true },
        { key: 'failed', x: 520, y: 290, terminal: true },
      ],
      transitions: [
        { id: 'create', from: 'start', to: 'uploading', actor: 'client', out: 'right', in: 'left' },
        { id: 'complete', from: 'uploading', to: 'uploaded', actor: 'command', out: 'right', in: 'left' },
        { id: 'take', from: 'uploaded', to: 'processing', actor: 'worker', out: 'right', in: 'left' },
        { id: 'done', from: 'processing', to: 'ready', actor: 'worker', out: 'right', in: 'left' },
        { id: 'none', from: 'processing', to: 'empty', actor: 'worker', out: 'right', in: 'left' },
        { id: 'retry', from: 'processing', to: 'uploaded', actor: 'scheduler', out: 'top', in: 'top' },
        { id: 'exhausted', from: 'processing', to: 'failed', actor: 'scheduler', out: 'bottom', in: 'top' },
        { id: 'abandoned', from: 'uploading', to: 'failed', actor: 'scheduler', out: 'bottom', in: 'left' },
      ],
    },
  },

  /**
   * Шумный сосед на GPU-пуле. Зоопарк выкладывает архив залпом в четыреста
   * роликов, турист и школьная экскурсия — по одному. Восемь GPU по четыре
   * секунды — два видео в секунду; залп при общей очереди занимает пул на
   * три минуты, и всё это время остальные стоят за ним.
   */
  fairness: {
    widget: 'noisy-neighbour',
    wide: false,
    data: {
      tenants: [
        { key: 'tourist', rate: 0.5, burst: 0, weight: 1 },
        { key: 'school', rate: 0.5, burst: 0, weight: 1 },
        { key: 'zoo', rate: 1, burst: 400, weight: 3 },
      ],
      workers: 8,
      jobSeconds: 4,
      policies: ['fifo', 'fair', 'weighted'],
    },
  },

  /**
   * Итог: решения разбора против требований. Каждая строка таблицы закрыта
   * хотя бы одной карточкой — это проверяет check-steps.
   */
  answer: {
    widget: 'requirement-match',
    wide: true,
    data: {
      requirements,
      cards: [
        { key: 'directUpload', fits: ['FR-1', 'NFR-2'] },
        { key: 'completeKey', fits: ['NFR-8'] },
        { key: 'taskRow', fits: ['NFR-1', 'NFR-3'] },
        { key: 'lease', fits: ['NFR-3', 'NFR-11'] },
        { key: 'gpuPool', fits: ['NFR-4', 'NFR-9'] },
        { key: 'fairPoll', fits: ['NFR-7'] },
        { key: 'keepOriginal', fits: ['NFR-10'] },
        { key: 'cdn', fits: ['FR-4', 'NFR-5', 'NFR-12'] },
        { key: 'gin', fits: ['FR-6', 'NFR-6'] },
        { key: 'status', fits: ['FR-2', 'FR-3', 'NFR-14'] },
        { key: 'tagging', fits: ['FR-5'] },
        { key: 'shareLink', fits: ['FR-7'] },
        { key: 'deleteClip', fits: ['FR-8', 'NFR-13'] },
        { key: 'threshold', fits: ['NFR-13'] },
      ],
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

  // Расчёты: GPU, байты на диске, байты в раздаче. Без них «нужна ли
  // очередь» и «резать ли клипы в файлы» решаются на вкус.
  { id: 'calc-pipeline' },
  { id: 'calc-storage' },
  { id: 'calc-delivery' },

  // Архитектура: сверху вниз по C4.
  { id: 'c1' },

  // C2 по кадру на шаг: вход и байты, очередь-таблица, пайплайн, аренда,
  // чтение, раздача — и всё вместе.
  { id: 'c2-upload' },
  { id: 'c2-queue' },
  // Сама таблица: колонки, которые делают из строки видео задачу, индекс по
  // голове очереди, взятие под аренду и возврат зависших.
  {
    id: 'queue-table',
    lang: 'sql',
    caption: 'videos.sql',
    code: `-- {{taskColumns}}
CREATE TABLE videos (
  id           uuid PRIMARY KEY,
  owner_id     uuid NOT NULL,
  status       text NOT NULL,  -- uploading | uploaded | processing | ready | empty | failed
  video_key    text NOT NULL,
  duration_s   int,
  attempt      int  NOT NULL DEFAULT 0,
  lease_until  timestamptz,
  next_run_at  timestamptz NOT NULL DEFAULT now(),
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- {{queueIndex}}
CREATE INDEX videos_queue ON videos (next_run_at)
  WHERE status = 'uploaded';

-- {{take}}
UPDATE videos
SET status = 'processing',
    lease_until = now() + interval '10 minutes'
WHERE id = (
  SELECT id FROM videos
  WHERE status = 'uploaded' AND next_run_at <= now()
  ORDER BY next_run_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING id, video_key, attempt;

-- {{sweep}}
UPDATE videos
SET status = 'uploaded',
    attempt = attempt + 1,
    next_run_at = now() + (interval '1 minute' * power(2, attempt)),
    lease_until = NULL
WHERE status = 'processing' AND lease_until < now();`,
  },
  { id: 'queue-choice' },
  { id: 'c2-pipeline' },
  { id: 'c2-lease' },
  { id: 'c2-read' },
  { id: 'c2-delivery' },
  { id: 'c2-full' },

  // Структура показана, дальше — порядок: запросы по шагам.
  { id: 'seq-upload' },
  { id: 'seq-watch' },

  // C3: внутри пайплайна. Потом данные, контракт и состояния.
  { id: 'c3-pipeline' },
  { id: 'data' },
  { id: 'api' },
  { id: 'lifecycle' },

  // Вызовы, ради которых задача и задана: нейронка ошибается, один
  // пользователь приходит с архивом, теги надо искать, байты стоят денег.
  { id: 'detection' },
  { id: 'fairness' },
  { id: 'search' },
  { id: 'retention' },
  { id: 'observability' },
  { id: 'tradeoffs' },
  { id: 'answer' },
];

export default deck;

/** Врезки внутри текста шага: колонка рядом у этих шагов занята таблицей. */
export const inlineWidgets: WidgetSpec = {
  /**
   * Контракт карточками: метод, путь, код ответа и поля. Байты видео в нём
   * нет: они идут в хранилище по ссылке из первого ответа, а клип в ответе —
   * адрес оригинала и два таймкода.
   */
  api: {
    widget: 'api-cards',
    data: {
      endpoints: [
        {
          key: 'start',
          method: 'POST',
          path: '/videos',
          status: 201,
          statusText: 'Created',
          request: ['Idempotency-Key', 'size', 'content_type'],
          response: ['id', 'status: uploading', 'upload.part_urls[]', 'upload.expires_at'],
        },
        {
          key: 'put',
          method: 'PUT',
          path: '{upload.part_url}',
          status: 200,
          statusText: 'OK',
          request: ['part bytes'],
          response: ['ETag'],
        },
        {
          key: 'complete',
          method: 'POST',
          path: '/videos/{id}/complete',
          status: 202,
          statusText: 'Accepted',
          request: ['parts[].etag'],
          response: ['status: uploaded', 'links.self'],
        },
        {
          key: 'video',
          method: 'GET',
          path: '/videos/{id}',
          status: 200,
          statusText: 'OK',
          response: ['status', 'stage', 'attempts', 'clips[]'],
        },
        {
          key: 'search',
          method: 'GET',
          path: '/clips?tag=&cursor=',
          status: 200,
          statusText: 'OK',
          response: ['items[]', 'next_cursor'],
        },
        {
          key: 'clip',
          method: 'GET',
          path: '/clips/{id}',
          status: 200,
          statusText: 'OK',
          response: ['title', 'description', 'tags[]', 'video_url', 'start_ms', 'end_ms', 'thumbnail_url'],
        },
        {
          key: 'tag',
          method: 'POST',
          path: '/clips/{id}/tags',
          status: 201,
          statusText: 'Created',
          request: ['tag'],
          response: ['tags[]'],
        },
        {
          key: 'remove',
          method: 'DELETE',
          path: '/clips/{id}',
          status: 204,
          statusText: 'No Content',
        },
      ],
    },
  },
};

/**
 * Карта компетенций: для типа блока — из каких технологий выбирают, по каким
 * осям сравнивают и о чём спросить на углублении.
 *
 * Значения в таблице — короткий технический жаргон на английском: «at-least-once»
 * и «per partition» так и произносят на собеседовании на любом языке. Проза —
 * когда брать и когда нет — переведена.
 *
 * Цифры — порядки на момент написания, а не SLA: карта задаёт вопрос, а не
 * отвечает на него за кандидата.
 */

type Text = { en: string; ru: string };

export interface TechOption {
  id: string;
  name: string;
  values: Record<string, string>;
  pick: Text;
  avoid: Text;
}

export interface CompetencyGroup {
  id: string;
  dimensions: string[];
  options: TechOption[];
  probes: Text[];
}

const GROUPS: CompetencyGroup[] = [
  {
    id: 'messaging',
    dimensions: ['model', 'ordering', 'delivery', 'retention', 'replay', 'throughput', 'ops'],
    options: [
      {
        id: 'kafka',
        name: 'Kafka',
        values: {
          model: 'partitioned log',
          ordering: 'per partition',
          delivery: 'at-least-once; exactly-once with transactions',
          retention: 'by time/size, up to forever',
          replay: 'yes, seek offset',
          throughput: 'very high, 1M+ msg/s per cluster',
          ops: 'self-hosted or MSK / Confluent',
        },
        pick: {
          en: 'Event log several consumers read independently; replay; CDC; very high throughput.',
          ru: 'Лог событий, который читают несколько потребителей независимо; перечитывание; CDC; очень большой поток.',
        },
        avoid: {
          en: 'Per-message acks, delays and priorities; tiny load where a cluster is pure overhead.',
          ru: 'Нужны подтверждение каждого сообщения, отложенная доставка, приоритеты; нагрузка маленькая, и кластер — чистые издержки.',
        },
      },
      {
        id: 'sqs',
        name: 'SQS',
        values: {
          model: 'queue',
          ordering: 'none (Standard) / per group (FIFO)',
          delivery: 'at-least-once; FIFO dedups in a 5-min window',
          retention: 'up to 14 days',
          replay: 'no, consumed = gone',
          throughput: 'Standard ≈ unlimited; FIFO limited per group',
          ops: 'fully managed, AWS only',
        },
        pick: {
          en: 'Task queue for workers on AWS; visibility timeout and DLQ out of the box; zero ops.',
          ru: 'Очередь задач для воркеров на AWS; visibility timeout и DLQ из коробки; эксплуатации ноль.',
        },
        avoid: {
          en: 'Several independent readers of the same events, replay, or leaving AWS.',
          ru: 'Нужны несколько независимых читателей одних событий, перечитывание или жизнь вне AWS.',
        },
      },
      {
        id: 'rabbitmq',
        name: 'RabbitMQ',
        values: {
          model: 'broker: exchanges → queues',
          ordering: 'per queue, one consumer',
          delivery: 'at-least-once with acks',
          retention: 'until consumed (Streams: log)',
          replay: 'only with Streams',
          throughput: 'tens of thousands msg/s per queue',
          ops: 'self-hosted or managed',
        },
        pick: {
          en: 'Flexible routing (topic, headers), priorities, per-message TTL and delays.',
          ru: 'Гибкая маршрутизация (topic, headers), приоритеты, TTL и задержки на сообщение.',
        },
        avoid: {
          en: 'Long retention and replay; millions of messages per second.',
          ru: 'Нужны долгое хранение и перечитывание; миллионы сообщений в секунду.',
        },
      },
      {
        id: 'nats',
        name: 'NATS JetStream',
        values: {
          model: 'subjects + streams',
          ordering: 'per stream',
          delivery: 'at-least-once; dedup by msg id',
          retention: 'limits / interest / work-queue',
          replay: 'yes',
          throughput: 'high, low latency',
          ops: 'single binary, light',
        },
        pick: {
          en: 'Lightweight messaging for services and edge; request-reply and streams in one system.',
          ru: 'Лёгкий обмен сообщениями между сервисами и на edge; request-reply и стримы в одной системе.',
        },
        avoid: {
          en: 'You need the Kafka ecosystem: Connect, Streams, a mature CDC toolchain.',
          ru: 'Нужна экосистема Kafka: Connect, Streams, зрелый инструментарий CDC.',
        },
      },
    ],
    probes: [
      { en: 'The consumer crashes mid-processing. What happens to the message?', ru: 'Потребитель упал посреди обработки. Что будет с сообщением?' },
      { en: 'How do you keep order for one entity while adding consumers?', ru: 'Как сохранить порядок для одной сущности, добавляя потребителей?' },
      { en: 'A message fails every time. Where does it go (DLQ), who looks at it?', ru: 'Сообщение падает каждый раз. Куда оно уходит (DLQ), кто на него смотрит?' },
      { en: 'Delivery is at-least-once. What makes your handler safe to run twice?', ru: 'Доставка at-least-once. Что делает обработчик безопасным при повторе?' },
    ],
  },
  {
    id: 'sql',
    dimensions: ['writeScale', 'consistency', 'replication', 'features', 'ops'],
    options: [
      {
        id: 'postgres',
        name: 'PostgreSQL',
        values: {
          writeScale: 'one primary; shard via Citus or app',
          consistency: 'strong, up to serializable',
          replication: 'streaming, async or sync',
          features: 'JSONB, extensions, PostGIS, rich SQL',
          ops: 'self-hosted or managed (RDS, Cloud SQL)',
        },
        pick: {
          en: 'The default for transactional data: rich queries, constraints, one primary goes far.',
          ru: 'Выбор по умолчанию для транзакционных данных: богатые запросы, ограничения, один primary тянет далеко.',
        },
        avoid: {
          en: 'Write load that clearly outgrows one machine from day one.',
          ru: 'Нагрузка на запись с первого дня явно больше одной машины.',
        },
      },
      {
        id: 'mysql',
        name: 'MySQL',
        values: {
          writeScale: 'one primary; shard via Vitess',
          consistency: 'strong, repeatable read by default',
          replication: 'async / semi-sync, group replication',
          features: 'mature, simpler SQL',
          ops: 'self-hosted or managed',
        },
        pick: {
          en: 'Team knows it; Vitess path for sharding at very large scale.',
          ru: 'Команда его знает; путь к шардированию через Vitess на очень большом масштабе.',
        },
        avoid: {
          en: 'You rely on advanced SQL, extensions or JSON-heavy queries.',
          ru: 'Нужны продвинутый SQL, расширения или много запросов по JSON.',
        },
      },
      {
        id: 'cockroach',
        name: 'CockroachDB / Spanner',
        values: {
          writeScale: 'horizontal, automatic ranges',
          consistency: 'serializable, distributed',
          replication: 'Raft / Paxos, multi-region',
          features: 'SQL, PG-compatible (Cockroach)',
          ops: 'managed or self-hosted cluster',
        },
        pick: {
          en: 'Writes beyond one node or multi-region with strong consistency.',
          ru: 'Запись больше одного узла или несколько регионов со строгой согласованностью.',
        },
        avoid: {
          en: 'Small load: you pay latency per write for consensus you do not need.',
          ru: 'Нагрузка маленькая: платите задержкой каждой записи за консенсус, который не нужен.',
        },
      },
    ],
    probes: [
      { en: 'Writes outgrow one primary. What is your next step?', ru: 'Запись перестала влезать в один primary. Какой следующий шаг?' },
      { en: 'You read from a replica right after a write. What does the user see?', ru: 'Читаете с реплики сразу после записи. Что увидит пользователь?' },
      { en: 'How do you add a column to a 1-billion-row table without downtime?', ru: 'Как добавить колонку в таблицу на миллиард строк без простоя?' },
    ],
  },
  {
    id: 'nosql',
    dimensions: ['dataModel', 'writeScale', 'consistency', 'queries', 'ops'],
    options: [
      {
        id: 'cassandra',
        name: 'Cassandra / Scylla',
        values: {
          dataModel: 'wide-column',
          writeScale: 'linear, leaderless',
          consistency: 'tunable per query (ONE…QUORUM…ALL)',
          queries: 'by partition key; table per query',
          ops: 'self-hosted, heavy',
        },
        pick: {
          en: 'Huge write volume, time-ordered data, multi-DC writes.',
          ru: 'Огромный поток записи, данные по времени, запись в нескольких ДЦ.',
        },
        avoid: {
          en: 'Ad-hoc queries, transactions across rows, a small team for ops.',
          ru: 'Произвольные запросы, транзакции между строками, маленькая команда эксплуатации.',
        },
      },
      {
        id: 'dynamodb',
        name: 'DynamoDB',
        values: {
          dataModel: 'key-value / document',
          writeScale: 'automatic by partition key',
          consistency: 'eventual or strong read per request',
          queries: 'by key + secondary indexes',
          ops: 'serverless, AWS only',
        },
        pick: {
          en: 'Known access patterns, spiky load, zero ops on AWS.',
          ru: 'Известные шаблоны доступа, всплески нагрузки, ноль эксплуатации на AWS.',
        },
        avoid: {
          en: 'Access patterns still unknown; analytics over the data.',
          ru: 'Шаблоны доступа ещё не известны; аналитика по данным.',
        },
      },
      {
        id: 'mongodb',
        name: 'MongoDB',
        values: {
          dataModel: 'document',
          writeScale: 'sharding by shard key',
          consistency: 'tunable read/write concern',
          queries: 'rich queries, aggregation, indexes',
          ops: 'self-hosted or Atlas',
        },
        pick: {
          en: 'Documents with varying shape and rich queries over them.',
          ru: 'Документы разной формы и богатые запросы по ним.',
        },
        avoid: {
          en: 'Heavily relational data with many joins.',
          ru: 'Сильно связанные данные с множеством join.',
        },
      },
    ],
    probes: [
      { en: 'Why this partition key? What would make one partition hot?', ru: 'Почему такой ключ партиции? Что сделает одну партицию горячей?' },
      { en: 'Name a query this model cannot answer without a new table or index.', ru: 'Назовите запрос, на который эта модель не ответит без новой таблицы или индекса.' },
      { en: 'Which consistency level do you use for this read, and why?', ru: 'Какой уровень согласованности у этого чтения и почему?' },
    ],
  },
  {
    id: 'cache',
    dimensions: ['structures', 'persistence', 'clustering', 'eviction', 'fits'],
    options: [
      {
        id: 'redis',
        name: 'Redis / Valkey',
        values: {
          structures: 'strings, hashes, sets, sorted sets, streams',
          persistence: 'optional: RDB / AOF',
          clustering: 'Cluster, hash slots',
          eviction: 'LRU / LFU / TTL',
          fits: 'cache, rate limits, leaderboards, sessions',
        },
        pick: {
          en: 'Cache plus data structures: counters, rate limits, sorted sets.',
          ru: 'Кэш плюс структуры данных: счётчики, лимиты, сортированные множества.',
        },
        avoid: {
          en: 'As the only durable copy of data you cannot lose.',
          ru: 'Как единственная копия данных, которые нельзя терять.',
        },
      },
      {
        id: 'memcached',
        name: 'Memcached',
        values: {
          structures: 'strings only',
          persistence: 'none',
          clustering: 'client-side sharding',
          eviction: 'LRU',
          fits: 'plain look-aside cache',
        },
        pick: {
          en: 'Simple, multithreaded look-aside cache of rendered objects.',
          ru: 'Простой многопоточный look-aside кэш готовых объектов.',
        },
        avoid: {
          en: 'You need anything beyond get/set.',
          ru: 'Нужно что-то кроме get/set.',
        },
      },
      {
        id: 'etcd',
        name: 'etcd / ZooKeeper',
        values: {
          structures: 'small key-value, watches',
          persistence: 'durable, Raft / ZAB',
          clustering: '3–5 nodes, no sharding',
          eviction: 'none (leases)',
          fits: 'config, leader election, locks',
        },
        pick: {
          en: 'Coordination: leader election, config, service discovery.',
          ru: 'Координация: выбор лидера, конфиг, обнаружение сервисов.',
        },
        avoid: {
          en: 'Data or cache: it is built for small, rarely changing keys.',
          ru: 'Данные или кэш: он для небольших и редко меняющихся ключей.',
        },
      },
    ],
    probes: [
      { en: 'How is the cache invalidated when the source changes?', ru: 'Как кэш инвалидируется, когда меняется источник?' },
      { en: 'A hot key expires and 10k requests hit the DB at once. What now?', ru: 'Горячий ключ истёк, и 10 тысяч запросов разом пошли в базу. Что делать?' },
      { en: 'The cache is down. Does the system survive the load on the DB?', ru: 'Кэш лёг. Переживёт ли система нагрузку на базу?' },
    ],
  },
  {
    id: 'object',
    dimensions: ['consistency', 'durability', 'tiers', 'ops'],
    options: [
      {
        id: 's3',
        name: 'S3',
        values: {
          consistency: 'strong read-after-write',
          durability: '11 nines',
          tiers: 'Standard, IA, Glacier',
          ops: 'managed, AWS',
        },
        pick: { en: 'Default for blobs on AWS; lifecycle rules; presigned URLs.', ru: 'Выбор по умолчанию для блобов на AWS; lifecycle-правила; presigned URL.' },
        avoid: { en: 'Many tiny writes per second to the same key.', ru: 'Много мелких записей в секунду в один и тот же ключ.' },
      },
      {
        id: 'gcs',
        name: 'GCS / Azure Blob',
        values: {
          consistency: 'strong',
          durability: '11+ nines',
          tiers: 'Standard, Nearline, Coldline, Archive',
          ops: 'managed',
        },
        pick: { en: 'Same role on GCP / Azure.', ru: 'Та же роль на GCP / Azure.' },
        avoid: { en: 'Multi-cloud without an abstraction layer.', ru: 'Мультиоблако без слоя абстракции.' },
      },
      {
        id: 'minio',
        name: 'MinIO / Ceph',
        values: {
          consistency: 'strong',
          durability: 'erasure coding, your disks',
          tiers: 'tiering to cloud',
          ops: 'self-hosted, S3 API',
        },
        pick: { en: 'On-prem or data residency with an S3-compatible API.', ru: 'Своё железо или требования к месту хранения, при S3-совместимом API.' },
        avoid: { en: 'No team to run storage: disks fail on your watch.', ru: 'Нет команды под хранилище: диски будут умирать на вашем дежурстве.' },
      },
    ],
    probes: [
      { en: 'How does a client upload a 5 GB file? (presigned URL, multipart)', ru: 'Как клиент загружает файл на 5 ГБ? (presigned URL, multipart)' },
      { en: 'When does old data move to a cheaper tier, and who deletes it?', ru: 'Когда старые данные уезжают в дешёвый класс и кто их удаляет?' },
    ],
  },
  {
    id: 'search',
    dimensions: ['scale', 'relevance', 'freshness', 'ops'],
    options: [
      {
        id: 'elastic',
        name: 'Elasticsearch / OpenSearch',
        values: {
          scale: 'horizontal, shards',
          relevance: 'BM25, aggregations, vectors',
          freshness: 'near real-time, ~1 s refresh',
          ops: 'heavy: JVM, shards, reindexing',
        },
        pick: { en: 'Full-text search and aggregations at scale; log search.', ru: 'Полнотекстовый поиск и агрегации на объёме; поиск по логам.' },
        avoid: { en: 'As the source of truth.', ru: 'Как источник правды.' },
      },
      {
        id: 'meili',
        name: 'Meilisearch / Typesense',
        values: {
          scale: 'mostly single node',
          relevance: 'typo tolerance out of the box',
          freshness: 'near real-time',
          ops: 'light',
        },
        pick: { en: 'Instant search for a catalog of up to tens of millions of documents.', ru: 'Мгновенный поиск по каталогу до десятков миллионов документов.' },
        avoid: { en: 'Analytics and very large indexes.', ru: 'Аналитика и очень большие индексы.' },
      },
      {
        id: 'pgfts',
        name: 'PostgreSQL FTS',
        values: {
          scale: 'inside the DB',
          relevance: 'basic ranking (ts_rank), trigram',
          freshness: 'immediate, transactional',
          ops: 'no extra system',
        },
        pick: { en: 'Search is secondary and data is already in Postgres.', ru: 'Поиск второстепенный, а данные уже в Postgres.' },
        avoid: { en: 'Relevance tuning is a product feature.', ru: 'Настройка релевантности — часть продукта.' },
      },
    ],
    probes: [
      { en: 'How does the index stay in sync with the database? (CDC, outbox)', ru: 'Как индекс остаётся в согласии с базой? (CDC, outbox)' },
      { en: 'How do you reindex with a new mapping without downtime?', ru: 'Как переиндексировать с новой схемой без простоя?' },
    ],
  },
  {
    id: 'tsdb',
    dimensions: ['model', 'scale', 'query', 'fits'],
    options: [
      {
        id: 'prometheus',
        name: 'Prometheus / Mimir',
        values: {
          model: 'pull, labeled metrics',
          scale: 'local weeks; long-term via Thanos / Mimir',
          query: 'PromQL',
          fits: 'ops metrics, alerting',
        },
        pick: { en: 'Service metrics and alerts.', ru: 'Метрики сервисов и алерты.' },
        avoid: { en: 'High-cardinality labels like user id.', ru: 'Метки с высокой кардинальностью вроде user id.' },
      },
      {
        id: 'clickhouse',
        name: 'ClickHouse',
        values: {
          model: 'columnar OLAP',
          scale: 'horizontal, petabytes',
          query: 'SQL',
          fits: 'events, logs, product analytics',
        },
        pick: { en: 'Analytics over billions of events with SQL.', ru: 'Аналитика по миллиардам событий на SQL.' },
        avoid: { en: 'Point updates and deletes; OLTP.', ru: 'Точечные обновления и удаления; OLTP.' },
      },
      {
        id: 'timescale',
        name: 'TimescaleDB',
        values: {
          model: 'Postgres + hypertables',
          scale: 'one node + replicas',
          query: 'SQL with joins',
          fits: 'metrics next to relational data',
        },
        pick: { en: 'Time series that must join with business tables.', ru: 'Временные ряды, которые надо соединять с бизнес-таблицами.' },
        avoid: { en: 'Petabyte scale.', ru: 'Петабайтный масштаб.' },
      },
    ],
    probes: [
      { en: 'What is the cardinality of your series, and what bounds it?', ru: 'Какая кардинальность рядов и что её ограничивает?' },
      { en: 'Retention and downsampling: raw for how long, aggregates for how long?', ru: 'Ретеншн и прореживание: сколько хранить сырое, сколько агрегаты?' },
    ],
  },
  {
    id: 'proxy',
    dimensions: ['layer', 'config', 'features', 'ops'],
    options: [
      {
        id: 'nginx',
        name: 'Nginx',
        values: {
          layer: 'L7 (+ L4 stream)',
          config: 'files, reload',
          features: 'static, caching, rate limit',
          ops: 'ubiquitous, simple',
        },
        pick: { en: 'Edge proxy, static files, simple routing.', ru: 'Прокси на входе, статика, простая маршрутизация.' },
        avoid: { en: 'Dynamic service discovery at high churn.', ru: 'Динамическое обнаружение сервисов при частой смене инстансов.' },
      },
      {
        id: 'envoy',
        name: 'Envoy',
        values: {
          layer: 'L4 / L7',
          config: 'dynamic, xDS API',
          features: 'gRPC, retries, circuit breaking, tracing',
          ops: 'complex; base of meshes',
        },
        pick: { en: 'Service mesh, gRPC, rich resilience and telemetry.', ru: 'Service mesh, gRPC, развитая отказоустойчивость и телеметрия.' },
        avoid: { en: 'A small system where its config is the hardest part.', ru: 'Небольшая система, где его конфиг — самое сложное.' },
      },
      {
        id: 'haproxy',
        name: 'HAProxy',
        values: {
          layer: 'L4 / L7',
          config: 'file + runtime API',
          features: 'fast, health checks, stick tables',
          ops: 'lean',
        },
        pick: { en: 'High-performance load balancing with precise control.', ru: 'Производительная балансировка с точным контролем.' },
        avoid: { en: 'You want a managed service.', ru: 'Хочется управляемый сервис.' },
      },
      {
        id: 'cloudlb',
        name: 'Cloud LB (ALB / GCLB)',
        values: {
          layer: 'L7 (NLB: L4)',
          config: 'managed API',
          features: 'TLS, host/path routing, autoscaling',
          ops: 'zero, pay per use',
        },
        pick: { en: 'Default in the cloud: nothing to run.', ru: 'Выбор по умолчанию в облаке: нечего эксплуатировать.' },
        avoid: { en: 'Custom logic at the edge or cost at huge traffic.', ru: 'Своя логика на входе или стоимость на огромном трафике.' },
      },
    ],
    probes: [
      { en: 'An instance hangs but accepts TCP. How does the balancer notice?', ru: 'Инстанс завис, но принимает TCP. Как балансировщик это заметит?' },
      { en: 'Do you need sticky sessions? What breaks without them?', ru: 'Нужны ли sticky sessions? Что сломается без них?' },
      { en: 'Where is TLS terminated, and is traffic encrypted behind it?', ru: 'Где терминируется TLS и шифруется ли трафик за ним?' },
    ],
  },
];

/** Какой группе принадлежит тип блока. */
const GROUP_BY_KIND: Record<string, string> = {
  queue: 'messaging',
  stream: 'messaging',
  pubsub: 'messaging',
  sql: 'sql',
  nosql: 'nosql',
  kv: 'cache',
  cache: 'cache',
  object: 'object',
  search: 'search',
  tsdb: 'tsdb',
  lb: 'proxy',
  gateway: 'proxy',
};

const BY_ID = new Map(GROUPS.map((group) => [group.id, group]));

export function competencyFor(kind: string): CompetencyGroup | undefined {
  const id = GROUP_BY_KIND[kind];
  return id ? BY_ID.get(id) : undefined;
}

export function techName(kind: string, tech?: string): string | undefined {
  return tech ? competencyFor(kind)?.options.find((option) => option.id === tech)?.name : undefined;
}

export function localized(text: Text, lang: string): string {
  return lang === 'ru' ? text.ru : text.en;
}

/**
 * Интерактивные врезки разбора: калькулятор, сортировка, симулятор.
 *
 * Разбор системного дизайна отличается от разбора паттерна тем, что в нём есть
 * числа и решения, а не только код. Прочитать «поток умножаем на длительность и
 * получаем одновременность» — не то же самое, что подвинуть длительность с двух
 * секунд до тридцати и увидеть, как четыре воркера превращаются в шестьдесят.
 *
 * Устроено как всё общее в проекте: структура — здесь (она одинакова во всех
 * локалях), проза — в `labels` локализованного урока. Ключи, которые виджет
 * требует, перечисляет `widgetLabelKeys`; что они есть в каждой локали,
 * проверяет scripts/check-steps.mjs — ровно как с комментариями к коду.
 */

export type WidgetName =
  | 'load-calculator'
  | 'littles-law'
  | 'requirement-sort'
  | 'noisy-neighbour'
  | 'requirements'
  | 'transaction-flow'
  | 'job-lifecycle'
  | 'requirement-match'
  | 'broker-matrix'
  | 'api-cards';

/** Один ползунок калькулятора. Диапазон и шаг — часть конструкции, не перевод. */
export type LoadInput = {
  key: string;
  min: number;
  max: number;
  /**
   * Шаг ползунка. У величин, растущих на порядки (пользователи, размер
   * результата), шаг линейным быть не может: 1000 из миллиона неразличимы, а
   * сотня из тысячи решает всё. Такие идут по логарифму.
   */
  scale?: 'linear' | 'log';
  step?: number;
  value: number;
};

export type LoadCalculatorData = {
  inputs: LoadInput[];
  /**
   * Границы вердикта: до `single` хватает одной машины, до `pool` — пула,
   * дальше разговор про шардирование. В джобах в секунду на пике.
   */
  verdict: { single: number; pool: number };
};

/** Утверждение, которое читатель раскладывает по корзинам. */
export type SortItem = {
  key: string;
  /** Ключ корзины, в которую утверждение относится на самом деле. */
  bin: string;
};

export type RequirementSortData = {
  bins: string[];
  items: SortItem[];
};

export type NoisyTenant = {
  key: string;
  /** Сколько джоб приходит в секунду в спокойном режиме. */
  rate: number;
  /** Разовый залп: столько джоб приходит одним куском в начале. */
  burst: number;
  /** Вес в режиме взвешенной очереди. */
  weight: number;
  /** Приоритет джоб арендатора — только в режиме приоритетов; читатель его меняет. */
  priority?: Priority;
};

export type Priority = 'high' | 'normal' | 'low';

/** Порядок приоритетов: от срочного к тому, что подождёт. */
export const PRIORITIES: Priority[] = ['high', 'normal', 'low'];

export type NoisyNeighbourData = {
  tenants: NoisyTenant[];
  /** Сколько джоб пул выполняет одновременно. */
  workers: number;
  /** Сколько секунд занимает одна джоба. */
  jobSeconds: number;
  policies: string[];
  /**
   * Режим приоритетов: джоба идёт в очередь своего приоритета, а политики —
   * `strict` (сначала high, пока она не пуста) и `weights` (доли очередей по
   * весам). Внутри одного приоритета арендаторы делят пул поровну.
   */
  priorities?: { weights: Record<Priority, number> };
};

/**
 * Строка документа требований.
 *
 * Документ растёт по ходу разбора: строка появляется на шаге `step`, а число
 * к ней — цель — может прийти позже, на шаге `goal`. «Приём отвечает быстро»
 * записывают вместе с остальными свойствами, а «за 200 мс» — только когда
 * дошли до SLO.
 */
export type RequirementRow = {
  id: string;
  kind: 'fr' | 'nfr';
  step: string;
  goal?: string;
};

export type RequirementsData = {
  /** Имя документа: по нему общее состояние всех врезок страницы. */
  name: string;
  rows: RequirementRow[];
};

/**
 * Транзакция командного сервиса изнутри: сценарии, между которыми
 * переключается читатель. Ключ сценария — идентификатор, его текст живёт в
 * `labels` урока.
 */
export type TransactionFlowData = {
  scenarios: ('ok' | 'crash' | 'redeliver')[];
};

/**
 * Стейт-машина джобы. Состояния — идентификаторы из API (`queued`, `running`),
 * они не переводятся; описания и подписи переходов живут в `labels`.
 *
 * Позиция состояния — часть конструкции, как диапазон ползунка: раскладка
 * одинакова во всех локалях. Стороны `out`/`in` — откуда выходит и куда входит
 * линия: обратный переход `running → queued` идёт поверху, иначе он лёг бы
 * на прямой.
 */
export type LifecycleSide = 'top' | 'right' | 'bottom' | 'left';

export type LifecycleState = {
  key: string;
  x: number;
  y: number;
  /** Конечное состояние: из него переходов нет. */
  terminal?: boolean;
  /** Точка входа — не состояние, а начало линии. */
  start?: boolean;
};

export type LifecycleTransition = {
  id: string;
  from: string;
  to: string;
  /** Кто переводит: от этого цвет линии. */
  actor: 'client' | 'command' | 'worker' | 'scheduler';
  out: LifecycleSide;
  in: LifecycleSide;
};

export type JobLifecycleData = {
  states: LifecycleState[];
  transitions: LifecycleTransition[];
  /** Какое состояние раскрыто сразу. */
  initial: string;
};

/**
 * Итог разбора: решения против требований.
 *
 * Карточка — решение из разбора, `fits` — какие строки таблицы оно закрывает.
 * Строк у карточки может быть несколько: outbox отвечает и за «не теряется»,
 * и за то, что приём не ждёт шину. Строки берутся из документа требований,
 * тексты у них те же, что в таблице по ходу разбора.
 */
export type MatchCard = { key: string; fits: string[] };

export type RequirementMatchData = {
  requirements: RequirementsData;
  cards: MatchCard[];
};

/**
 * Матрица сравнения брокеров. Строка — критерий, привязанный к требованию из
 * документа; ячейка — оценка и короткое пояснение в `labels`. Названия
 * брокеров — имена продуктов, они не переводятся.
 */
export type BrokerScore = 'yes' | 'partial' | 'no';

export type BrokerMatrixData = {
  brokers: { key: string; name: string }[];
  rows: { key: string; req?: string; scores: Record<string, BrokerScore> }[];
  /** Что выбрали: колонка подсвечена. */
  choice: string;
};

/**
 * Карточки HTTP-контракта. Метод, путь, код и поля — идентификаторы протокола,
 * они не переводятся; описание карточки живёт в `labels` (`api.<key>`).
 * `outbound` — запрос идёт от нас к клиенту: вебхук.
 */
export type ApiEndpoint = {
  key: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  status: number;
  statusText: string;
  request?: string[];
  response?: string[];
  outbound?: boolean;
};

export type ApiCardsData = { endpoints: ApiEndpoint[] };

export type WidgetStep =
  | { widget: 'load-calculator'; wide?: boolean; data: LoadCalculatorData }
  | { widget: 'littles-law'; wide?: boolean; data: LittlesLawData }
  | { widget: 'requirement-sort'; wide?: boolean; data: RequirementSortData }
  | { widget: 'noisy-neighbour'; wide?: boolean; data: NoisyNeighbourData }
  | { widget: 'requirements'; wide?: boolean; data: RequirementsData }
  | { widget: 'transaction-flow'; wide?: boolean; data: TransactionFlowData }
  | { widget: 'job-lifecycle'; wide?: boolean; data: JobLifecycleData }
  | { widget: 'requirement-match'; wide?: boolean; data: RequirementMatchData }
  | { widget: 'broker-matrix'; wide?: boolean; data: BrokerMatrixData }
  | { widget: 'api-cards'; wide?: boolean; data: ApiCardsData };

/** Шаг разбора → врезка, которая на нём стоит. */
export type WidgetSpec = Record<string, WidgetStep>;

/**
 * Калькулятор закона Литтла: те же ползунки, что у калькулятора нагрузки, но
 * без предметной области. Формула одна на всё — очередь, пул, зал ожидания, —
 * и урок про неё показывает её саму, а не частный случай со скрейпингом.
 */
export type LittlesLawData = { inputs: LoadInput[] };

/**
 * Итоги закона. Порядок задаёт порядок в таблице и заодно порядок разбора:
 * сначала сколько всего внутри, потом из чего это число состоит.
 */
export const LAW_OUTPUTS = [
  'inSystem',
  'inService',
  'waiting',
  'waitSeconds',
  'servers',
] as const;

/** Итоги калькулятора: порядок здесь же задаёт порядок в таблице. */
export const LOAD_OUTPUTS = [
  'perDay',
  'average',
  'peak',
  // Чтение идёт сразу за записью: на одну принятую джобу приходится несколько
  // запросов статуса, и порядок этих двух чисел — главное, что калькулятор
  // должен показать рядом.
  'readAverage',
  'readPeak',
  'inFlight',
  'workers',
  'backlog',
  'perDayBytes',
  'stored',
] as const;

/**
 * Какие ключи `labels` обязана дать локаль.
 *
 * Собирается из данных, а не пишется списком: список рядом с данными
 * расходится с ними на второй правке.
 */
export function widgetLabelKeys(step: WidgetStep): string[] {
  switch (step.widget) {
    case 'load-calculator':
      return [
        'calc.inputs',
        'calc.result',
        'calc.law',
        'calc.reads',
        'calc.verdict.single',
        'calc.verdict.pool',
        'calc.verdict.shard',
        ...step.data.inputs.flatMap((input) => [`calc.${input.key}`, `calc.${input.key}.unit`]),
        ...LOAD_OUTPUTS.flatMap((key) => [`calc.out.${key}`, `calc.out.${key}.unit`]),
      ];
    case 'littles-law':
      return [
        'law.inputs',
        'law.result',
        'law.formula',
        'law.split',
        'law.verdict.impossible',
        'law.verdict.smooth',
        'law.verdict.queue',
        'law.verdict.balanced',
        ...step.data.inputs.flatMap((input) => [`law.${input.key}`, `law.${input.key}.unit`]),
        ...LAW_OUTPUTS.flatMap((key) => [`law.out.${key}`, `law.out.${key}.unit`]),
      ];
    case 'requirement-sort':
      return [
        'sort.prompt',
        'sort.check',
        'sort.again',
        'sort.score',
        'sort.right',
        'sort.wrong',
        'sort.progress',
        ...step.data.bins.map((bin) => `sort.bin.${bin}`),
        ...step.data.items.flatMap((item) => [`sort.item.${item.key}`, `sort.why.${item.key}`]),
      ];
    case 'noisy-neighbour':
      return [
        'noisy.policy',
        'noisy.start',
        'noisy.pause',
        'noisy.reset',
        'noisy.burst',
        'noisy.time',
        'noisy.waiting',
        'noisy.done',
        'noisy.wait',
        'noisy.queue',
        'noisy.workers',
        'noisy.seconds',
        'noisy.slots',
        'noisy.gap',
        'noisy.starved',
        'noisy.even',
        'noisy.idle',
        ...step.data.policies.map((policy) => `noisy.policy.${policy}`),
        ...(step.data.priorities ? ['noisy.priority'] : []),
        ...step.data.tenants.map((tenant) => `noisy.tenant.${tenant.key}`),
      ];
    case 'transaction-flow':
      return [
        'tx.scenario',
        'tx.group',
        'tx.cycle',
        'tx.afterCommit',
        'tx.jobs',
        'tx.published',
        'tx.mq',
        'tx.sent',
        'tx.unsent',
        ...step.data.scenarios.flatMap((key) => [`tx.scenario.${key}`, `tx.verdict.${key}`]),
      ];
    case 'api-cards':
      return [
        'api.request',
        'api.response',
        ...(step.data.endpoints.some((item) => item.outbound) ? ['api.outbound'] : []),
        ...step.data.endpoints.map((item) => `api.${item.key}`),
      ];
    case 'broker-matrix':
      return [
        'bm.criterion',
        'bm.choice',
        'bm.score.yes',
        'bm.score.partial',
        'bm.score.no',
        'bm.total',
        ...step.data.rows.flatMap((row) => [
          `bm.row.${row.key}`,
          ...step.data.brokers.map((broker) => `bm.cell.${row.key}.${broker.key}`),
        ]),
      ];
    case 'requirement-match':
      return [
        'match.cards',
        'match.hint',
        'match.progress',
        'match.done',
        'match.wrong',
        'match.miss',
        'match.goesTo',
        'match.right',
        'match.reset',
        'match.open',
        'req.fr',
        'req.nfr',
        ...step.data.requirements.rows.map((row) => `req.text.${row.id}`),
        ...step.data.cards.flatMap((card) => [
          `match.card.${card.key}`,
          `match.card.${card.key}.text`,
          `match.why.${card.key}`,
        ]),
      ];
    case 'job-lifecycle':
      return [
        'lc.hint',
        'lc.out',
        'lc.terminal',
        'lc.actors',
        ...[...new Set(step.data.transitions.map((tr) => tr.actor))].map((a) => `lc.actor.${a}`),
        ...step.data.states.filter((st) => !st.start).map((st) => `lc.state.${st.key}`),
        ...step.data.transitions.map((tr) => `lc.tr.${tr.id}`),
      ];
    case 'requirements':
      return [
        'req.fr',
        'req.nfr',
        'req.col.text.fr',
        'req.col.note.fr',
        'req.col.text.nfr',
        'req.col.note.nfr',
        'req.col.goal',
        'req.drop',
        'req.chips',
        'req.addAll',
        'req.placed',
        'req.goal',
        'req.empty',
        'req.reset',
        ...step.data.rows.flatMap((row) => [
          `req.text.${row.id}`,
          `req.note.${row.id}`,
          ...(row.goal ? [`req.goal.${row.id}`] : []),
        ]),
      ];
  }
}

/**
 * Что шаг приносит в документ: новые строки и цели к уже записанным.
 *
 * Ключ `row:ID` — строка, `goal:ID` — её цель. Строка, у которой цель
 * появляется на том же шаге, приносит обе сразу: читателю это одна карточка.
 */
export function requirementsAt(data: RequirementsData, step: string) {
  return data.rows.flatMap((row) => {
    const keys: { row: RequirementRow; keys: string[]; goalOnly: boolean }[] = [];
    if (row.step === step) {
      keys.push({
        row,
        keys: row.goal === step ? [`row:${row.id}`, `goal:${row.id}`] : [`row:${row.id}`],
        goalOnly: false,
      });
    } else if (row.goal === step) {
      // Цель без строки не бывает: если строку читатель пропустил, она
      // приходит вместе со своей целью.
      keys.push({ row, keys: [`row:${row.id}`, `goal:${row.id}`], goalOnly: true });
    }
    return keys;
  });
}

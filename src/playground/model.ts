/**
 * Модель проекта в песочнице системного дизайна.
 *
 * Модуль намеренно ничего не знает ни об Astro, ни о React, ни о том, где
 * лежат данные: это тот же JSON, который потом поедет на бэкенд. Поэтому
 * формат версионирован с первого дня — `migrate` поднимает любой старый
 * документ до текущей версии, а не падает на нём.
 */

export const SCHEMA_VERSION = 1;

export type BlockKind = string;

export interface DesignNode {
  id: string;
  kind: BlockKind;
  label: string;
  note: string;
  /** Выбранная технология из карты компетенций: kafka, postgres… */
  tech?: string;
  x: number;
  y: number;
}

/** Синхронный вызов ждёт ответа, асинхронный — оставляет сообщение и уходит. */
export type EdgeMode = 'sync' | 'async';

export interface DesignEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  mode: EdgeMode;
}

export type RequirementKind = 'fr' | 'nfr';

export const NFR_CATEGORIES = [
  'availability',
  'latency',
  'throughput',
  'durability',
  'consistency',
  'scalability',
  'security',
  'cost',
  'observability',
] as const;
export type NfrCategory = (typeof NFR_CATEGORIES)[number];

export interface Requirement {
  id: string;
  kind: RequirementKind;
  text: string;
  /** Только у НФТ: число, по которому видно, выполнено ли свойство. */
  target: string;
  category?: NfrCategory;
  /** Блоки схемы, которые это требование закрывают. */
  covers: string[];
}

/** Тип перетаскивания требования: номер бросают на блок, и блок его закрывает. */
export const REQ_DRAG = 'application/x-sysdesign-requirement';

/** Блок закрывает требование: добавить без дублей. */
export function coverRequirement(requirements: Requirement[], id: string, node: string): Requirement[] {
  return requirements.map((item) =>
    item.id === id && !item.covers.includes(node) ? { ...item, covers: [...item.covers, node] } : item,
  );
}

export interface CalcState {
  enabled: boolean;
  values: Record<string, number>;
}

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Маршрут HTTP-контракта — та же карточка, что во врезке разбора: метод,
 * путь, код, смысл и поля. Плюс то, чего во врезке нет: какой блок схемы его
 * обслуживает и какие FR он закрывает.
 */
export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  status: number;
  about: string;
  request: string[];
  response: string[];
  /** Исходящий вызов: мы зовём клиента (вебхук). */
  outbound: boolean;
  /** Блок схемы, который отвечает на маршрут. */
  service?: string;
  /** Номера FR, которые маршрут закрывает. */
  covers: string[];
}

/** Схема с требованиями: и ответ кандидата, и эталон автора устроены одинаково. */
export interface Board {
  nodes: DesignNode[];
  edges: DesignEdge[];
  requirements: Requirement[];
  api: Endpoint[];
}

export interface ScenarioItem {
  id: string;
  text: string;
}

/** Критерий оценки: вес — во сколько раз он важнее обычного. */
export interface Criterion extends ScenarioItem {
  weight: number;
}

/**
 * Сценарий собеседования — то, что готовит автор и не видит кандидат:
 * эталонное решение, подсказки по порядку, критерии и вопросы на углубление.
 */
export interface Scenario {
  reference: Board;
  hints: ScenarioItem[];
  rubric: Criterion[];
  questions: ScenarioItem[];
  /** Показывать ли кандидату проверки схемы: они подсказывают. */
  allowChecks: boolean;
  /** Заметки автора для интервьюера: на что смотреть, где обычно ошибаются. */
  guide: string;
}

/**
 * Сигнал честности: что кандидат делал с окном, пока решал задачу.
 *
 * Это не доказательство, а повод спросить: вкладку покидают и чтобы
 * посмотреть документацию, которую разрешили. Поэтому журнал показывается
 * интервьюеру как лента с фактами, а вывод остаётся за человеком.
 */
export type SignalType = 'away' | 'resize' | 'devtools' | 'copy' | 'cut' | 'paste';

export interface Signal {
  id: string;
  type: SignalType;
  at: string;
  /** away: куда ушёл — на другую вкладку или в другое окно (в том числе в devtools). */
  via?: 'tab' | 'window' | 'shortcut' | 'contextmenu' | 'size';
  /** away: когда вернулся. Пока не вернулся — пусто. */
  back?: string;
  /** resize: размеры окна до и после, [ширина, высота]. */
  from?: [number, number];
  to?: [number, number];
  /** copy / cut / paste: сам текст (обрезан) и его полная длина. */
  text?: string;
  length?: number;
  /** paste: в какое поле вставили. devtools: какое сочетание нажали. */
  field?: string;
}

/** Одно прохождение сценария: что открыто, что спрошено, как оценено. */
export interface Session {
  revealed: string[];
  asked: string[];
  /** Оценка по критерию: 0 — нет, 3 — отлично. */
  scores: Record<string, number>;
  notes: string;
  startedAt?: string;
  finishedAt?: string;
  /** Сигналы честности, пока на экране роль кандидата. */
  signals: Signal[];
}

/**
 * Проект. Верхние nodes/edges/requirements — рабочая доска кандидата:
 * так формат первой версии остаётся валидным без переноса полей.
 */
export interface Design extends Board {
  version: number;
  id: string;
  title: string;
  task: string;
  /** Кто поставил задачу — подпись карточки задания, как в разборе: «Product Owner». */
  taskSource: string;
  /** calc.enabled — разрешён ли калькулятор кандидату. Автор видит его всегда. */
  calc: CalcState;
  scenario: Scenario;
  session: Session;
  createdAt: string;
  updatedAt: string;
}

export function emptyBoard(): Board {
  return { nodes: [], edges: [], requirements: [], api: [] };
}

export function emptyScenario(): Scenario {
  return { reference: emptyBoard(), hints: [], rubric: [], questions: [], allowChecks: false, guide: '' };
}

export function emptySession(): Session {
  return { revealed: [], asked: [], scores: {}, notes: '', signals: [] };
}

/** То, что показывается в списке проектов без загрузки всего документа. */
export interface DesignSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export function uid(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}

export function emptyDesign(title: string): Design {
  const now = new Date().toISOString();
  return {
    version: SCHEMA_VERSION,
    id: uid('d'),
    title,
    task: '',
    taskSource: '',
    ...emptyBoard(),
    calc: { enabled: false, values: {} },
    scenario: emptyScenario(),
    session: emptySession(),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Следующий человекочитаемый номер: FR-3, NFR-7.
 *
 * Номер не переиспользуется после удаления — на требование уже могли
 * сослаться в обсуждении, и FR-2 не должен тихо стать другим требованием.
 */
export function nextRequirementId(design: Design, kind: RequirementKind): string {
  const prefix = kind === 'fr' ? 'FR' : 'NFR';
  const taken = design.requirements
    .filter((item) => item.kind === kind)
    .map((item) => Number(item.id.split('-')[1]) || 0);
  return `${prefix}-${Math.max(0, ...taken) + 1}`;
}

/**
 * Чужой или старый JSON → текущая версия.
 *
 * Сюда приходит и импорт файла, и то, что лежит в хранилище браузера с
 * прошлой версии песочницы. Недостающие поля добиваются значениями по
 * умолчанию, мусор отбрасывается — открыть проект лучше, чем показать ошибку.
 */
function migrateBoard(data: Partial<Board> | undefined): Board {
  return {
    nodes: Array.isArray(data?.nodes)
      ? data.nodes.map((node) => ({ ...node, note: node.note ?? '', label: node.label ?? '' }))
      : [],
    edges: Array.isArray(data?.edges)
      ? data.edges.map((edge) => ({ ...edge, label: edge.label ?? '', mode: edge.mode ?? 'sync' }))
      : [],
    requirements: Array.isArray(data?.requirements)
      ? data.requirements.map((item) => ({ ...item, target: item.target ?? '', covers: item.covers ?? [] }))
      : [],
    api: Array.isArray(data?.api)
      ? data.api.map((item) => ({
          ...item,
          about: item.about ?? '',
          request: item.request ?? [],
          response: item.response ?? [],
          outbound: Boolean(item.outbound),
          covers: item.covers ?? [],
        }))
      : [],
  };
}

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export function migrate(raw: unknown): Design {
  if (!raw || typeof raw !== 'object') throw new Error('not a design');
  const data = raw as Partial<Design>;
  const base = emptyDesign(typeof data.title === 'string' ? data.title : 'Untitled');
  const scenario: Partial<Scenario> = data.scenario ?? {};
  const session: Partial<Session> = data.session ?? {};
  return {
    ...base,
    id: typeof data.id === 'string' ? data.id : base.id,
    task: typeof data.task === 'string' ? data.task : '',
    taskSource: typeof data.taskSource === 'string' ? data.taskSource : '',
    ...migrateBoard(data),
    scenario: {
      reference: migrateBoard(scenario.reference),
      hints: list(scenario.hints),
      rubric: list<Criterion>(scenario.rubric).map((item) => ({ ...item, weight: item.weight ?? 1 })),
      questions: list(scenario.questions),
      allowChecks: Boolean(scenario.allowChecks),
      guide: typeof scenario.guide === 'string' ? scenario.guide : '',
    },
    session: {
      revealed: list(session.revealed),
      asked: list(session.asked),
      scores: { ...(session.scores ?? {}) },
      notes: typeof session.notes === 'string' ? session.notes : '',
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      signals: list(session.signals),
    },
    calc: {
      enabled: Boolean(data.calc?.enabled),
      values: { ...(data.calc?.values ?? {}) },
    },
    createdAt: data.createdAt ?? base.createdAt,
    updatedAt: data.updatedAt ?? base.updatedAt,
    version: SCHEMA_VERSION,
  };
}

/** Проверки схемы, которые видны без запуска: висящие блоки и непокрытые требования. */
export interface Finding {
  level: 'warn' | 'info';
  key: string;
  params?: Record<string, string>;
}

/**
 * Чем ответ расходится с эталоном по типам блоков: в эталоне есть кэш, у
 * кандидата нет. Сравниваются типы, а не блоки — названия у всех свои.
 */
export function compareToReference(answer: Board, reference: Board): Finding[] {
  if (!reference.nodes.length) return [];
  const count = (board: Board) => {
    const map = new Map<string, number>();
    for (const node of board.nodes) map.set(node.kind, (map.get(node.kind) ?? 0) + 1);
    return map;
  };
  const mine = count(answer);
  const ref = count(reference);
  const findings: Finding[] = [];
  for (const kind of ref.keys())
    if (!mine.has(kind)) findings.push({ level: 'warn', key: 'lint.refMissing', params: { kind } });
  for (const kind of mine.keys())
    if (!ref.has(kind)) findings.push({ level: 'info', key: 'lint.refExtra', params: { kind } });
  return findings;
}

/** Взвешенный итог по критериям, 0…100. Неоценённые критерии не тянут итог вниз. */
export function totalScore(rubric: Criterion[], scores: Record<string, number>): number | null {
  const rated = rubric.filter((item) => scores[item.id] !== undefined);
  if (!rated.length) return null;
  const weight = rated.reduce((sum, item) => sum + item.weight, 0);
  const got = rated.reduce((sum, item) => sum + item.weight * scores[item.id], 0);
  return Math.round((got / (weight * 3)) * 100);
}

export function lint(design: Board, spofKinds: ReadonlySet<string>): Finding[] {
  const findings: Finding[] = [];
  const linked = new Set(design.edges.flatMap((edge) => [edge.source, edge.target]));
  const byId = new Map(design.nodes.map((node) => [node.id, node]));

  for (const node of design.nodes) {
    if (design.nodes.length > 1 && !linked.has(node.id)) {
      findings.push({ level: 'warn', key: 'lint.orphan', params: { name: node.label } });
    }
  }

  for (const item of design.requirements) {
    if (!item.text.trim()) continue;
    if (!item.covers.some((id) => byId.has(id))) {
      findings.push({ level: 'info', key: 'lint.uncovered', params: { id: item.id } });
    }
    if (item.kind === 'nfr' && !item.target.trim()) {
      findings.push({ level: 'warn', key: 'lint.noTarget', params: { id: item.id } });
    }
  }

  /**
   * Единственный экземпляр хранилища, на который ходят несколько блоков, —
   * кандидат в единую точку отказа. Это подсказка, а не приговор: у
   * управляемой базы реплики могут быть внутри.
   */
  const incoming = new Map<string, number>();
  for (const edge of design.edges) incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  for (const node of design.nodes) {
    if (spofKinds.has(node.kind) && (incoming.get(node.id) ?? 0) >= 2) {
      const twins = design.nodes.filter((other) => other.kind === node.kind).length;
      if (twins === 1) findings.push({ level: 'info', key: 'lint.spof', params: { name: node.label } });
    }
  }

  /**
   * Функция, до которой не ведёт ни один маршрут, — обещание без входа.
   * Проверка включается с первым маршрутом: до этого API просто не начат.
   */
  if (design.api.length) {
    const served = new Set(design.api.flatMap((item) => item.covers));
    for (const item of design.requirements)
      if (item.kind === 'fr' && item.text.trim() && !served.has(item.id))
        findings.push({ level: 'info', key: 'lint.noRoute', params: { id: item.id } });
    for (const item of design.api)
      if (!item.outbound && !(item.service && byId.has(item.service)))
        findings.push({ level: 'info', key: 'lint.routeNoService', params: { route: `${item.method} ${item.path}` } });
  }

  if (!design.nodes.length) findings.push({ level: 'info', key: 'lint.empty' });
  return findings;
}

/**
 * Модель проекта в песочнице системного дизайна.
 *
 * Модуль намеренно ничего не знает ни об Astro, ни о React, ни о том, где
 * лежат данные: это тот же JSON, который потом поедет на бэкенд. Поэтому
 * формат версионирован с первого дня — `migrate` поднимает любой старый
 * документ до текущей версии, а не падает на нём.
 */

import type { DbTable } from './schema';
import type { Check } from './checks';

export const SCHEMA_VERSION = 1;

export type BlockKind = string;

export interface DesignNode {
  id: string;
  kind: BlockKind;
  label: string;
  note: string;
  /**
   * Подпись на схеме — строка под блоком: «шард по user_id», «только чтение».
   * Заметки длинные и для себя, подпись короткая и для того, кто смотрит схему.
   */
  caption?: string;
  /** Только у надписи: мелкий текст, обычный или заголовок. */
  textSize?: TextSize;
  /** Выбранная технология: id из каталога (kafka, postgres…) или своё название. */
  tech?: string;
  /**
   * Своя матрица выбора: какие технологии сравнивали и почему каждая подходит
   * или нет под требования проекта. Заполняет пользователь — готовых
   * значений нет: смысл в том, что обоснование даёт он, а не песочница.
   */
  matrix?: TechMatrix;
  /** Схема данных хранилища: таблицы, коллекции, ключи кэша, сообщения очереди. */
  schema?: DbTable[];
  /** Нарисовал интервьюер на доске кандидата в собеседовании, а не сам кандидат. */
  drawnBy?: 'interviewer';
  /** Был в исходной системе сценария: кандидат его получил, а не нарисовал. */
  given?: boolean;
  x: number;
  y: number;
}

/**
 * Надпись — не блок системы, а просто текст на полотне: заголовок зоны,
 * пояснение к куску схемы, вопрос самому себе. Лежит среди узлов, чтобы
 * двигаться, отменяться и ехать к собеседнику теми же путями, что и блоки,
 * но в проверках, связях и эталоне её нет. Текст — в `label`.
 */
export const TEXT_KIND = 'text';

export const TEXT_SIZES = ['s', 'm', 'l'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const isText = (node: { kind: string }) => node.kind === TEXT_KIND;

/** Блоки схемы без надписей: всё, что считают проверки, эталон и отчёт. */
export const blocksOf = <N extends { kind: string }>(nodes: N[]): N[] => nodes.filter((node) => !isText(node));

/** Оценка технологии под одно требование: подходит, частично или нет. */
export type MatrixScore = 'yes' | 'partial' | 'no';

export interface MatrixCell {
  score?: MatrixScore;
  /** Почему — своими словами. */
  note: string;
}

export interface TechMatrix {
  /** Сравниваемые технологии: названия, как их написал пользователь. */
  options: string[];
  /**
   * Строки матрицы — id требований, которые пользователь счёл важными для
   * этого выбора: не каждое ФТ/НФТ касается базы или очереди. Пока не задано —
   * берутся требования, которые закрывает сам блок.
   */
  rows?: string[];
  /**
   * Свои критерии — строки, которых нет в документе требований: «команда уже
   * это эксплуатирует», «есть управляемый сервис». Живут в самой матрице, а не
   * в требованиях: это довод в пользу технологии, а не обещание системы.
   */
  criteria?: MatrixCriterion[];
  /**
   * Строка → технология → оценка. Ключ строки — id требования или своего
   * критерия, ключ колонки — название технологии.
   */
  cells: Record<string, Record<string, MatrixCell>>;
}

/** Свой критерий сравнения: строка матрицы не из документа требований. */
export interface MatrixCriterion {
  id: string;
  text: string;
}

/**
 * Id своего критерия. Двоеточия в номерах требований не бывает (FR-1, NFR-2),
 * поэтому строка критерия в `cells` не пересечётся с требованием, даже если
 * его заведут позже.
 */
export const CRITERION_PREFIX = 'own:';

export const criterionId = () => `${CRITERION_PREFIX}${uid('c')}`;

/** Синхронный вызов ждёт ответа, асинхронный — оставляет сообщение и уходит. */
export type EdgeMode = 'sync' | 'async';

export interface DesignEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  mode: EdgeMode;
  /**
   * Как связь нарисована. Нет поля — стрелка вызова, как было всегда: старые
   * проекты открываются без миграции. `context` — карта контекстов из DDD:
   * линия без стрелки с метками U и D на концах. `mode` при этом хранится, но
   * не показывается: вернувшись к стрелке, человек получает её прежней.
   */
  notation?: 'context';
  /**
   * Какой конец связи — upstream. Нет поля — `target`: тот, кого вызывают,
   * задаёт модель, а вызывающий под неё подстраивается. От направления вызова
   * это не зависит: издатель событий — upstream, хотя стрелка идёт от него.
   */
  upstream?: EdgeEnd;
  /** Паттерн отношений на upstream-конце: OHS, PL. Свободный текст. */
  upstreamPattern?: string;
  /** Паттерн на downstream-конце: ACL, CF. */
  downstreamPattern?: string;
  /** Провёл интервьюер на доске кандидата в собеседовании. */
  drawnBy?: 'interviewer';
  /** Была в исходной системе сценария. */
  given?: boolean;
}

export type EdgeEnd = 'source' | 'target';

/**
 * Связь карты контекстов — отношение команд и моделей, а не вызов: ни
 * направления вызова, ни sync/async на ней не видно. Поэтому всё, что судит
 * о вызовах (проверки путей, поиск единой точки отказа), её пропускает.
 */
export const isContextEdge = (edge: Pick<DesignEdge, 'notation'>): boolean => edge.notation === 'context';

/** Upstream-конец связи; по умолчанию — тот, кого вызывают. */
export const upstreamEnd = (edge: Pick<DesignEdge, 'upstream'>): EdgeEnd => (edge.upstream === 'source' ? 'source' : 'target');

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

/**
 * Что кандидат получает на шаге оценок — решает автор сценария:
 * off — шага нет; text — только свободный текст, считать самому;
 * calc — калькулятор с ползунками и объёмом по таблицам схемы.
 */
export const ESTIMATE_MODES = ['off', 'text', 'calc'] as const;
export type EstimateMode = (typeof ESTIMATE_MODES)[number];

export interface CalcState {
  mode: EstimateMode;
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
  /** Оценки словами: прикидка кандидата или эталонная — у автора. */
  estimate: string;
}

/** Поля доски: всё, что у кандидата своё, а у автора — эталон. */
export const BOARD_KEYS = ['nodes', 'edges', 'requirements', 'api', 'estimate'] as const;

export function pickBoard(source: Board): Board {
  return { nodes: source.nodes, edges: source.edges, requirements: source.requirements, api: source.api, estimate: source.estimate };
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
  /**
   * Исходная система: с чем кандидат начинает собеседование. Пусто —
   * чистый лист. Не пусто — задача «доработай то, что есть»: кандидату
   * отдают работающую систему, и разговор идёт о том, что в ней менять.
   */
  start?: Board;
  hints: ScenarioItem[];
  rubric: Criterion[];
  questions: ScenarioItem[];
  /** Показывать ли кандидату проверки схемы: они подсказывают. */
  allowChecks: boolean;
  /**
   * Проверки для тренировки: по ним прохождение в одиночку понимает, что шаг
   * закрыт. Пусто у сценария, написанного до тренировки, — тогда список
   * выводится из эталона при первом заходе.
   */
  checks?: Check[];
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
  /**
   * Калькулятор, открытый интервьюером по ходу собеседования (в режиме
   * «сначала текст»), и прикидка кандидата в момент открытия: что человек
   * сказал сам, до того как ему дали считать.
   */
  calcUnlockedAt?: string;
  estimateSnapshot?: string;
  /**
   * Открытые подсказки с текстом — у кандидата в собеседовании на сервере:
   * закрытой части сценария у него нет, а подсказку он видеть должен.
   */
  revealedHints?: ScenarioItem[];
  /**
   * Задание кандидату в собеседовании на сервере: до «Старта» его нет
   * (taskLocked), со стартом оно приходит сюда, а не в сам документ, —
   * отмена у кандидата не должна прятать задание обратно.
   */
  taskLocked?: boolean;
  openedTask?: string;
  /** Разговор с ИИ-интервьюером в тренировке. */
  aiChat?: AiTurn[];
}

/** Реплика разговора с ИИ-интервьюером; kind — не слова, а действие: попросил вопрос или разбор. */
export interface AiTurn {
  role: 'interviewer' | 'candidate';
  text: string;
  kind?: 'ask' | 'review';
}

/**
 * Шаги прохождения. Порядок один и тот же в любой задаче: сначала требования,
 * потом контракт, потом схема, потом числа, потом слабые места. Считать до
 * того, как сформулированы требования, — считать наугад.
 */
export const TRAIN_STEPS = ['req', 'api', 'design', 'estimate', 'harden'] as const;
export type TrainStep = (typeof TRAIN_STEPS)[number];

/** Прохождение в одиночку: где человек сейчас и что с ним уже случилось. */
export interface Training {
  /** Текущий шаг. Пройденность шагов не хранится — она считается по проверкам. */
  step: TrainStep;
  /** Категории уже прилетевших вводных. */
  twists: string[];
  /** Шаги, которые человек закрыл кнопкой «Пропустить», не выполнив проверки. */
  skipped: TrainStep[];
  /** Прикидка на момент вводной: пока текст не изменился, он считается старым. */
  estimateMark?: string;
  /** Итог на финише: счёт и снимок проверок, чтобы отчёт не менялся задним числом. */
  score?: number;
  passed?: Record<string, boolean>;
}

export function emptyTraining(): Training {
  return { step: 'req', twists: [], skipped: [] };
}

/** Что из оценок кандидат видит сейчас: режим автора плюс то, что открыл интервьюер. */
export function candidateEstimates(design: Design): EstimateMode {
  return design.calc.mode === 'text' && design.session.calcUnlockedAt ? 'calc' : design.calc.mode;
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
  /** calc.mode — что из оценок доступно кандидату. Автор видит всё всегда. */
  calc: CalcState;
  scenario: Scenario;
  session: Session;
  training: Training;
  createdAt: string;
  updatedAt: string;
}

export function emptyBoard(): Board {
  return { nodes: [], edges: [], requirements: [], api: [], estimate: '' };
}

/** Есть ли на доске хоть что-то: блок, связь, требование, маршрут или прикидка. */
export function hasContent(board: Board): boolean {
  return Boolean(board.nodes.length || board.edges.length || board.requirements.length || board.api.length || board.estimate.trim());
}

/**
 * Доска, с которой кандидат начинает: копия исходной системы, блоки и
 * связи помечены как данные. Сервер делает то же самое при старте
 * собеседования (private.seed_start_board) — пометка должна совпадать.
 */
export function startBoard(scenario: Scenario): Board {
  const start = scenario.start;
  if (!start) return emptyBoard();
  const copy = structuredClone(pickBoard(start));
  return {
    ...copy,
    nodes: copy.nodes.map((node) => ({ ...node, given: true })),
    edges: copy.edges.map((edge) => ({ ...edge, given: true })),
  };
}

/**
 * Доложить исходную систему к тому, что уже есть: своё остаётся, чего нет
 * по id — добавляется в начало. Кандидат мог порисовать до старта, и это не
 * должно пропасть.
 */
export function mergeBoards(own: Board, extra: Board): Board {
  const add = <T extends { id: string }>(mine: T[], theirs: T[]) => {
    const known = new Set(mine.map((item) => item.id));
    return [...theirs.filter((item) => !known.has(item.id)), ...mine];
  };
  return {
    nodes: add(own.nodes, extra.nodes),
    edges: add(own.edges, extra.edges),
    requirements: add(own.requirements, extra.requirements),
    api: add(own.api, extra.api),
    estimate: own.estimate.trim() ? own.estimate : extra.estimate,
  };
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
  /** Лежит в пространстве на сервере, а не в этом браузере. */
  cloud?: boolean;
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
    calc: { mode: 'off', values: {} },
    scenario: emptyScenario(),
    session: emptySession(),
    training: emptyTraining(),
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
export function migrateBoard(data: Partial<Board> | undefined): Board {
  return {
    nodes: Array.isArray(data?.nodes)
      ? data.nodes.map((node) => ({
          ...node,
          note: node.note ?? '',
          label: node.label ?? '',
          schema: Array.isArray(node.schema)
            ? node.schema.map((table) => ({
                ...table,
                note: table.note ?? '',
                columns: (table.columns ?? []).map((column) => ({ ...column, keys: column.keys ?? [], nullable: Boolean(column.nullable) })),
              }))
            : undefined,
          matrix: node.matrix
            ? {
                options: Array.isArray(node.matrix.options) ? node.matrix.options : [],
                rows: Array.isArray(node.matrix.rows) ? node.matrix.rows : undefined,
                // Поля нет в старых проектах — и не появляется, пока своих критериев нет.
                ...(Array.isArray(node.matrix.criteria)
                  ? {
                      criteria: node.matrix.criteria
                        .filter((item) => item && typeof item.id === 'string' && item.id)
                        .map((item) => ({ id: item.id, text: typeof item.text === 'string' ? item.text : '' })),
                    }
                  : {}),
                cells: node.matrix.cells ?? {},
              }
            : undefined,
        }))
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
    estimate: typeof data?.estimate === 'string' ? data.estimate : '',
  };
}

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** Прохождения могло не быть вовсе: тренировка появилась позже формата. */
function migrateTraining(data: Partial<Training> | undefined): Training {
  const base = emptyTraining();
  if (!data) return base;
  return {
    step: TRAIN_STEPS.includes(data.step as TrainStep) ? (data.step as TrainStep) : base.step,
    twists: list(data.twists),
    skipped: list<TrainStep>(data.skipped).filter((step) => TRAIN_STEPS.includes(step)),
    estimateMark: typeof data.estimateMark === 'string' ? data.estimateMark : undefined,
    score: typeof data.score === 'number' ? data.score : undefined,
    passed: data.passed && typeof data.passed === 'object' ? { ...data.passed } : undefined,
  };
}

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
      ...(scenario.start ? { start: migrateBoard(scenario.start) } : {}),
      hints: list(scenario.hints),
      rubric: list<Criterion>(scenario.rubric).map((item) => ({ ...item, weight: item.weight ?? 1 })),
      questions: list(scenario.questions),
      allowChecks: Boolean(scenario.allowChecks),
      guide: typeof scenario.guide === 'string' ? scenario.guide : '',
      ...(Array.isArray(scenario.checks) ? { checks: scenario.checks } : {}),
    },
    session: {
      revealed: list(session.revealed),
      asked: list(session.asked),
      scores: { ...(session.scores ?? {}) },
      notes: typeof session.notes === 'string' ? session.notes : '',
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      signals: list(session.signals),
      ...(Array.isArray(session.aiChat) ? { aiChat: session.aiChat } : {}),
      calcUnlockedAt: session.calcUnlockedAt,
      estimateSnapshot: session.estimateSnapshot,
    },
    training: migrateTraining(data.training),
    calc: {
      // Первая версия хранила флаг enabled: включённый — это калькулятор.
      mode: ESTIMATE_MODES.includes(data.calc?.mode as EstimateMode)
        ? (data.calc!.mode as EstimateMode)
        : (data.calc as { enabled?: boolean } | undefined)?.enabled
          ? 'calc'
          : 'off',
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
  if (!blocksOf(reference.nodes).length) return [];
  const count = (board: Board) => {
    const map = new Map<string, number>();
    for (const node of blocksOf(board.nodes)) map.set(node.kind, (map.get(node.kind) ?? 0) + 1);
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
  const blocks = blocksOf(design.nodes);
  const byId = new Map(blocks.map((node) => [node.id, node]));

  for (const node of blocks) {
    if (blocks.length > 1 && !linked.has(node.id)) {
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
  for (const edge of design.edges)
    if (!isContextEdge(edge)) incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  for (const node of blocks) {
    if (spofKinds.has(node.kind) && (incoming.get(node.id) ?? 0) >= 2) {
      const twins = blocks.filter((other) => other.kind === node.kind).length;
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

  if (!blocks.length) findings.push({ level: 'info', key: 'lint.empty' });
  return findings;
}

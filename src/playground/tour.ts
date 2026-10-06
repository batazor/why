import { emptyDesign, type Design, type DesignEdge, type DesignNode, type DesignSummary, type Endpoint, type Requirement } from './model';
import type { Tab } from './roles';
import type { DesignRepository } from './storage';

/**
 * Знакомство с песочницей: самый простой сервис — счётчик просмотров — по
 * шагам «Дальше, дальше». Ссылку дают кандидату заранее, чтобы на
 * собеседовании он думал о задаче, а не искал, где добавить требование.
 *
 * Каждый шаг умеет сделать свою часть доски сам (`apply`) — но человек может
 * сделать её и руками, поэтому `apply` только доливает недостающее по id и
 * ничего не затирает. Шаг назад — снимок доски до шага, а не отмена `apply`:
 * так назад возвращается и то, что человек наделал сам.
 *
 * Тур живёт только в памяти: ни в проекты браузера, ни на сервер он не
 * попадает, и вход для него не нужен.
 */

type Text = { en: string; ru: string };

/** Какую часть экрана подсветить: туда сейчас смотреть. */
export type TourFocus = 'brief' | 'palette' | 'canvas' | 'side' | 'toolbar';

export interface TourStep {
  id: string;
  title: Text;
  body: Text;
  focus?: TourFocus;
  /** Какую вкладку открыть справа. */
  tab?: Tab;
  /** Какой блок выбрать — чтобы справа открылся его инспектор. */
  select?: string;
  apply?: (design: Design, lang: string) => Design;
}

const USER = 'tour_user';
const API = 'tour_api';
const DB = 'tour_db';

const pick = (text: Text, lang: string) => (lang === 'ru' ? text.ru : text.en);

/** Добавить то, чего нет по id: шаг можно повторить, сделанное руками не задвоится. */
function add<T extends { id: string }>(list: T[], items: T[]): T[] {
  const known = new Set(list.map((item) => item.id));
  return [...list, ...items.filter((item) => !known.has(item.id))];
}

const node = (id: string, kind: string, label: string, x: number, y: number, note = ''): DesignNode => ({
  id,
  kind,
  label,
  note,
  x,
  y,
});

const edge = (id: string, source: string, target: string, label: string): DesignEdge => ({
  id,
  source,
  target,
  label,
  mode: 'sync',
});

export function tourDesign(lang: string): Design {
  const design = emptyDesign(pick({ en: 'Tour: view counter', ru: 'Тур: счётчик просмотров' }, lang));
  design.id = 'tour';
  design.taskSource = 'Product Owner';
  design.task = pick(
    {
      en: 'Count how many times each article was viewed. Every page open adds one; the page shows the current number.\n\nThis is a practice task for the tour: the point is to see what the playground can do, not to design the perfect counter.',
      ru: 'Считать, сколько раз открыли каждую статью. Каждое открытие страницы добавляет единицу, страница показывает текущее число.\n\nЭто учебная задача для тура: смысл — увидеть, что умеет песочница, а не придумать идеальный счётчик.',
    },
    lang,
  );
  // Прикидка словами и проверки — чтобы обе вкладки были видны, как на собеседовании, где автор их разрешил.
  design.calc = { mode: 'text', values: {} };
  design.scenario.allowChecks = true;
  return design;
}

export const TOUR: TourStep[] = [
  {
    id: 'hello',
    title: { en: 'Five minutes, one tiny service', ru: 'Пять минут, один маленький сервис' },
    body: {
      en: 'We will build the simplest service there is — a view counter — and walk through everything the playground has. Press “Next”: each step adds its part to the board, and you see where everything lives. Touch anything — it is a sandbox.',
      ru: 'Соберём самый простой сервис — счётчик просмотров — и пройдём по всему, что есть в песочнице. Жмите «Дальше»: каждый шаг сам добавит свою часть на доску, а вы смотрите, где что лежит. Трогать можно всё — это песочница.',
    },
  },
  {
    id: 'task',
    focus: 'brief',
    title: { en: 'The task', ru: 'Задание' },
    body: {
      en: 'The task hangs above the board. In an interview it opens when the interviewer presses “Start”; before that you see that you are waiting. Come back to it any time; the arrow folds it away.',
      ru: 'Задание висит над доской. На собеседовании оно откроется, когда интервьюер нажмёт «Старт», — до этого видно, что ждём. Возвращайтесь к нему когда угодно, стрелка сворачивает карточку.',
    },
  },
  {
    id: 'req',
    focus: 'side',
    tab: 'req',
    title: { en: 'Requirements first', ru: 'Сначала требования' },
    body: {
      en: 'Start with requirements, not boxes. Functional: what the system does. Non-functional: how well, always with a number you could check. “Table” shows them as a document.',
      ru: 'Начинаем не с квадратиков, а с требований. Функциональные — что система делает. Нефункциональные — насколько хорошо, всегда с числом, которое можно проверить. «Таблица» показывает их документом.',
    },
    apply: (design, lang) => ({
      ...design,
      requirements: add(design.requirements, [
        req('FR-1', 'fr', { en: 'Count a view of an article', ru: 'Засчитать просмотр статьи' }, lang),
        req('FR-2', 'fr', { en: 'Show the current count', ru: 'Показать текущее число просмотров' }, lang),
        {
          ...req('NFR-1', 'nfr', { en: 'Reading the count is fast', ru: 'Число читается быстро' }, lang),
          target: 'p99 < 50 ms',
          category: 'latency',
        },
      ]),
    }),
  },
  {
    id: 'api',
    focus: 'side',
    tab: 'api',
    title: { en: 'The API', ru: 'API' },
    body: {
      en: 'The contract between the client and the system: method, path, response code, fields. Templates help with the usual routes. Two routes are enough for a counter.',
      ru: 'Контракт между клиентом и системой: метод, путь, код ответа, поля. Для типовых маршрутов есть шаблоны. Счётчику хватит двух маршрутов.',
    },
    apply: (design, lang) => ({
      ...design,
      api: add(design.api, [
        route('tour_inc', 'POST', '/articles/{id}/views', 204, { en: 'Count a view', ru: 'Засчитать просмотр' }, [], [], ['FR-1'], lang),
        route('tour_get', 'GET', '/articles/{id}/views', 200, { en: 'Current count', ru: 'Текущее число' }, [], ['count'], ['FR-2'], lang),
      ]),
    }),
  },
  {
    id: 'blocks',
    focus: 'palette',
    title: { en: 'Blocks', ru: 'Блоки' },
    body: {
      en: 'Blocks are on the left: drag one onto the board or just click it. Select a block to rename it in the inspector on the right. Here: the reader and the service that counts.',
      ru: 'Блоки — слева: перетащите на доску или просто щёлкните. Выберите блок — название меняется справа, в инспекторе. Здесь — читатель и сервис, который считает.',
    },
    apply: (design, lang) => ({
      ...design,
      nodes: add(design.nodes, [
        node(USER, 'user', pick({ en: 'Reader', ru: 'Читатель' }, lang), 0, 120),
        node(API, 'service', 'views-api', 300, 120),
      ]),
    }),
  },
  {
    id: 'edges',
    focus: 'canvas',
    title: { en: 'Connections', ru: 'Связи' },
    body: {
      en: 'Pull from a dot on the edge of one block to another. A solid line is a synchronous call, a dashed one is asynchronous — switch it in the inspector. Click a line to sign it.',
      ru: 'Тяните от точки на краю одного блока к другому. Сплошная линия — синхронный вызов, пунктир — асинхронный: переключается в инспекторе. Щёлкните линию — можно подписать.',
    },
    apply: (design) => ({
      ...design,
      edges: add(design.edges, [edge('tour_e1', USER, API, 'HTTPS')]),
    }),
  },
  {
    id: 'db',
    focus: 'canvas',
    title: { en: 'A database', ru: 'База данных' },
    body: {
      en: 'The count must survive a restart — it goes into a database. Storage blocks are marked with their own colour: you can see at a glance where the state lives.',
      ru: 'Число должно пережить перезапуск — значит, оно в базе. У хранилищ свой цвет: сразу видно, где живёт состояние.',
    },
    apply: (design) => ({
      ...design,
      nodes: add(design.nodes, [node(DB, 'sql', 'Postgres', 600, 120)]),
      edges: add(design.edges, [edge('tour_e2', API, DB, 'SQL')]),
    }),
  },
  {
    id: 'schema',
    focus: 'side',
    tab: 'inspect',
    select: DB,
    title: { en: 'The table', ru: 'Таблица' },
    body: {
      en: 'Select a block — the inspector on the right shows its notes, caption, technology and, for storage, the data schema: tables, columns, keys. The DDL for it can be copied.',
      ru: 'Выберите блок — справа инспектор: заметки, подпись, технология, а у хранилища — схема данных: таблицы, поля, ключи. Её DDL можно скопировать.',
    },
    apply: (design, lang) => ({
      ...design,
      nodes: design.nodes.map((item) =>
        item.id === DB && !item.schema?.length
          ? {
              ...item,
              schema: [
                {
                  id: 'tour_t1',
                  name: 'article_views',
                  note: pick({ en: 'One row per article', ru: 'Строка на статью' }, lang),
                  columns: [
                    { id: 'tour_c1', name: 'article_id', type: 'bigint', keys: ['pk'], nullable: false },
                    { id: 'tour_c2', name: 'views', type: 'bigint', keys: [], nullable: false },
                    { id: 'tour_c3', name: 'updated_at', type: 'timestamptz', keys: [], nullable: false },
                  ],
                },
              ],
            }
          : item,
      ),
    }),
  },
  {
    id: 'cover',
    focus: 'side',
    tab: 'req',
    title: { en: 'What covers what', ru: 'Что чем закрыто' },
    body: {
      en: 'Drag a requirement by its number onto a block — the block now covers it. That way every requirement has something behind it, and every block has a reason to exist. Routes get their service the same way, in the API tab.',
      ru: 'Перетащите требование за номер на блок — блок его закрывает. Так у каждого требования есть чем оно обеспечено, а у каждого блока — зачем он нужен. Маршрутам сервис назначается так же, во вкладке API.',
    },
    apply: (design) => {
      const has = new Set(design.nodes.map((item) => item.id));
      const covers: Record<string, string[]> = { 'FR-1': [API], 'FR-2': [API], 'NFR-1': [API, DB] };
      return {
        ...design,
        requirements: design.requirements.map((item) => ({
          ...item,
          covers: [...new Set([...item.covers, ...(covers[item.id] ?? []).filter((id) => has.has(id))])],
        })),
        api: design.api.map((item) => (item.service || !has.has(API) ? item : { ...item, service: API })),
      };
    },
  },
  {
    id: 'estimate',
    focus: 'side',
    tab: 'calc',
    title: { en: 'Back-of-the-envelope', ru: 'Прикидка' },
    body: {
      en: 'How many requests and how much data — in words and numbers. In an interview the interviewer may open a calculator with sliders along the way; what you wrote before stays.',
      ru: 'Сколько запросов и сколько данных — словами и числами. На собеседовании интервьюер может по ходу открыть калькулятор с ползунками; написанное до этого сохранится.',
    },
    apply: (design, lang) =>
      design.estimate.trim()
        ? design
        : {
            ...design,
            estimate: pick(
              {
                en: '1M views a day ≈ 12 writes/s on average, ~60/s at peak.\nReads as many: every view shows the count.\n100k articles × ~30 bytes per row ≈ 3 MB — fits anywhere.',
                ru: '1 млн просмотров в сутки ≈ 12 записей/с в среднем, ~60/с в пик.\nЧтений столько же: каждый просмотр показывает число.\n100 тыс. статей × ~30 байт на строку ≈ 3 МБ — влезет куда угодно.',
              },
              lang,
            ),
          },
  },
  {
    id: 'check',
    focus: 'side',
    tab: 'check',
    title: { en: 'Checks', ru: 'Проверки' },
    body: {
      en: 'We added FR-3, “top 10 articles”, and the checks see it at once: no block covers it and no route serves it. They also flag a block with no connections, a non-functional requirement without a number, a single point of failure. In an interview checks may be hidden — then the interviewer asks these questions.',
      ru: 'Добавили FR-3 — «топ-10 статей», — и проверки сразу это видят: его не закрывает ни один блок, и для него нет маршрута. Ещё они ловят блок без связей, НФТ без числа, единую точку отказа. На собеседовании проверки могут быть скрыты — тогда эти вопросы задаст интервьюер.',
    },
    apply: (design, lang) => ({
      ...design,
      requirements: add(design.requirements, [
        req('FR-3', 'fr', { en: 'Show the 10 most viewed articles', ru: 'Показать 10 самых читаемых статей' }, lang),
      ]),
    }),
  },
  {
    id: 'live',
    focus: 'toolbar',
    title: { en: 'In the interview', ru: 'На собеседовании' },
    body: {
      en: 'The board is shared: the interviewer sees it live, with your cursor, and may draw next to you — their blocks are marked. The toolbar says that window focus and the clipboard are being recorded. Ctrl/⌘+Z undoes, Delete removes the selected block.',
      ru: 'Доска общая: интервьюер видит её вживую, вместе с вашим курсором, и может рисовать рядом — его блоки помечены. В строке сверху видно, что пишется фокус окна и буфер обмена. Ctrl/⌘+Z — отмена, Delete — удалить выбранный блок.',
    },
  },
  {
    id: 'done',
    title: { en: 'That’s all', ru: 'Вот и всё' },
    body: {
      en: 'Requirements, API, blocks, connections, a table, coverage, an estimate and checks — that is the whole toolkit. Close FR-3 yourself, or clear the board and start from scratch. Or just close the tab: nothing here is saved.',
      ru: 'Требования, API, блоки, связи, таблица, покрытие, прикидка и проверки — это весь набор. Закройте FR-3 сами или очистите доску и начните с нуля. Или просто закройте вкладку: здесь ничего не сохраняется.',
    },
  },
];

function req(id: string, kind: Requirement['kind'], text: Text, lang: string): Requirement {
  return { id, kind, text: pick(text, lang), target: '', covers: [] };
}

function route(
  id: string,
  method: Endpoint['method'],
  path: string,
  status: number,
  about: Text,
  request: string[],
  response: string[],
  covers: string[],
  lang: string,
): Endpoint {
  return { id, method, path, status, about: pick(about, lang), request, response, outbound: false, covers };
}

export const tourText = pick;

/** Тур открывают ссылкой `?tour`. */
export function tourRequested(): boolean {
  try {
    return new URL(location.href).searchParams.has('tour');
  } catch {
    return false;
  }
}

/** Хранилище тура — в памяти: тур ничего не сохраняет ни в браузер, ни на сервер. */
export class TourRepository implements DesignRepository {
  private design: Design | null = null;

  async list(): Promise<DesignSummary[]> {
    return this.design ? [{ id: this.design.id, title: this.design.title, updatedAt: this.design.updatedAt }] : [];
  }

  async load(id: string): Promise<Design | null> {
    return this.design?.id === id ? this.design : null;
  }

  async save(design: Design): Promise<void> {
    this.design = design;
  }

  async remove(): Promise<void> {
    this.design = null;
  }
}

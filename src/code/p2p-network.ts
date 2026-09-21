import type { CodeDeck } from './types';
import type { RequirementsData, WidgetSpec } from './widgets';
import type { LikeC4Spec } from './likec4';

/**
 * Колода разбора системного дизайна: P2P-сеть для раздачи файлов, «как торрент».
 *
 * Порядок тот же, что у разбора скрейпинг-джоб: понять, что просят → спросить →
 * записать требования → посчитать → и только потом рисовать. Отличие в том,
 * что считать здесь приходится не свои серверы, а чужие каналы: почти вся
 * мощность сети стоит у пользователей дома, и три калькулятора отвечают на три
 * вопроса, без которых схема — угадывание. Зачем рой вообще, если есть сервер;
 * зачем DHT, если есть трекер; сколько копий нужно, чтобы файл дожил до
 * следующего качающего.
 *
 * ПРАВИЛО: колода и схема общие для всех локалей, поэтому в них только
 * английский. Вся проза идёт в `narration` и `labels` локализованного урока.
 */

/** Обложка в каталоге: акварель — один сервер против роя. */
export const cover = 'covers/p2p-network.svg';

export const likec4: LikeC4Spec = {
  height: 460,
  views: {
    c1: 'p2p_context',
    'c2-tracker': 'p2p_tracker',
    'c2-dht': 'p2p_dht',
    'c2-nat': 'p2p_nat',
    'c2-webseed': 'p2p_webseed',
    'c2-full': 'p2p_full',
    'seq-join': 'p2p_join_seq',
    'c3-client': 'p2p_client',
  },
  // Итоговая схема и последовательность — во всю ширину: в половине экрана
  // их подписи не прочитать.
  wide: ['c2-full', 'seq-join'],
  heights: { 'c2-full': 900, 'seq-join': 820, 'c3-client': 900 },
  // Три фазы пути от ссылки до куска. Номера — шаги `p2p_join_seq`.
  groups: {
    'seq-join': [
      { from: 2, to: 5, label: 'seq.discovery' },
      { from: 6, to: 10, label: 'seq.handshake' },
      { from: 11, to: 13, label: 'seq.exchange' },
    ],
  },
  notes: {
    'c2-tracker': { element: 'p2p.tracker', side: 'bottom' },
    'c2-dht': { element: 'p2p.bootstrap', side: 'bottom' },
    'c2-full': { element: 'p2p.dht', side: 'bottom' },
  },
};

/**
 * Документ требований. Строка появляется на шаге `step`, число к ней — на шаге
 * `goal`: «раздача масштабируется» записывают вместе с остальными свойствами,
 * а «полчаса вместо четырёх суток» — только когда это посчитано.
 */
const requirements: RequirementsData = {
  name: 'p2p-network',
  rows: [
    { id: 'FR-1', kind: 'fr', step: 'fr' },
    { id: 'FR-2', kind: 'fr', step: 'fr' },
    { id: 'FR-3', kind: 'fr', step: 'fr' },
    { id: 'FR-4', kind: 'fr', step: 'fr' },
    { id: 'FR-5', kind: 'fr', step: 'fr' },
    { id: 'FR-6', kind: 'fr', step: 'fr' },
    { id: 'FR-7', kind: 'fr', step: 'fr' },
    { id: 'NFR-1', kind: 'nfr', step: 'nfr', goal: 'pieces' },
    { id: 'NFR-2', kind: 'nfr', step: 'nfr', goal: 'c2-dht' },
    { id: 'NFR-3', kind: 'nfr', step: 'nfr', goal: 'calc-swarm' },
    { id: 'NFR-4', kind: 'nfr', step: 'nfr', goal: 'calc-availability' },
    { id: 'NFR-5', kind: 'nfr', step: 'nfr', goal: 'choking' },
    { id: 'NFR-6', kind: 'nfr', step: 'nfr', goal: 'c2-nat' },
    { id: 'NFR-7', kind: 'nfr', step: 'slo', goal: 'slo' },
    // Выросли из чисел и из модели угроз: в разговоре с продуктом их не было.
    { id: 'NFR-8', kind: 'nfr', step: 'calc-dht', goal: 'calc-dht' },
    { id: 'NFR-9', kind: 'nfr', step: 'security', goal: 'security' },
  ],
};

/** Таблица стоит на шагах без своего кадра, которые что-то в неё приносят. */
const board = { widget: 'requirements', data: requirements } as const;

export const widgets: WidgetSpec = {
  fr: board,
  nfr: board,
  slo: board,
  pieces: board,
  choking: board,
  security: board,

  /**
   * Сортировка требований. Целостность и работа за NAT на слух — функции, и
   * спорят на ревью как раз о них.
   */
  scope: {
    widget: 'requirement-sort',
    wide: false,
    data: {
      bins: ['fr', 'nfr', 'out'],
      items: [
        { key: 'publish', bin: 'fr' },
        { key: 'find', bin: 'fr' },
        { key: 'parallel', bin: 'fr' },
        { key: 'resume', bin: 'fr' },
        { key: 'integrity', bin: 'nfr' },
        { key: 'nospof', bin: 'nfr' },
        { key: 'nat', bin: 'nfr' },
        { key: 'fair', bin: 'nfr' },
        { key: 'search', bin: 'out' },
        { key: 'anonymity', bin: 'out' },
      ],
    },
  },

  /**
   * Рой против сервера. По умолчанию — день релиза: файл в 4 ГБ, десять тысяч
   * качающих, гигабитный сид и домашние каналы с отдачей в 20 Мбит/с.
   */
  'calc-swarm': {
    widget: 'p2p-calculator',
    wide: false,
    data: {
      model: 'swarm',
      inputs: [
        { key: 'fileGb', min: 0.1, max: 100, scale: 'log', value: 4 },
        { key: 'peers', min: 10, max: 1_000_000, scale: 'log', value: 10_000 },
        { key: 'seedMbps', min: 10, max: 10_000, scale: 'log', value: 1_000 },
        // Домашний канал асимметричен: отдача на порядок меньше приёма, и
        // именно она — ресурс, из которого сделана сеть.
        { key: 'upMbps', min: 0.5, max: 1_000, scale: 'log', value: 20 },
        { key: 'downMbps', min: 1, max: 1_000, scale: 'log', value: 100 },
        { key: 'pieceKb', min: 64, max: 16_384, scale: 'pow2', value: 1_024 },
      ],
    },
  },

  /**
   * Трекер против DHT. Десять миллионов узлов — порядок величины живой
   * BitTorrent DHT; k = 8 — её же размер бакета (в статье про Kademlia — 20).
   */
  'calc-dht': {
    widget: 'p2p-calculator',
    wide: false,
    data: {
      model: 'dht',
      inputs: [
        { key: 'nodes', min: 1_000, max: 100_000_000, scale: 'log', value: 10_000_000 },
        { key: 'torrentsPerNode', min: 1, max: 100, scale: 'log', value: 5 },
        { key: 'announceMin', min: 5, max: 120, step: 5, value: 30 },
        { key: 'k', min: 4, max: 32, value: 8 },
        { key: 'alpha', min: 1, max: 8, value: 3 },
        { key: 'rttMs', min: 10, max: 1_000, scale: 'log', value: 150 },
      ],
    },
  },

  /**
   * Доживёт ли файл. 30% онлайн — домашний компьютер, включённый по вечерам;
   * три копии — число из учебных разборов, которое здесь и проверяется.
   */
  'calc-availability': {
    widget: 'p2p-calculator',
    wide: false,
    data: {
      model: 'availability',
      inputs: [
        { key: 'onlinePct', min: 1, max: 99, value: 30 },
        { key: 'copies', min: 1, max: 50, value: 3 },
        { key: 'pieces', min: 16, max: 65_536, scale: 'pow2', value: 4_096 },
      ],
    },
  },

  /**
   * Симулятор роя на React Flow. Семь качающих и шестнадцать кусков: на двухстах
   * зёрнах «по порядку» при уходящем сиде не доходит до конца ни разу,
   * «случайно» — в одном прогоне из двадцати, «сначала редкие» — всегда.
   */
  'swarm-sim': {
    widget: 'swarm-sim',
    wide: true,
    data: {
      leechers: 7,
      pieces: 16,
      strategies: ['sequential', 'random', 'rarest'],
      seedLeaves: true,
      seed: 7,
    },
  },

  /** Итог: решения разбора против требований. Каждая строка закрыта карточкой. */
  answer: {
    widget: 'requirement-match',
    wide: true,
    data: {
      requirements,
      cards: [
        { key: 'magnet', fits: ['FR-1'] },
        { key: 'discovery', fits: ['FR-2', 'NFR-7'] },
        { key: 'chunks', fits: ['FR-3', 'NFR-3'] },
        { key: 'have', fits: ['FR-4'] },
        { key: 'bootstrap', fits: ['FR-5'] },
        { key: 'resume', fits: ['FR-6'] },
        { key: 'stats', fits: ['FR-7'] },
        { key: 'hashes', fits: ['NFR-1'] },
        { key: 'dht', fits: ['NFR-2', 'NFR-8'] },
        { key: 'rarest', fits: ['NFR-4'] },
        { key: 'webseed', fits: ['NFR-4'] },
        { key: 'choker', fits: ['NFR-5'] },
        { key: 'punch', fits: ['NFR-6'] },
        { key: 'hardening', fits: ['NFR-9'] },
      ],
    },
  },
};

const deck: CodeDeck = [
  // Что просят и чего в условии нет.
  { id: 'overview' },
  { id: 'questions' },

  // Требования.
  { id: 'actors' },
  { id: 'fr' },
  { id: 'scope' },
  { id: 'nfr' },
  { id: 'slo' },

  // Расчёты: зачем рой, зачем DHT, сколько копий.
  { id: 'calc-swarm' },
  { id: 'calc-dht' },
  { id: 'calc-availability' },

  // Архитектура: от центра к его отсутствию.
  { id: 'c1' },
  { id: 'c2-tracker' },
  { id: 'pieces' },
  { id: 'swarm-sim' },
  { id: 'choking' },
  { id: 'c2-dht' },
  { id: 'c2-nat' },
  { id: 'c2-webseed' },
  { id: 'c2-full' },

  // Порядок: от ссылки до первого куска.
  { id: 'seq-join' },

  // C3: внутри узла.
  { id: 'c3-client' },

  { id: 'security' },
  { id: 'tradeoffs' },
  { id: 'answer' },
];

export default deck;

/** Врезки внутри текста шага: колонка рядом у этих шагов занята кадром. */
export const inlineWidgets: WidgetSpec = {
  /**
   * Контракт трекера — единственный HTTP во всей сети. Стоит в тексте шага:
   * колонку рядом занимает кадр C2.
   */
  'c2-tracker': {
    widget: 'api-cards',
    data: {
      endpoints: [
        {
          key: 'announce',
          method: 'GET',
          path: '/announce?info_hash={hash}&peer_id={id}&port={port}&left={bytes}&event={event}',
          status: 200,
          statusText: 'OK',
          response: ['interval', 'complete', 'incomplete', 'peers: 6 bytes each'],
        },
        {
          key: 'scrape',
          method: 'GET',
          path: '/scrape?info_hash={hash}',
          status: 200,
          statusText: 'OK',
          response: ['complete', 'incomplete', 'downloaded'],
        },
      ],
    },
  },
};

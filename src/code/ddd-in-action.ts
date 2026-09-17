import type { CodeDeck } from './types';
import type { FileTreeSpec } from './tree';
import type { LikeC4Spec } from './likec4';

/**
 * Колода шагов урока «DDD in action».
 *
 * ПРАВИЛО: код, дерево и схема общие для всех локалей, поэтому в них только
 * английский. Любая проза идёт в `narration` локализованного урока — иначе
 * русский комментарий вылезет на английской странице.
 *
 * Урок идёт сверху вниз, и на разных уровнях смотрит на разное: границы
 * контекстов — схемой, файлы сервиса — редактором. Панель одна, шаг объявляет,
 * что в ней: свой view — схема, свой файл — редактор.
 */

export const likec4: LikeC4Spec = {
  /**
   * Полотно выше, чем у схемы-полосы: C2 биллинга — это рамка с доменами и
   * их базами, и в 420px карточки в ней мельчают до нечитаемых подписей.
   */
  height: 620,
  views: {
    boundary: 'boundary',
    estate: 'estate',
    kinds: 'kinds',
    language: 'language',
    domains: 'domains',
    storage: 'storage',
    bus: 'bus_view',
    provider: 'provider_view',
    overview: 'overview',
    service: 'service',
  },
  /**
   * Лейблы на карточках. Появляются на шаге про виды контекста и дальше уже
   * не исчезают: спускаясь внутрь биллинга, читатель должен видеть, что за
   * блоки перед ним — core, supporting, generic или домен.
   */
  tags: ['kinds', 'language', 'domains', 'storage', 'bus', 'provider', 'overview', 'service'],
  /**
   * Итоговая картина идёт во всю ширину окна: кадр большой, и текста рядом ему
   * не нужно. Остальные кадры стоят рядом со своим текстом.
   */
  wide: ['overview'],
};

/**
 * Дерево сервиса, которое урок заполняет по шагам.
 *
 * Появление файла и его содержимое — два разных шага: на первом важно, что
 * файл в каталоге появился и лежит именно здесь, и панель отдана дереву, на
 * втором дерево уже всё сказало, и ширина нужна содержимому.
 */
export const tree: FileTreeSpec = {
  root: 'billing',
  steps: {
    language: { open: 'GLOSSARY.md', view: 'tree' },
    glossary: { open: 'GLOSSARY.md', view: 'file' },
    slices: { view: 'tree' },
  },
  files: [
    {
      path: 'GLOSSARY.md',
      from: 'language',
      lang: 'markdown',
    },
  ],
  /**
   * Модули домена появляются в дереве раньше своего кода: сперва видно, из
   * каких частей домен состоит, и только потом — что внутри части. Каталоги
   * поэтому пока пустые.
   */
  dirs: [
    { path: 'invoice/issuing', from: 'slices' },
    { path: 'invoice/payment', from: 'slices' },
    { path: 'invoice/overdue', from: 'slices' },
  ],
};

const deck: CodeDeck = [
  { id: 'boundary' },
  { id: 'estate' },
  { id: 'kinds' },
  { id: 'language' },
  { id: 'glossary' },
  { id: 'domains' },
  { id: 'storage' },
  { id: 'bus' },
  { id: 'provider' },
  { id: 'overview' },
  { id: 'service' },
  { id: 'slices' },
];

export default deck;

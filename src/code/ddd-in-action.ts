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
  height: 420,
  views: {
    estate: 'estate',
    kinds: 'kinds',
  },
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
  },
  files: [
    {
      path: 'GLOSSARY.md',
      from: 'language',
      lang: 'markdown',
    },
  ],
};

const deck: CodeDeck = [
  { id: 'boundary' },
  { id: 'estate' },
  { id: 'kinds' },
  { id: 'language' },
  { id: 'glossary' },
];

export default deck;

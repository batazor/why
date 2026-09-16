import type { CodeDeck } from './types';
import type { FileTreeSpec } from './tree';

/**
 * Колода шагов урока «DDD in action».
 *
 * ПРАВИЛО: код и дерево общие для всех локалей, поэтому в них только английский
 * и без объясняющих комментариев. Любая проза идёт в `narration` локализованного
 * урока — иначе русский комментарий вылезет на английской странице.
 */

/**
 * Дерево сервиса, которое урок заполняет по шагам.
 *
 * Появление файла и его содержимое — два разных шага. На первом читателю важно,
 * что в каталоге теперь есть словарь и что он лежит именно здесь; читать в нём
 * ещё нечего, поэтому панель целиком отдана дереву. На втором наоборот: дерево
 * уже всё сказало, и ширина нужна коду.
 */
export const tree: FileTreeSpec = {
  root: 'service',
  steps: {
    language: { open: 'GLOSSARY.md', view: 'tree' },
    glossary: { open: 'GLOSSARY.md', view: 'file' },
  },
  files: [
    {
      path: 'GLOSSARY.md',
      from: 'language',
      lang: 'markdown',
      code: `# Glossary

One meaning per word inside this context. The code, the events, the API and
the model spell it the same way.`,
    },
  ],
};

const deck: CodeDeck = [
  {
    id: 'language',
  },
  {
    id: 'glossary',
  },
];

export default deck;

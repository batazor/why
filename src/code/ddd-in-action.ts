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
 * Дерево сервиса, которое урок заполняет по шагам. На первом шаге в нём один
 * файл: словарь. Всё остальное появится, когда появится, о чём писать.
 */
export const tree: FileTreeSpec = {
  root: 'service',
  open: {
    language: 'GLOSSARY.md',
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
];

export default deck;

import type { CodeDeck } from './types';
import type { LikeC4Spec } from './likec4';

/**
 * Колода шагов урока «DDD in action».
 *
 * ПРАВИЛО: код и вывод общие для всех локалей, поэтому они только на английском
 * и без объясняющих комментариев. Любая проза идёт в `narration` локализованного
 * урока — иначе русский комментарий вылезет на английской странице.
 *
 * Панели — настоящие файлы сервиса `examples/auth` из репозитория portolan,
 * подрезанные до того, что обсуждает шаг. Ничего написанного для урока в них нет.
 */

/**
 * Разбор ведёт модель из `likec4/`, а не нарисованная руками схема: урок
 * спускается по уровням вложенности, и раскладку таких картинок считает
 * генератор. Шаг без своего view оставляет предыдущую картинку.
 */
export const likec4: LikeC4Spec = {
  height: 460,
  views: {
    context: 'context',
  },
};

const deck: CodeDeck = [
  {
    id: 'context',
    lang: 'markdown',
    caption: 'README.md',
    code: `# Authentication & Sessions

Service \`auth\` — bounded context **auth**.

Owns *who someone is* and *whether they are still logged in*. It is the only
service in the estate that stores credentials, and the only one allowed to mint
or revoke a session.

## What it does not do

No profile data, no addresses, no payment instruments, no roles or scopes.
Other contexts hold their own view of a customer and reference it by opaque
user id; nothing outside \`auth\` ever sees a credential.`,
  },
];

export default deck;

export const locales = ['en', 'ru'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
};

/**
 * Строки интерфейса. Контент уроков сюда не попадает — он живёт в src/content.
 * Ключи плоские и осмысленные: переводчику видно, где строка живёт, без чтения кода.
 */
const ui = {
  en: {
    'site.title': 'Why',
    'site.tagline': 'Problems in software, shown one step at a time.',
    'nav.lessons': 'Lessons',
    'nav.language': 'Language',
    'nav.skip': 'Skip to content',
    'nav.theme': 'Switch theme',
    'nav.allLessons': 'All lessons',
    'nav.prevLesson': 'Previous',
    'nav.nextLesson': 'Next',
    'catalog.heading': 'Lessons',
    'catalog.empty': 'Nothing published yet.',
    'catalog.problem': 'The problem',
    'catalog.filter': 'Filter by tag',
    'catalog.allTags': 'All',
    'catalog.noMatch': 'No lessons with these tags.',
    'notFound.title': 'Page not found',
    'notFound.body': 'This page does not exist, or it moved. The catalog is below.',
    'lesson.incidents': 'It has already happened',
    'lesson.walkthrough': 'Walkthrough',
    'lesson.stepOf': 'Step {n} of {total}',
    'lesson.prev': 'Back',
    'lesson.next': 'Next',
    'lesson.output': 'Output',
    'lesson.copy': 'Copy code',
    'lesson.copied': 'Copied',
    'lesson.runInLean': 'Run in the Lean playground',
    'lesson.keyboardHint': 'Use ← and → to move between steps.',
    'lesson.files': 'Service files',
    'quiz.heading': 'Check yourself',
    'quiz.correct': 'Correct.',
    'quiz.wrong': 'Not quite.',
    'quiz.score': 'Answered {n} of {total}',
    'quiz.reset': 'Start over',
    'footer.source': 'Source',
  },
  ru: {
    'site.title': 'Why',
    'site.tagline': 'Проблемы в разработке, показанные по шагам.',
    'nav.lessons': 'Уроки',
    'nav.language': 'Язык',
    'nav.skip': 'К содержимому',
    'nav.theme': 'Сменить тему',
    'nav.allLessons': 'Все уроки',
    'nav.prevLesson': 'Предыдущий',
    'nav.nextLesson': 'Следующий',
    'catalog.heading': 'Уроки',
    'catalog.empty': 'Пока ничего не опубликовано.',
    'catalog.problem': 'Проблема',
    'catalog.filter': 'Фильтр по тегу',
    'catalog.allTags': 'Все',
    'catalog.noMatch': 'Уроков с такими тегами нет.',
    'notFound.title': 'Страница не найдена',
    'notFound.body': 'Такой страницы нет или она переехала. Каталог — ниже.',
    'lesson.incidents': 'Это уже случалось',
    'lesson.walkthrough': 'Разбор по шагам',
    'lesson.stepOf': 'Шаг {n} из {total}',
    'lesson.prev': 'Назад',
    'lesson.next': 'Дальше',
    'lesson.output': 'Вывод',
    'lesson.copy': 'Скопировать код',
    'lesson.copied': 'Скопировано',
    'lesson.runInLean': 'Запустить в песочнице Lean',
    'lesson.files': 'Файлы сервиса',
    'lesson.keyboardHint': 'Листать шаги можно стрелками ← и →.',
    'quiz.heading': 'Проверь себя',
    'quiz.correct': 'Верно.',
    'quiz.wrong': 'Не совсем.',
    'quiz.score': 'Отвечено {n} из {total}',
    'quiz.reset': 'Начать заново',
    'footer.source': 'Исходники',
  },
} satisfies Record<Locale, Record<string, string>>;

export type UIKey = keyof (typeof ui)['en'];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/**
 * Возвращает переводчик для локали. Недостающий ключ падает обратно на en,
 * чтобы незаконченный перевод не ронял страницу и был заметен глазом.
 */
export function useTranslations(locale: Locale) {
  return function t(key: UIKey, vars?: Record<string, string | number>): string {
    const raw = ui[locale][key] ?? ui[defaultLocale][key];
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
  };
}

/**
 * Префикс, под которым живёт сайт: пустая строка в корне домена и что-то вроде
 * `/why` под GitLab Pages. Astro отдаёт его с завершающим слешем, здесь он
 * лишний — слеш ставится ниже.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

/** Путь с префиксом локали. Все ссылки строятся только через неё. */
export function localePath(locale: Locale, path = ''): string {
  const clean = path.replace(/^\/+/, '');
  return clean ? `${BASE}/${locale}/${clean}/` : `${BASE}/${locale}/`;
}

/** Путь к файлу в public/. Тот же префикс, что и у страниц. */
export function assetPath(file: string): string {
  return `${BASE}/${file.replace(/^\/+/, '')}`;
}

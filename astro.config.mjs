import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import {
  transformerNotationHighlight,
  transformerNotationDiff,
  transformerNotationFocus,
} from '@shikijs/transformers';

/**
 * Адрес берётся из CI_PAGES_URL, который GitLab выдаёт джобе pages. Он бывает
 * двух видов: корень домена и подпуть вида https://user.gitlab.io/why. Второй
 * случай требует base, иначе все ссылки и шрифты уедут в корень и отдадут 404.
 *
 * Локально переменной нет — тогда плейсхолдер и пустой base.
 */
const PAGES_URL = new URL(process.env.CI_PAGES_URL ?? 'https://why.example.com');
const SITE = PAGES_URL.origin;
const BASE = PAGES_URL.pathname.replace(/\/+$/, '');

export default defineConfig({
  site: SITE,
  base: BASE || undefined,
  output: 'static',
  build: {
    /**
     * Стили всегда отдельным файлом в _astro/. Шрифты в нём подключены
     * относительным путём ../fonts/, и он обязан считаться от известной
     * глубины: при инлайне в HTML глубина стала бы разной у каждой страницы.
     */
    inlineStylesheets: 'never',
  },
  // Каталожные URL со слешем на конце — тогда canonical совпадает с тем,
  // что реально отдаёт статический хостинг.
  trailingSlash: 'always',

  // Симметричные префиксы: /en/... и /ru/..., корень редиректит на /en/.
  // prefixDefaultLocale:true выбран осознанно — без него ссылки и hreflang
  // приходится строить по двум разным правилам, и это главный источник багов в i18n.
  i18n: {
    locales: ['en', 'ru'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: true,
      // false — иначе Astro подставляет свою страницу-редирект с задержкой 2s.
      // Свой src/pages/index.astro редиректит мгновенно.
      redirectToDefaultLocale: false,
    },
  },

  integrations: [mdx(), react(), sitemap({ i18n: { defaultLocale: 'en', locales: { en: 'en', ru: 'ru' } } })],

  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      transformers: [
        // Подсветка строк задаётся комментарием в самом коде, а не номерами строк:
        // номера разъезжаются при любой правке примера, комментарий — нет.
        transformerNotationHighlight(),
        transformerNotationDiff(),
        transformerNotationFocus(),
      ],
    },
  },
});

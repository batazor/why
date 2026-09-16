import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import {
  transformerNotationHighlight,
  transformerNotationDiff,
  transformerNotationFocus,
} from '@shikijs/transformers';

// TODO: подставить реальный домен — от него зависят sitemap и canonical/hreflang.
const SITE = 'https://why.example.com';

export default defineConfig({
  site: SITE,
  output: 'static',
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

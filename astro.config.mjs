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
 * Адрес, по которому сайт будет жить. В CI его подставляет workflow: у GitHub
 * Pages это https://user.github.io/why, то есть подпуть, а не корень домена.
 * Подпуть требует base, иначе все ссылки и шрифты уедут в корень и отдадут 404.
 *
 * Локально переменной нет — тогда плейсхолдер и пустой base.
 */
const PAGES_URL = new URL(process.env.SITE_URL ?? 'https://why.example.com');
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

  vite: {
    /**
     * Зависимости схем объявлены заранее, а не обнаруживаются по ходу.
     *
     * Сгенерированный модуль LikeC4 грузится только на странице урока со
     * схемой — то есть позже старта. Vite, встретив в нём новые зависимости,
     * пересобирает их и меняет ревизию, а уже отданные браузеру модули
     * остаются со старой: они получают 504 Outdated Optimize Dep, острова не
     * гидрируются, и схема пропадает при живом сервере. Список гасит это в
     * корне: всё оптимизируется до первого запроса.
     */
    optimizeDeps: {
      include: [
        'likec4/react',
        '@likec4/core/model',
        /*
         * То же для остальных островов: дерево файлов редактора, React Flow
         * врезок и motion. Каждый из них впервые встречается на своей
         * странице, и без этого списка первый заход на неё давал тот же 504 —
         * у редактора оставалась одна корневая папка, у симулятора пустое
         * полотно.
         */
        '@vscode-elements/elements/dist/vscode-tree/index.js',
        '@vscode-elements/elements/dist/vscode-tree-item/index.js',
        '@xyflow/react',
        'motion',
        // Палитра песочницы анимируется React-обёрткой motion — она отдельный вход.
        'motion/react',
        '@tisoap/react-flow-smart-edge',
      ],
    },
  },

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

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Урок = нарратив (переводится) + колода шагов кода (НЕ переводится).
 *
 * Код намеренно лежит вне этого файла, в src/code/<slug>.ts, один на все локали.
 * Если положить код в переводимый файл, версии разъезжаются: правишь пример в en,
 * забываешь в ru, и получаешь баг, который воспроизводится только на одном языке.
 * Шаги связываются по `id`, консистентность проверяет `npm run check:steps`.
 */
const lessons = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/lessons' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Боль, ради которой урок существует. Выводится в карточке каталога. */
    problem: z.string(),
    tags: z.array(z.string()).default([]),
    /** Порядок в каталоге; одинаковый во всех локалях. */
    order: z.number().default(100),
    draft: z.boolean().default(false),
    /** Ключ колоды кода в src/code/. По умолчанию равен slug урока. */
    deck: z.string().optional(),
    /**
     * Тексты комментариев к коду. Код общий для всех локалей, поэтому
     * комментарии в нём стоят placeholder'ами `{{ключ}}`, а сами тексты живут
     * здесь — как и всё остальное, что является прозой.
     *
     * Набор ключей обязан совпадать между локалями; это проверяет check:steps.
     */
    comments: z.record(z.string(), z.string()).default({}),
    /**
     * Глоссарий урока: термин → определение. В тексте слово помечается
     * `<span data-term="ключ">`, определение подставляется на клиенте.
     *
     * Ключ отделён от написания намеренно: в тексте слово склоняется («маржу
     * по SKU»), а определение у него одно на все упоминания и все падежи.
     */
    terms: z.record(z.string(), z.string()).default({}),
    /**
     * Подписи на схеме. Схема, как и колода кода, общая для всех локалей,
     * поэтому проза в ней стоит placeholder'ами `{{ключ}}`, а тексты живут
     * здесь. Идентификаторы из кода (`POST /charge`, `Closed`, `idempotency_keys`)
     * placeholder'ами не оборачиваются: они одинаковы на всех языках.
     */
    labels: z.record(z.string(), z.string()).default({}),
    steps: z
      .array(
        z.object({
          /** Должен совпадать с id шага в колоде кода. */
          id: z.string(),
          title: z.string(),
          narration: z.string(),
          /**
           * Текст пометки поверх схемы. Нужен ровно тогда, когда в спеке схемы
           * для этого шага объявлена annotation — связь проверяет check:steps.
           */
          note: z.string().optional(),
          /**
           * Подписи для перетаскивания: текст карточки в нарративе и подсказка
           * в пустом слоте схемы. Нужны, когда схема объявляет `drop` на этом
           * шаге; связь проверяет check:steps.
           */
          drag: z
            .object({
              chip: z.string(),
              slot: z.string(),
            })
            .optional(),
        }),
      )
      .min(1),
    quiz: z
      .array(
        z.object({
          question: z.string(),
          options: z.array(z.string()).min(2),
          /** Индекс правильного варианта в `options`. */
          answer: z.number().int().nonnegative(),
          explanation: z.string(),
        }),
      )
      .default([]),
  }),
});

export const collections = { lessons };

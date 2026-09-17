import { inlineMarkdown } from './inline-markdown';

/**
 * Проза из frontmatter, разобранная на блоки: абзацы и списки.
 *
 * Полный markdown здесь не нужен — это несколько предложений, а не документ, —
 * но абзац и список встречаются постоянно: четыре области магазина или три
 * значения слова сплошным текстом читаются как поток, в котором приходится
 * искать, сколько их и где кончается одно.
 *
 * Блоки отделяются пустой строкой. Внутри блока переводы строк — это перенос
 * в исходнике, а не в тексте, поэтому строки склеиваются пробелом; блок,
 * начинающийся с «- », становится списком, и каждый его пункт может занимать
 * сколько угодно строк.
 *
 * Работает с обоими видами YAML-скаляров: у свёрнутого (`>-`) перевод строки
 * даёт только пустая строка, у буквального (`|-`) переводы сохраняются как
 * есть — в обоих случаях блоки и пункты определяются одинаково.
 */
export type ProseBlock = { kind: 'p'; html: string } | { kind: 'ul'; items: string[] };

export function proseBlocks(text: string): ProseBlock[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (!/^-\s/.test(block)) {
        return { kind: 'p', html: inlineMarkdown(block.replace(/\s*\n\s*/g, ' ')) };
      }

      const items: string[] = [];
      for (const line of block.split('\n')) {
        const item = /^-\s+(.*)$/.exec(line.trim());
        if (item) items.push(item[1]);
        else if (items.length) items[items.length - 1] += ` ${line.trim()}`;
      }

      return { kind: 'ul', items: items.map(inlineMarkdown) };
    });
}

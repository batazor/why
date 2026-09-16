import {
  transformerNotationHighlight,
  transformerNotationDiff,
  transformerNotationFocus,
  transformerNotationMap,
} from '@shikijs/transformers';

/**
 * Набор нотаций `[!code …]`, понимаемых в примерах кода.
 *
 * Один список на двоих: по нему рендерит StepPlayer и по нему же
 * scripts/check-steps.mjs проверяет, что ни один маркер не утёк в текст. Две
 * копии разъехались бы, и проверка начала бы ругаться на живую нотацию.
 */
export const codeTransformers = () => [
  transformerNotationHighlight(),
  transformerNotationDiff(),
  transformerNotationFocus(),
  /**
   * `-- [!code pass]` вешает на строку класс зелёной галки — маркер в гуттере,
   * как в IDE. Нотация это комментарий, поэтому из показанного кода она
   * вырезается: читатель видит ту же строку, что скомпилировал Lean.
   */
  transformerNotationMap({ classMap: { pass: 'line--pass' } }),
];

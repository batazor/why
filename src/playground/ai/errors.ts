import type { T } from '../i18n';

/**
 * Ошибка разговора с моделью — одной из нескольких понятных причин.
 *
 * Отдельным модулем, чтобы панель знала о ней, не подтягивая AI SDK: сам SDK
 * грузится, только когда человек впервые спрашивает интервьюера.
 */
export class AiError extends Error {
  constructor(
    readonly reason: 'key' | 'rate' | 'refusal' | 'network' | 'other',
    message: string,
  ) {
    super(message);
  }
}

/** Ошибка — словами: что не так и что с этим делать. */
export function explainAiError(reason: unknown, t: T): string {
  if (reason instanceof AiError) return t(`ai.error.${reason.reason}`, { detail: reason.message });
  return t('ai.error.other', { detail: (reason as Error)?.message ?? String(reason) });
}

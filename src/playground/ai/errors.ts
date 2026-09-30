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

import type { CodeDeck } from './types';
// Расширение обязательно: колоду импортирует ещё и node-скрипт проверки.
import posterSpec from './circuit-breaker.poster.ts';
import flowSpec from './circuit-breaker.flow.ts'; // расширение обязательно: колоду импортирует ещё и node-скрипт проверки

/**
 * Урок про circuit breaker. Главное здесь — не код, а состояния, поэтому
 * ведущий элемент — схема src/code/circuit-breaker.flow.ts, а код есть не у
 * каждого шага. Шаг без кода — легальный случай.
 *
 * ПРАВИЛО (как и везде): код, вывод и подписи на схеме общие для всех локалей,
 * значит только английские. Проза — в `narration` локализованного урока.
 */
export const flow = flowSpec;

/** Постер: суть проблемы одной схемой — карточка каталога и блок «Проблема». */
export const poster = posterSpec;

const deck: CodeDeck = [
  {
    id: 'cascade',
    lang: 'ts',
    caption: 'client.ts',
    code: `for (const attempt of [1, 2, 3, 4, 5]) {
  try {
    return await paymentsApi.charge(order); // [!code highlight]
  } catch {
    await sleep(attempt * 200);
  }
}`,
    output: `payments api: 2 000 rps in, 100% failing
callers:     5 attempts each -> 10 000 rps of pure load
recovery:    never — the retries are the outage now`,
    outputTone: 'bad',
  },
  {
    id: 'closed',
    lang: 'ts',
    caption: 'breaker.ts',
    code: `const breaker = new CircuitBreaker(paymentsApi.charge, {
  failureThreshold: 5,   // [!code highlight]
  cooldownMs: 30_000,    // [!code highlight]
  halfOpenProbes: 1,     // [!code highlight]
});`,
  },
  {
    id: 'open',
  },
  {
    id: 'halfopen',
  },
  {
    id: 'recover',
    lang: 'ts',
    caption: 'breaker.ts',
    code: `async call(...args) {
  if (this.state === 'open') {
    if (Date.now() < this.openedAt + this.cooldownMs)
      throw new CircuitOpenError();      // [!code highlight]
    this.state = 'half-open';
  }

  try {
    const result = await this.fn(...args);
    this.state = 'closed';               // [!code highlight]
    this.failures = 0;
    return result;
  } catch (error) {
    if (this.state === 'half-open' || ++this.failures >= this.threshold) {
      this.state = 'open';               // [!code highlight]
      this.openedAt = Date.now();
    }
    throw error;
  }
}`,
  },
];

export default deck;

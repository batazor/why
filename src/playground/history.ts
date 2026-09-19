import { useCallback, useRef, useState } from 'react';
import type { Design } from './model';

/**
 * Проект с историей правок: Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y).
 *
 * В историю попадает всё, что человек нарисовал и написал: блоки, связи,
 * требования, маршруты, задание, сценарий. Не попадает сессия — сигналы,
 * оценки, таймер, открытые подсказки: отмена у кандидата не должна стирать
 * журнал интервьюера. Правка, которая трогает только сессию, записи в
 * истории не создаёт.
 *
 * Перетаскивание блока — это сотни правок позиции, набор текста — правка на
 * каждую букву. Поэтому правки, идущие подряд без паузы, склеиваются в один
 * шаг: отмена возвращает блок туда, откуда его потащили, а не на пиксель назад.
 */

/** Пауза, после которой следующая правка — уже новый шаг истории. */
const GAP_MS = 500;
/** Сколько шагов помнить: снимок — весь проект, память не бесконечная. */
const LIMIT = 100;

type Snapshot = Omit<Design, 'session' | 'updatedAt'>;

function snapshot(design: Design): Snapshot {
  const { session: _session, updatedAt: _updatedAt, ...rest } = design;
  return rest;
}

/** Изменилось ли что-то кроме сессии. Правки неизменяемые, поэтому хватает сравнения ссылок. */
function contentChanged(before: Design, after: Design): boolean {
  const a = snapshot(before) as Record<string, unknown>;
  const b = snapshot(after) as Record<string, unknown>;
  return Object.keys({ ...a, ...b }).some((key) => a[key] !== b[key]);
}

export function useDesignHistory() {
  const [design, setDesign] = useState<Design | null>(null);
  /**
   * Текущий проект держится ещё и в ref: историю пишут вне функции
   * обновления состояния, а несколько правок за один тик (правка человека
   * плюс сигнал) должны видеть друг друга.
   */
  const current = useRef<Design | null>(null);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastEdit = useRef(0);
  const [, setVersion] = useState(0);

  const commit = (next: Design) => {
    current.current = next;
    setDesign(next);
  };

  /** Открыть проект: история начинается заново. */
  const load = useCallback((next: Design) => {
    past.current = [];
    future.current = [];
    lastEdit.current = 0;
    commit(next);
    setVersion((value) => value + 1);
  }, []);

  const update = useCallback((fn: (design: Design) => Design) => {
    const before = current.current;
    if (!before) return;
    const after = { ...fn(before), updatedAt: new Date().toISOString() };

    if (contentChanged(before, after)) {
      const now = Date.now();
      if (now - lastEdit.current > GAP_MS) {
        past.current = [...past.current, snapshot(before)].slice(-LIMIT);
        future.current = [];
        setVersion((value) => value + 1);
      }
      lastEdit.current = now;
    }
    commit(after);
  }, []);

  /** Шаг назад или вперёд: снимок подменяет содержимое, сессия остаётся текущей. */
  const step = useCallback((from: typeof past, to: typeof future) => {
    const now = current.current;
    const target = from.current[from.current.length - 1];
    if (!now || !target) return;
    from.current = from.current.slice(0, -1);
    to.current = [...to.current, snapshot(now)];
    // Следующая правка после отмены — всегда новый шаг, а не продолжение старого.
    lastEdit.current = 0;
    commit({ ...target, session: now.session, updatedAt: new Date().toISOString() });
    setVersion((value) => value + 1);
  }, []);

  const undo = useCallback(() => step(past, future), [step]);
  const redo = useCallback(() => step(future, past), [step]);

  /** Сбросить историю, не трогая проект: при смене роли чужие шаги отменять нельзя. */
  const forget = useCallback(() => {
    past.current = [];
    future.current = [];
    lastEdit.current = 0;
    setVersion((value) => value + 1);
  }, []);

  return {
    design,
    load,
    update,
    undo,
    redo,
    forget,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}

import { useSyncExternalStore } from 'react';

/**
 * Документ требований, который читатель собирает сам.
 *
 * Врезок с ним на странице несколько: чипы под текстом каждого шага и таблица в
 * колонке рядом. Это разные острова, у каждого свой React, — общее у них
 * только модуль. Поэтому состояние живёт здесь, на уровне модуля: все острова
 * страницы импортируют один и тот же экземпляр.
 *
 * Состояние переживает перезагрузку: документ, собранный за двадцать шагов, не
 * должен пропасть от обновления страницы. Хранилище браузера может быть
 * недоступно (приватное окно, запрет сайта) — тогда документ живёт до
 * перезагрузки, а не падает.
 */

type Store = {
  placed: ReadonlySet<string>;
  /** Последнее, что положили: строка подсвечивается, чтобы было видно куда. */
  last: string | null;
};

const stores = new Map<string, { state: Store; listeners: Set<() => void> }>();

function storageKey(name: string) {
  return `why:requirements:${name}`;
}

function read(name: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(name));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function slot(name: string) {
  let entry = stores.get(name);
  if (!entry) {
    entry = {
      state: { placed: typeof window === 'undefined' ? new Set() : read(name), last: null },
      listeners: new Set(),
    };
    stores.set(name, entry);
  }
  return entry;
}

function commit(name: string, placed: Set<string>, last: string | null) {
  const entry = slot(name);
  entry.state = { placed, last };
  try {
    localStorage.setItem(storageKey(name), JSON.stringify([...placed]));
  } catch {
    // Хранилище недоступно: документ живёт до перезагрузки.
  }
  entry.listeners.forEach((listener) => listener());
}

/** Положить в документ: строку (`row:FR-1`) или цель строки (`goal:NFR-2`). */
export function place(name: string, keys: string[]) {
  const entry = slot(name);
  const fresh = keys.filter((key) => !entry.state.placed.has(key));
  if (!fresh.length) return;
  commit(name, new Set([...entry.state.placed, ...fresh]), fresh[fresh.length - 1]);
}

/** Начать документ заново. */
export function clear(name: string) {
  commit(name, new Set(), null);
}

const EMPTY: Store = { placed: new Set(), last: null };

export function useRequirements(name: string): Store {
  return useSyncExternalStore(
    (listener) => {
      const entry = slot(name);
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    () => slot(name).state,
    // На сервере документа нет: рендерится пустым, заполняется на клиенте.
    () => EMPTY,
  );
}

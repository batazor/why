import type { Board, Signal } from '../model';

/**
 * Журнал собеседования, как его видит интервьюер.
 *
 * В журнале лежат записи, а не состояние: сигнал «ушёл с вкладки» попадает
 * туда дважды — когда человек ушёл и когда вернулся. Здесь записи сводятся
 * обратно в список сигналов и в ленту снимков доски.
 *
 * Время везде серверное — момент записи, а не то, что сказали часы
 * кандидата: их можно перевести, запись задним числом — нет.
 */

export interface JournalRow {
  id: number;
  kind: 'signal' | 'board';
  payload: unknown;
  created_at: string;
}

export interface JournalEntry {
  id: number;
  kind: 'signal' | 'board';
  payload: unknown;
  /** Время записи на сервере. */
  at: string;
}

export interface Snapshot {
  at: string;
  board: Board;
}

export const toEntry = (row: JournalRow): JournalEntry => ({
  id: row.id,
  kind: row.kind,
  payload: row.payload,
  at: row.created_at,
});

/** Добавить записи, пришедшие по Realtime, без повторов и по порядку сервера. */
export function merge(journal: JournalEntry[], incoming: JournalEntry[]): JournalEntry[] {
  const known = new Set(journal.map((entry) => entry.id));
  const fresh = incoming.filter((entry) => !known.has(entry.id));
  return fresh.length ? [...journal, ...fresh].sort((a, b) => a.id - b.id) : journal;
}

/**
 * Сигналы из журнала. Поля — из последней записи сигнала, время — серверное:
 * `at` — когда сигнал впервые записан, `back` — когда впервые записан возврат.
 */
export function signalsFrom(journal: JournalEntry[]): Signal[] {
  const order: string[] = [];
  const byId = new Map<string, Signal>();
  for (const entry of journal) {
    if (entry.kind !== 'signal') continue;
    const signal = entry.payload as Signal;
    if (!signal?.id) continue;
    const seen = byId.get(signal.id);
    if (!seen) order.push(signal.id);
    byId.set(signal.id, {
      ...signal,
      at: seen?.at ?? entry.at,
      back: signal.back ? (seen?.back ?? entry.at) : undefined,
    });
  }
  return order.map((id) => byId.get(id)!);
}

export function snapshotsFrom(journal: JournalEntry[]): Snapshot[] {
  return journal
    .filter((entry) => entry.kind === 'board')
    .map((entry) => ({ at: entry.at, board: entry.payload as Board }));
}

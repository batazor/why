import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';
import type { Person } from './auth';
import type { BoardView, Role } from '../roles';

/**
 * Присутствие и курсоры: кто ещё смотрит на то же, что и я, и где у него
 * курсор. Как в Miro: стрелка с именем, у каждого свой цвет.
 *
 * Общее для двух каналов:
 * - комната собеседования (`room:<id>`, см. room.ts) — там поверх этого ещё
 *   ходят доска и ход собеседования;
 * - сценарий пространства (`scenario:<id>`, хук ниже) — коллеги, открывшие
 *   один сценарий, видят друг друга; сценарий каждый сохраняет сам, по
 *   каналу ходят только присутствие и курсоры.
 *
 * Курсор уходит в координатах схемы, а не экрана: у другого человека другой
 * масштаб и другой размер окна, и точка на экране указывала бы мимо блока.
 */

export interface Peer {
  /** Ключ присутствия: один человек в двух вкладках — два участника. */
  key: string;
  person: Person;
  role: Role;
  /** Какая доска у него на полотне: курсор над другой доской показывать незачем. */
  board?: BoardView;
}

export interface Point {
  x: number;
  y: number;
}

export type LiveStatus = 'connecting' | 'live' | 'error';

/** Что каждый сообщает о себе в канале. */
export interface PresenceMeta {
  person: Person;
  role: Role;
  board?: BoardView;
}

/** Курсор чаще 20 раз в секунду не нужен: глаз не заметит, а лимиты канала заметят. */
const CURSOR_MS = 50;

/** Вкладка — отдельный участник: так проще проверить канал одной учёткой в двух окнах. */
const TAB = crypto.randomUUID().slice(0, 8);

export const presenceKey = (me: Person | null) => (me ? `${me.id}:${TAB}` : '');

/**
 * Новый канал на тему. realtime-js на `channel()` с тем же именем отдаёт уже
 * существующий канал — а прошлый, упавший или ещё закрывающийся, заново не
 * подпишется. Поэтому старый сначала убираем и ждём, пока уйдёт.
 */
export async function freshChannel(client: SupabaseClient, topic: string, key: string): Promise<RealtimeChannel> {
  const stale = client.getChannels().find((ch) => ch.topic === `realtime:${topic}`);
  if (stale) await client.removeChannel(stale);
  return client.channel(topic, { config: { private: true, broadcast: { self: false }, presence: { key } } });
}

/**
 * Канал упал — подключиться заново. Падает он не только от сети: токен
 * истекает раз в час, а в фоновой вкладке или после сна ноутбука его не
 * успевают обновить, и сервер закрывает приватный канал. Без повтора человек
 * так и сидел бы один в комнате, хотя остальные давно в ней.
 *
 * Повтор — с растущей паузой, а сразу — когда вкладку снова открыли или
 * вернулась сеть. Возвращает номер попытки: эффект канала зависит от него.
 */
export function useReconnect(status: LiveStatus): number {
  const [attempt, setAttempt] = useState(0);
  const failures = useRef(0);
  useEffect(() => {
    if (status === 'live') failures.current = 0;
    if (status !== 'error') return;
    const retry = () => setAttempt((value) => value + 1);
    const onVisible = () => !document.hidden && retry();
    const timer = setTimeout(retry, Math.min(30_000, 1000 * 2 ** failures.current++));
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', retry);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', retry);
    };
  }, [status]);
  return attempt;
}

/** Все в канале, кроме себя. */
export function peersOf(channel: RealtimeChannel, me: string): Peer[] {
  return Object.entries(channel.presenceState<PresenceMeta>())
    .filter(([key]) => key !== me)
    .map(([key, [meta]]) => ({ key, person: meta.person, role: meta.role, board: meta.board }));
}

/**
 * Цвет участника — по его id: один и тот же во всех вкладках и у всех, кто
 * его видит. Цвета такие, чтобы белая подпись читалась на каждом.
 */
const PALETTE = ['#e03131', '#f76707', '#2f9e44', '#0c8599', '#1971c2', '#4c6ef5', '#7048e8', '#d6336c'];

export function colorOf(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/**
 * Свой курсор в канал: последняя точка уходит не чаще CURSOR_MS, `null` —
 * курсор ушёл с полотна. Канал и «в эфире ли» — через ref: они меняются
 * без перерисовки.
 */
export function useCursorSender(channel: { current: RealtimeChannel | null }, live: { current: boolean }, key: string) {
  const pending = useRef<Point | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return useCallback(
    (point: Point | null) => {
      if (!live.current) return;
      pending.current = point;
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        if (pending.current === undefined) return;
        channel.current?.send({ type: 'broadcast', event: 'cursor', payload: { from: key, point: pending.current } });
        pending.current = undefined;
      }, CURSOR_MS);
    },
    [channel, live, key],
  );
}

interface Options {
  /** Имя канала, например `scenario:<id>`; null — присутствия нет. */
  topic: string | null;
  me: Person | null;
  role: Role;
  board: BoardView;
}

/**
 * Присутствие над сценарием пространства: кто ещё его открыл и где у него
 * курсор. Ничего, кроме этого, по каналу не ходит.
 */
export function usePresence({ topic, me, role, board }: Options) {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [cursors, setCursors] = useState<Record<string, Point>>({});

  const channel = useRef<RealtimeChannel | null>(null);
  const live = useRef(false);
  const key = presenceKey(me);

  // Обработчики канала живут дольше рендера — свежее «о себе» берут из ref.
  const meta = useRef<PresenceMeta | null>(null);
  meta.current = me ? { person: me, role, board } : null;

  const attempt = useReconnect(status);

  useEffect(() => {
    const client = supabase();
    if (!client || !topic || !me) return;
    let alive = true;
    let ch: RealtimeChannel | null = null;
    setStatus('connecting');

    (async () => {
      // Приватному каналу нужен токен пользователя: без него сервер откажет в подписке.
      await client.realtime.setAuth();
      if (!alive) return;
      const created = await freshChannel(client, topic, key);
      if (!alive) return void client.removeChannel(created);
      ch = created;
      channel.current = created;

      created
        .on('presence', { event: 'sync' }, () => setPeers(peersOf(created, key)))
        .on('presence', { event: 'leave' }, ({ key: left }) => {
          setCursors(({ [left]: _gone, ...rest }) => rest);
        })
        .on('broadcast', { event: 'cursor' }, ({ payload }) => {
          const { from, point } = payload as { from: string; point: Point | null };
          setCursors(({ [from]: _old, ...rest }) => (point ? { ...rest, [from]: point } : rest));
        })
        .subscribe(async (state) => {
          if (!alive) return;
          if (state === 'SUBSCRIBED') {
            live.current = true;
            setStatus('live');
            if (meta.current) await created.track(meta.current);
          } else {
            // Ошибка, таймаут или сервер закрыл канал сам — useReconnect подключит заново.
            live.current = false;
            setPeers([]);
            setStatus('error');
          }
        });
    })();

    return () => {
      alive = false;
      live.current = false;
      channel.current = null;
      setPeers([]);
      setCursors({});
      if (ch) client.removeChannel(ch);
    };
  }, [topic, me, key, attempt]);

  // Сменил роль или доску — остальные должны это увидеть.
  useEffect(() => {
    if (live.current && me) channel.current?.track({ person: me, role, board });
  }, [me, role, board]);

  const sendCursor = useCursorSender(channel, live, key);

  return { enabled: Boolean(topic && me), status, peers, cursors, sendCursor };
}

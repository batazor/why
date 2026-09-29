import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';
import type { Person } from './auth';
import { pickBoard, type Board, type Design } from '../model';
import type { Role } from '../roles';

/**
 * Комната собеседования: один канал Supabase Realtime на прохождение.
 *
 * Что по нему ходит:
 * - presence — кто в комнате и в какой роли;
 * - broadcast `cursor` — курсор на полотне, в координатах схемы, а не экрана:
 *   у интервьюера другой масштаб и другой размер окна, и точка на экране
 *   указывала бы мимо блока;
 * - broadcast `board` — доска кандидата. Доска течёт в одну сторону: рисует
 *   только кандидат, интервьюер её смотрит (editBoard: false в roles.ts),
 *   поэтому сливать правки двух сторон не нужно — последняя доска и есть правда.
 *
 * Канал приватный: подписаться может только вошедший пользователь (политики
 * RLS на realtime.messages, см. supabase/README.md). Имя комнаты — случайный
 * UUID, угадать его нельзя; этого пока хватает вместо списка приглашённых.
 */

export interface Peer {
  /** Ключ присутствия: один человек в двух вкладках — два участника. */
  key: string;
  person: Person;
  role: Role;
}

export interface Point {
  x: number;
  y: number;
}

export type RoomStatus = 'connecting' | 'live' | 'error';

interface BoardMessage {
  designId: string;
  board: Board;
}

const PARAM = 'room';
/** Курсор чаще 20 раз в секунду не нужен: глаз не заметит, а лимиты канала заметят. */
const CURSOR_MS = 50;
/** Доска тяжелее курсора: при перетаскивании блока хватит пяти снимков в секунду. */
const BOARD_MS = 200;

export function roomFromUrl(): string | null {
  const room = new URL(location.href).searchParams.get(PARAM);
  return room && /^[\w-]{8,64}$/.test(room) ? room : null;
}

function setRoomInUrl(room: string | null) {
  const url = new URL(location.href);
  if (room) url.searchParams.set(PARAM, room);
  else url.searchParams.delete(PARAM);
  history.replaceState(null, '', url);
}

export function openRoom(): string {
  const room = crypto.randomUUID();
  setRoomInUrl(room);
  return room;
}

export function closeRoom() {
  setRoomInUrl(null);
}

/** Вкладка — отдельный участник: так проще проверить комнату одной учёткой в двух окнах. */
const TAB = crypto.randomUUID().slice(0, 8);

interface Options {
  room: string | null;
  me: Person | null;
  role: Role;
  design: Design | null;
  /** Интервьюеру пришла доска кандидата. */
  onBoard: (message: BoardMessage) => void;
}

export function useRoom({ room, me, role, design, onBoard }: Options) {
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [cursors, setCursors] = useState<Record<string, Point>>({});

  const channel = useRef<RealtimeChannel | null>(null);
  const live = useRef(false);
  const key = me ? `${me.id}:${TAB}` : '';

  // Обработчики канала живут дольше рендера — свежие значения берут из ref.
  const roleRef = useRef(role);
  roleRef.current = role;
  const designRef = useRef(design);
  designRef.current = design;
  const onBoardRef = useRef(onBoard);
  onBoardRef.current = onBoard;

  const sendBoard = useCallback(() => {
    const current = designRef.current;
    if (!live.current || roleRef.current !== 'candidate' || !current) return;
    const payload: BoardMessage = { designId: current.id, board: pickBoard(current) };
    channel.current?.send({ type: 'broadcast', event: 'board', payload });
  }, []);

  useEffect(() => {
    const client = supabase();
    if (!client || !room || !me) return;
    let alive = true;
    setStatus('connecting');

    const ch = client.channel(`room:${room}`, {
      config: { private: true, broadcast: { self: false }, presence: { key } },
    });
    channel.current = ch;

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<{ person: Person; role: Role }>();
      setPeers(
        Object.entries(state)
          .filter(([name]) => name !== key)
          .map(([name, metas]) => ({ key: name, person: metas[0].person, role: metas[0].role })),
      );
    })
      .on('presence', { event: 'join' }, ({ key: joined }) => {
        // Пришедший позже не видел ни одной правки — отдаём ему доску сразу, без ожидания следующей.
        if (joined !== key) sendBoard();
      })
      .on('presence', { event: 'leave' }, ({ key: left }) => {
        setCursors(({ [left]: _gone, ...rest }) => rest);
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        const { from, point } = payload as { from: string; point: Point | null };
        setCursors(({ [from]: _old, ...rest }) => (point ? { ...rest, [from]: point } : rest));
      })
      .on('broadcast', { event: 'board' }, ({ payload }) => {
        if (roleRef.current === 'interviewer') onBoardRef.current(payload as BoardMessage);
      });

    (async () => {
      // Приватному каналу нужен токен пользователя: без него сервер откажет в подписке.
      await client.realtime.setAuth();
      if (!alive) return;
      ch.subscribe(async (state) => {
        if (!alive) return;
        if (state === 'SUBSCRIBED') {
          live.current = true;
          setStatus('live');
          await ch.track({ person: me, role: roleRef.current });
          sendBoard();
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
          live.current = false;
          setStatus('error');
        } else if (state === 'CLOSED') {
          live.current = false;
        }
      });
    })();

    return () => {
      alive = false;
      live.current = false;
      channel.current = null;
      setPeers([]);
      setCursors({});
      client.removeChannel(ch);
    };
  }, [room, me, key, sendBoard]);

  // Сменил роль — остальные должны это увидеть.
  useEffect(() => {
    if (live.current && me) channel.current?.track({ person: me, role });
  }, [role, me]);

  /** Доска кандидата уходит по мере правок, но не чаще BOARD_MS. */
  const boardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (role !== 'candidate' || !design || boardTimer.current) return;
    boardTimer.current = setTimeout(() => {
      boardTimer.current = null;
      sendBoard();
    }, BOARD_MS);
  }, [role, design?.nodes, design?.edges, design?.requirements, design?.api, design?.estimate, sendBoard]);
  useEffect(() => () => {
    if (boardTimer.current) clearTimeout(boardTimer.current);
  }, []);

  /** Курсор: последняя точка уходит не чаще CURSOR_MS, `null` — курсор ушёл с полотна. */
  const pending = useRef<Point | null | undefined>(undefined);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendCursor = useCallback(
    (point: Point | null) => {
      if (!live.current) return;
      pending.current = point;
      if (cursorTimer.current) return;
      cursorTimer.current = setTimeout(() => {
        cursorTimer.current = null;
        if (pending.current === undefined) return;
        channel.current?.send({ type: 'broadcast', event: 'cursor', payload: { from: key, point: pending.current } });
        pending.current = undefined;
      }, CURSOR_MS);
    },
    [key],
  );

  return { status, peers, cursors, sendCursor };
}

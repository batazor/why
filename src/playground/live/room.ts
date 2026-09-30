import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';
import type { Person } from './auth';
import { pickBoard, type Board, type Design } from '../model';
import { course, type Course } from './cloud';
import { toEntry, type JournalEntry, type JournalRow } from './journal';
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
 * - broadcast `course` — ход собеседования: начал, закончил, открыл
 *   калькулятор, открыл подсказку, задал вопрос. Шлёт любой из ведущих;
 *   кандидат по нему ведёт таймер и видит открытые подсказки, другие ведущие —
 *   держат общую картину. Одно и то же состояние дважды не шлётся, иначе
 *   двое ведущих перекидывали бы его друг другу без конца;
 * - postgres_changes по interview_events — новые записи журнала. Их шлёт
 *   сама база после записи, а не кандидат, и только тем, кому журнал читать
 *   можно (RLS): кандидату они не приходят.
 *
 * Комната — это собеседование: канал `room:<id собеседования>` приватный, и
 * сервер пускает в него только участников (политики RLS на realtime.messages,
 * см. supabase/README.md). Сообщения живут только в канале; то, что должно
 * пережить перезагрузку, сохраняет InterviewRepository.
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

/** Курсор чаще 20 раз в секунду не нужен: глаз не заметит, а лимиты канала заметят. */
const CURSOR_MS = 50;
/** Доска тяжелее курсора: при перетаскивании блока хватит пяти снимков в секунду. */
const BOARD_MS = 200;

/** Вкладка — отдельный участник: так проще проверить комнату одной учёткой в двух окнах. */
const TAB = crypto.randomUUID().slice(0, 8);

interface Options {
  room: string | null;
  me: Person | null;
  role: Role;
  design: Design | null;
  /** Интервьюеру пришла доска кандидата. */
  onBoard: (message: BoardMessage) => void;
  /** Кандидату пришёл ход собеседования. */
  onCourse: (course: Course) => void;
  /** Интервьюеру пришла новая запись журнала. */
  onJournal?: (entry: JournalEntry) => void;
}

export function useRoom({ room, me, role, design, onBoard, onCourse, onJournal }: Options) {
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
  const onCourseRef = useRef(onCourse);
  onCourseRef.current = onCourse;
  /** Последний известный ход — свой отправленный или чужой пришедший. */
  const lastCourse = useRef('');
  const onJournalRef = useRef(onJournal);
  onJournalRef.current = onJournal;

  /** Каждая сторона отдаёт своё: кандидат — доску, интервьюер — ход собеседования. */
  const sendOwn = useCallback(() => {
    const current = designRef.current;
    if (!live.current || !current) return;
    if (roleRef.current === 'candidate') {
      const payload: BoardMessage = { designId: current.id, board: pickBoard(current) };
      channel.current?.send({ type: 'broadcast', event: 'board', payload });
    } else if (roleRef.current === 'interviewer') {
      const payload = course(current);
      lastCourse.current = JSON.stringify(payload);
      channel.current?.send({ type: 'broadcast', event: 'course', payload });
    }
  }, []);

  /** Отдать ход, только если он поменялся с последнего известного. */
  const sendCourse = useCallback(() => {
    const current = designRef.current;
    if (!current || roleRef.current !== 'interviewer') return;
    if (JSON.stringify(course(current)) !== lastCourse.current) sendOwn();
  }, [sendOwn]);

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
        // Пришедший позже не видел ни одной правки — отдаём ему своё сразу, без ожидания следующей.
        if (joined !== key) sendOwn();
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
      })
      .on('broadcast', { event: 'course' }, ({ payload }) => {
        lastCourse.current = JSON.stringify(payload);
        onCourseRef.current(payload as Course);
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'interview_events', filter: `interview_id=eq.${room}` },
        ({ new: row }) => onJournalRef.current?.(toEntry(row as JournalRow)),
      );

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
          sendOwn();
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
  }, [room, me, key, sendOwn]);

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
      sendOwn();
    }, BOARD_MS);
  }, [role, design?.nodes, design?.edges, design?.requirements, design?.api, design?.estimate, sendOwn]);

  // Ход собеседования меняется редко — отдаём сразу.
  useEffect(() => {
    sendCourse();
  }, [
    role,
    design?.session.startedAt,
    design?.session.finishedAt,
    design?.session.calcUnlockedAt,
    design?.session.revealed,
    design?.session.asked,
    design?.session.estimateSnapshot,
    sendCourse,
  ]);
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

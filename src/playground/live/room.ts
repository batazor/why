import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';
import type { Person } from './auth';
import { pickBoard, type Board, type Design } from '../model';
import { course, type Course } from './interviews';
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
 * - broadcast `board` — доска кандидата. Рисует тот, у кого ручка (`pen`):
 *   обычно кандидат, иногда интервьюер берёт её показать мысль. В каждый
 *   момент рисует кто-то один, поэтому сливать правки не нужно — последняя
 *   доска и есть правда. Сохраняет доску всегда клиент кандидата: писать в
 *   interview_boards может только он;
 * - broadcast `pen` — у кого ручка;
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

/**
 * Ручка: кто сейчас рисует на доске кандидата. По умолчанию — сам кандидат;
 * интервьюер может взять её («давайте добавим сюда кэш») и вернуть. Доску
 * по комнате шлёт тот, у кого ручка, остальные её принимают — так две
 * стороны никогда не правят одну доску одновременно, и сливать нечего.
 */
export type Pen = { holder: 'candidate' } | { holder: 'interviewer'; key: string; name: string };

const CANDIDATE_PEN: Pen = { holder: 'candidate' };

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
  const keyRef = useRef(key);
  keyRef.current = key;

  const [pen, setPenState] = useState<Pen>(CANDIDATE_PEN);
  const penRef = useRef<Pen>(CANDIDATE_PEN);
  const setPen = useCallback((next: Pen) => {
    penRef.current = next;
    setPenState(next);
  }, []);
  /** Моя ли сейчас ручка: кандидата по умолчанию или именно этой вкладки интервьюера. */
  const holdsPen = useCallback(
    () => (penRef.current.holder === 'candidate' ? roleRef.current === 'candidate' : penRef.current.key === keyRef.current),
    [],
  );

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

  /** Доску шлёт тот, у кого ручка. */
  const sendBoard = useCallback(() => {
    const current = designRef.current;
    if (!live.current || !current || !holdsPen()) return;
    const payload: BoardMessage = { designId: current.id, board: pickBoard(current) };
    channel.current?.send({ type: 'broadcast', event: 'board', payload });
  }, [holdsPen]);

  /** Ход собеседования и ручку шлёт интервьюер. */
  const sendCourseNow = useCallback(() => {
    const current = designRef.current;
    if (!live.current || !current || roleRef.current !== 'interviewer') return;
    const payload = course(current);
    lastCourse.current = JSON.stringify(payload);
    channel.current?.send({ type: 'broadcast', event: 'course', payload });
    channel.current?.send({ type: 'broadcast', event: 'pen', payload: penRef.current });
  }, []);

  /** Каждая сторона отдаёт своё: доску — у кого ручка, ход — интервьюер. */
  const sendOwn = useCallback(() => {
    sendBoard();
    sendCourseNow();
  }, [sendBoard, sendCourseNow]);

  /** Отдать ход, только если он поменялся с последнего известного. */
  const sendCourse = useCallback(() => {
    const current = designRef.current;
    if (!current || roleRef.current !== 'interviewer') return;
    if (JSON.stringify(course(current)) !== lastCourse.current) sendCourseNow();
  }, [sendCourseNow]);

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
        // Ушёл тот, у кого ручка, — доска снова у кандидата, а не повисла ничьей.
        if (penRef.current.holder === 'interviewer' && penRef.current.key === left) setPen(CANDIDATE_PEN);
      })
      .on('broadcast', { event: 'pen' }, ({ payload }) => setPen(payload as Pen))
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        const { from, point } = payload as { from: string; point: Point | null };
        setCursors(({ [from]: _old, ...rest }) => (point ? { ...rest, [from]: point } : rest));
      })
      .on('broadcast', { event: 'board' }, ({ payload }) => {
        // Доску шлёт тот, у кого ручка; кто не рисует — принимает.
        if (!holdsPen()) onBoardRef.current(payload as BoardMessage);
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
  }, [room, me, key, sendOwn, holdsPen, setPen]);

  // Сменил роль — остальные должны это увидеть.
  useEffect(() => {
    if (live.current && me) channel.current?.track({ person: me, role });
  }, [role, me]);

  /** Доска кандидата уходит по мере правок, но не чаще BOARD_MS. */
  const boardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!design || !holdsPen() || boardTimer.current) return;
    boardTimer.current = setTimeout(() => {
      boardTimer.current = null;
      sendBoard();
    }, BOARD_MS);
  }, [role, pen, design?.nodes, design?.edges, design?.requirements, design?.api, design?.estimate, sendBoard, holdsPen]);

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

  /** Интервьюер берёт доску — кандидат видит, что рисует он, и ждёт. */
  const takePen = useCallback(() => {
    if (!me || roleRef.current !== 'interviewer') return;
    const next: Pen = { holder: 'interviewer', key: keyRef.current, name: me.name };
    setPen(next);
    channel.current?.send({ type: 'broadcast', event: 'pen', payload: next });
  }, [me, setPen]);

  const returnPen = useCallback(() => {
    setPen(CANDIDATE_PEN);
    channel.current?.send({ type: 'broadcast', event: 'pen', payload: CANDIDATE_PEN });
  }, [setPen]);

  /** Ручка у этой вкладки. */
  const mine = pen.holder === 'candidate' ? role === 'candidate' : pen.key === key;

  return { status, peers, cursors, sendCursor, pen, mine, takePen, returnPen };
}

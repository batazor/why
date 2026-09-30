import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';
import type { Person } from './auth';
import { peersOf, presenceKey, useCursorSender, type LiveStatus, type Peer, type Point } from './presence';
import { pickBoard, type Board, type Design } from '../model';
import { applyPatch, diffBoard, type BoardPatch } from './board-patch';
import { course, type Course } from './interviews';
import { toEntry, type JournalEntry, type JournalRow } from './journal';
import type { Role } from '../roles';

/**
 * Комната собеседования: один канал Supabase Realtime на прохождение.
 *
 * Что по нему ходит:
 * - presence — кто в комнате и в какой роли;
 * - broadcast `cursor` — курсор на полотне, в координатах схемы (общее с
 *   присутствием над сценарием пространства — presence.ts);
 * - broadcast `patch` — правка доски кандидата: только то, что поменялось
 *   (см. board-patch.ts). Рисуют все сразу — кандидат и интервьюеры, — и
 *   каждый накладывает чужие правки на свою доску, не затирая своих.
 *   Сохраняет доску клиент кандидата: писать в interview_boards может только
 *   он, поэтому интервьюер рисует, пока кандидат в комнате;
 * - broadcast `board` — доска кандидата целиком: её шлёт кандидат тому, кто
 *   только что зашёл, — правок до его прихода он не видел;
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

export type RoomStatus = LiveStatus;

/** Правки доски копятся и уходят пачкой: при перетаскивании блока хватит пяти в секунду. */
const BOARD_MS = 200;

interface Options {
  room: string | null;
  me: Person | null;
  role: Role;
  design: Design | null;
  /** Пришла чужая правка доски — или доска кандидата целиком. */
  onBoard: (designId: string, change: (design: Design) => Design) => void;
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
  const key = presenceKey(me);

  /**
   * Доска, какой её знает комната: с чужими правками и своими отправленными.
   * Разница между ней и доской на экране — свои правки, которые ещё не ушли.
   */
  const synced = useRef<{ id: string; board: Board } | null>(null);

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

  /** Свои правки, которых комната ещё не видела. */
  const sendPatch = useCallback(() => {
    const current = designRef.current;
    if (!current) return;
    if (synced.current?.id !== current.id) {
      // Открыли проект — от его доски и считаем правки.
      synced.current = { id: current.id, board: pickBoard(current) };
      return;
    }
    const patch = diffBoard(synced.current.board, current);
    if (!patch || !live.current) return;
    synced.current = { id: current.id, board: pickBoard(current) };
    channel.current?.send({ type: 'broadcast', event: 'patch', payload: { designId: current.id, patch } });
  }, []);

  /** Доску целиком шлёт кандидат: у него она та, что сохранена. */
  const sendBoard = useCallback(() => {
    const current = designRef.current;
    if (!live.current || !current || roleRef.current !== 'candidate') return;
    channel.current?.send({ type: 'broadcast', event: 'board', payload: { designId: current.id, board: pickBoard(current) } });
  }, []);

  /** Ход собеседования шлёт интервьюер. */
  const sendCourseNow = useCallback(() => {
    const current = designRef.current;
    if (!live.current || !current || roleRef.current !== 'interviewer') return;
    const payload = course(current);
    lastCourse.current = JSON.stringify(payload);
    channel.current?.send({ type: 'broadcast', event: 'course', payload });
  }, []);

  /** Каждая сторона отдаёт своё: доску — кандидат, ход — интервьюер. */
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

    ch.on('presence', { event: 'sync' }, () => setPeers(peersOf(ch, key)))
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
      .on('broadcast', { event: 'patch' }, ({ payload }) => {
        const { designId, patch } = payload as { designId: string; patch: BoardPatch };
        // Чужая правка — уже известна комнате: в свои неотправленные её не записать.
        if (synced.current?.id === designId) synced.current = { id: designId, board: applyPatch(synced.current.board, patch) };
        onBoardRef.current(designId, (current) => applyPatch(current, patch));
      })
      .on('broadcast', { event: 'board' }, ({ payload }) => {
        // Доска целиком — от кандидата; у него самого она своя.
        if (roleRef.current === 'candidate') return;
        const { designId, board } = payload as { designId: string; board: Board };
        synced.current = { id: designId, board };
        onBoardRef.current(designId, (current) => ({ ...current, ...board }));
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

  /** Свои правки уходят по мере рисования, но не чаще BOARD_MS. */
  const boardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!design || boardTimer.current) return;
    boardTimer.current = setTimeout(() => {
      boardTimer.current = null;
      sendPatch();
    }, BOARD_MS);
  }, [design?.id, design?.nodes, design?.edges, design?.requirements, design?.api, design?.estimate, sendPatch]);

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

  const sendCursor = useCursorSender(channel, live, key);

  return { status, peers, cursors, sendCursor };
}

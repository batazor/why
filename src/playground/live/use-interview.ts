import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Person } from './auth';
import type { Course, InterviewRepository } from './interviews';
import { merge, signalsFrom, snapshotsFrom, type JournalEntry } from './journal';
import { useRoom } from './room';
import { mergeBoards, pickBoard, type Design } from '../model';
import type { BoardView, Role } from '../roles';
import type { T } from '../i18n';

/**
 * Живая сторона открытого собеседования — всё, что приходит и уходит по
 * комнате, поверх документа песочницы.
 *
 * - доска кандидата — общая: правки всех сторон — и ход собеседования у всех;
 * - задание кандидату со стартом;
 * - журнал у интервьюера: сигналы с серверным временем и снимки доски для
 *   записи; `replay` — какой снимок сейчас на полотне, null — живая доска;
 * - сообщение интервьюеру, что кандидат зашёл;
 * - оценки панели и отзыв кандидата для отчёта.
 *
 * Вне собеседования (interview = null) хук молчит: комнаты нет, журнал пуст.
 */

interface Options {
  interview: InterviewRepository | null;
  me: Person | null;
  role: Role;
  design: Design | null;
  update: (fn: (design: Design) => Design) => void;
  /** Чужая правка доски: мимо истории отмены. */
  remote: (fn: (design: Design) => Design) => void;
  /** Какая доска на полотне: курсор над эталоном кандидату ни о чём не скажет. */
  board: BoardView;
  t: T;
}

export function useInterview({ interview, me, role, design, update, remote, board, t }: Options) {
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [replay, setReplay] = useState<number | null>(null);
  /** Короткое сообщение, которое само пропадает: например, что кандидат зашёл. */
  const [toast, setToast] = useState('');

  // Журнал и запись — про открытое собеседование; вне его их нет.
  useEffect(() => {
    if (!interview) {
      setJournal([]);
      setReplay(null);
    }
  }, [interview]);

  /** Задание у кандидата ещё закрыто — ждём старта. Ref: обработчик хода живёт дольше рендера. */
  const taskLocked = useRef(false);
  taskLocked.current = Boolean(design?.session.taskLocked);

  /**
   * Ход собеседования от другого ведущего: время, калькулятор, открытые
   * подсказки, заданные вопросы. Оценки не трогаются — они у каждого свои.
   * Кандидат из хода берёт ещё и тексты подсказок: своих у него нет.
   */
  const onCourse = useCallback(
    (next: Course) => {
      /*
       * Началось — кандидату пора получить задание: сервер отдаёт его только
       * теперь. Весть о старте приходит раньше, чем интервьюер успеет записать
       * его в базу (автосохранение ждёт 400 мс), поэтому задание спрашиваем
       * несколько раз с паузой, пока сервер не согласится его отдать.
       */
      if (next.startedAt && interview?.as === 'candidate' && taskLocked.current) {
        const fetchTask = async (attempt: number) => {
          const opened = await interview.task().catch(() => null);
          if (opened !== null)
            update((current) => ({
              ...current,
              // Исходная система: сервер уже положил её в доску, но автосохранение
              // кандидата могло успеть записать доску без неё. Слияние по id — без дублей.
              ...(opened.start ? mergeBoards(pickBoard(current), opened.start) : {}),
              session: { ...current.session, taskLocked: false, openedTask: opened.task },
            }));
          else if (attempt < 8 && taskLocked.current) setTimeout(() => fetchTask(attempt + 1), 750);
        };
        fetchTask(0);
      }
      update((current) => ({
        ...current,
        session: {
          ...current.session,
          startedAt: next.startedAt,
          finishedAt: next.finishedAt,
          calcUnlockedAt: next.calcUnlockedAt,
          revealed: next.revealed.map((hint) => hint.id),
          revealedHints: next.revealed,
          asked: next.asked,
          estimateSnapshot: next.estimateSnapshot,
        },
      }));
    },
    [update, interview],
  );

  const onBoard = useCallback(
    (designId: string, change: (design: Design) => Design) =>
      // Доска чужого проекта сюда не относится: интервьюер открыл другой сценарий.
      remote((current) => (current.id === designId ? change(current) : current)),
    [remote],
  );

  const onJournal = useCallback((entry: JournalEntry) => setJournal((current) => merge(current, [entry])), []);

  // Комната — само собеседование: без него и без входа её нет.
  const live = useRoom({
    room: me ? (interview?.interviewId ?? null) : null,
    me,
    role,
    design,
    onBoard,
    onCourse,
    onJournal,
  });

  /**
   * Кандидат зашёл в комнату — интервьюеру сообщение, а если вкладка в
   * фоне, то и в заголовке: пока ждёшь, обычно смотришь в другое окно.
   */
  const seenPeers = useRef(new Set<string>());
  useEffect(() => {
    if (role !== 'interviewer' || !interview) return;
    for (const peer of live.peers) {
      // Пока собеседование у кандидата грузится, он в комнате с ролью прошлого
      // захода. Запоминаем его только кандидатом — иначе сообщения не будет вовсе.
      if (peer.role !== 'candidate' || seenPeers.current.has(peer.key)) continue;
      seenPeers.current.add(peer.key);
      setToast(t('join.candidate', { name: peer.person.name }));
      if (document.hidden) {
        const original = document.title;
        document.title = `● ${t('join.title', { name: peer.person.name })}`;
        const restore = () => {
          document.title = original;
          document.removeEventListener('visibilitychange', restore);
        };
        document.addEventListener('visibilitychange', restore);
      }
    }
  }, [live.peers, role, interview, t]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const { sendCursor } = live;
  // Эталон у интервьюера — другая схема: курсор над ним кандидату ни о чём не скажет.
  useEffect(() => {
    if (board !== 'answer') sendCursor(null);
  }, [board, sendCursor]);

  const snapshots = useMemo(() => snapshotsFrom(journal), [journal]);

  /**
   * В собеседовании интервьюер смотрит сигналы из журнала на сервере, а не
   * из своего документа: там они с серверным временем и их нельзя стереть.
   */
  const journalSignals = useMemo(() => signalsFrom(journal), [journal]);
  const withSignals = useMemo(
    () =>
      design && interview && role === 'interviewer'
        ? { ...design, session: { ...design.session, signals: journalSignals } }
        : design,
    [design, interview, role, journalSignals],
  );

  // Стабильные ссылки: отчёт перечитывает чужие оценки при их смене, а не на каждый рендер.
  const loadReviews = useCallback(() => (interview ? interview.reviews() : Promise.resolve([])), [interview]);
  const loadFeedback = useCallback(() => (interview ? interview.feedback() : Promise.resolve(null)), [interview]);

  return {
    live,
    journal,
    /** Журнал целиком — при открытии собеседования. */
    setJournal,
    replay,
    setReplay,
    snapshots,
    withSignals,
    toast,
    loadReviews,
    loadFeedback,
  };
}

import { db, must, toPerson, type ProfileRow } from './db';
import type { Person } from './auth';
import type { Workspace } from './workspaces';
import { fromScenario, type ScenarioRow } from './scenarios';
import { toEntry, type JournalEntry, type JournalRow } from './journal';
import {
  emptyBoard,
  emptySession,
  migrate,
  migrateBoard,
  pickBoard,
  type Board,
  type Design,
  type DesignSummary,
  type Scenario,
  type ScenarioItem,
  type Session,
} from '../model';
import type { DesignRepository } from '../storage';

/**
 * Собеседование: приглашение, снимок сценария, ход, оценки панели, отзыв
 * кандидата — и оно же как проект песочницы (InterviewRepository).
 */

/** Снимок доски в журнал — не чаще раза в 15 секунд, пока доска меняется. */
const SNAPSHOT_MS = 15_000;

export type InterviewStatus = 'scheduled' | 'live' | 'finished' | 'cancelled';

export interface Interview {
  id: string;
  scenarioId: string;
  status: InterviewStatus;
  candidateEmail: string | null;
  candidate: Person | null;
  inviteToken: string;
  inviteExpiresAt: string | null;
  scheduledAt: string | null;
  durationMinutes: number;
  startedAt: string | null;
  /** Сценарий к моменту снимка: если с тех пор его правили, снимок можно обновить до старта. */
  snapshotOf: string | null;
  createdAt: string;
}

// ─── Собеседования ──────────────────────────────────────────────────────────

export interface InterviewRow {
  id: string;
  workspace_id: string;
  scenario_id: string;
  interviewer_id: string;
  candidate_id: string | null;
  candidate_email: string | null;
  invite_token: string;
  invite_expires_at: string | null;
  status: InterviewStatus;
  started_at: string | null;
  finished_at: string | null;
  calc_unlocked_at: string | null;
  scheduled_at: string | null;
  duration_minutes: number;
  revealed_hints: ScenarioItem[];
  asked: string[];
  estimate_snapshot: string | null;
  /** Снимок открытой части сценария на момент создания собеседования. */
  brief: Brief | null;
  created_at: string;
}

/** Открытая часть сценария в снимке — поля scenarios, как их положил private.scenario_brief. */
interface Brief {
  title: string;
  task: string;
  task_source: string;
  calc: Design['calc'];
  allow_checks: boolean;
  format_version: number;
  /** Когда сценарий менялся последний раз к моменту снимка — по нему видно, что снимок отстал. */
  updated_at: string;
}


export async function listInterviews(scenarioId: string): Promise<Interview[]> {
  const rows = must(
    await db().from('interviews').select('*').eq('scenario_id', scenarioId).order('created_at', { ascending: false }),
  ) as InterviewRow[];
  const ids = rows.map((row) => row.candidate_id).filter((id): id is string => Boolean(id));
  const people = ids.length
    ? (must(await db().from('profiles').select('id, name, email, avatar_url').in('id', ids)) as ProfileRow[])
    : [];
  const byId = new Map(people.map((row) => [row.id, toPerson(row)]));
  return rows.map((row) => toInterview(row, row.candidate_id ? (byId.get(row.candidate_id) ?? null) : null));
}

/** Строка собеседования — в то, с чем работают списки; кандидата подставляет вызывающий. */
export function toInterview(row: InterviewRow, candidate: Person | null): Interview {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    status: row.status,
    candidateEmail: row.candidate_email,
    candidate,
    inviteToken: row.invite_token,
    inviteExpiresAt: row.invite_expires_at,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    startedAt: row.started_at,
    snapshotOf: row.brief?.updated_at ?? null,
    createdAt: row.created_at,
  };
}

/**
 * id задаётся здесь, а не сервером: вставка без чтения назад не требует
 * права читать строку, и не нужно ждать, пока политика чтения её увидит.
 */
export interface Schedule {
  /** ISO-время начала; null — не назначено. */
  at: string | null;
  minutes: number;
}

export async function createInterview(
  workspace: Pick<Workspace, 'id'>,
  scenarioId: string,
  email: string,
  schedule: Schedule = { at: null, minutes: 60 },
): Promise<string> {
  const id = crypto.randomUUID();
  must(
    await db().from('interviews').insert({
      id,
      workspace_id: workspace.id,
      scenario_id: scenarioId,
      candidate_email: email.trim() || null,
      scheduled_at: schedule.at,
      duration_minutes: schedule.minutes,
    }),
  );
  return id;
}

/** Перенести собеседование. Приглашение сервер сам продлит до нового времени. */
export async function reschedule(id: string, schedule: Schedule): Promise<void> {
  must(
    await db().from('interviews').update({ scheduled_at: schedule.at, duration_minutes: schedule.minutes }).eq('id', id),
  );
}

/** Взять в собеседование сценарий в нынешнем виде — пока оно не началось. */
export async function refreshSnapshot(id: string): Promise<void> {
  must(await db().rpc('refresh_interview_snapshot', { interview: id }));
}

/** Новая ссылка на то же собеседование: старая перестаёт работать, срок — заново. */
export async function renewInvite(id: string): Promise<string> {
  return must(await db().rpc('renew_interview_invite', { interview: id })) as string;
}

export async function cancelInterview(id: string): Promise<void> {
  must(await db().from('interviews').update({ status: 'cancelled' }).eq('id', id));
}

/** Принять приглашение: сервер проверит почту и что его ещё никто не принял. */
export async function claimInvite(token: string): Promise<string> {
  return must(await db().rpc('claim_interview', { token })) as string;
}

/** Работа интервьюера — то, что уходит в interview_reviews. Сигналы и время живут не здесь. */
/** Своя оценка интервьюера — то, что уходит в его строку interview_reviews. */
function reviewPart(session: Session) {
  return { scores: session.scores, notes: session.notes };
}

/**
 * Ход собеседования — общий на всех, кто его ведёт, и видимый кандидату:
 * время, открытый калькулятор, открытые подсказки (с текстом — сценарий
 * кандидату закрыт), заданные вопросы, прикидка до калькулятора.
 */
export interface Course {
  startedAt?: string;
  finishedAt?: string;
  calcUnlockedAt?: string;
  revealed: ScenarioItem[];
  asked: string[];
  estimateSnapshot?: string;
}

export function course(design: Design): Course {
  const { session } = design;
  const known = new Map([...(session.revealedHints ?? []), ...design.scenario.hints].map((hint) => [hint.id, hint]));
  return {
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    calcUnlockedAt: session.calcUnlockedAt,
    revealed: session.revealed
      .map((id) => known.get(id))
      .filter((hint): hint is ScenarioItem => Boolean(hint))
      .map((hint) => ({ id: hint.id, text: hint.text })),
    asked: session.asked,
    estimateSnapshot: session.estimateSnapshot,
  };
}

/** Оценка одного интервьюера — для отчёта панели. */
export interface Review {
  reviewer: Person;
  scores: Record<string, number>;
  notes: string;
  mine: boolean;
}

export interface Feedback {
  rating: number;
  comment: string;
  createdAt: string;
}

/**
 * Одно собеседование как проект песочницы.
 *
 * Роль не выбирается: кто принял приглашение — кандидат, остальным (людям
 * пространства) — интервьюер. Каждый пишет только своё: кандидат — доску,
 * интервьюер — оценки и ход собеседования. Остальное, даже если поменялось в
 * документе (доска у интервьюера меняется, когда её присылает кандидат), на
 * сервер не уходит: писать туда этой роли нельзя.
 */
export class InterviewRepository implements DesignRepository {
  as: 'candidate' | 'interviewer' = 'interviewer';
  interviewer: Person | null = null;
  candidate: Person | null = null;
  createdAt = '';
  scheduledAt: string | null = null;
  durationMinutes = 60;
  /** Сценарий и пространство собеседования — чтобы позвать следующего кандидата отсюда же. */
  scenarioId = '';
  workspace: { id: string; name: string } | null = null;
  private title = '';
  private saved = { board: '', review: '', course: '' };
  /** Что из сигналов уже в журнале: сигнал «ушёл» дописывается ещё раз, когда человек вернулся. */
  private sent = new Map<string, string>();
  private snapshot = { board: '', at: 0 };

  constructor(
    readonly interviewId: string,
    private me: string,
  ) {}

  async list(): Promise<DesignSummary[]> {
    return [{ id: this.interviewId, title: this.title, updatedAt: new Date().toISOString() }];
  }

  async load(id: string): Promise<Design | null> {
    if (id !== this.interviewId) return null;
    const row = must(await db().from('interviews').select('*').eq('id', id).maybeSingle()) as InterviewRow | null;
    if (!row) return null;
    this.as = row.candidate_id === this.me ? 'candidate' : 'interviewer';
    const staff = this.as === 'interviewer';

    // Собеседование живёт по своему снимку сценария, а не по живому: правка
    // сценария после приглашения не должна менять ни задание, ни критерии.
    // Текст задания кандидату сервер отдаёт только после старта; до него строки просто нет.
    const [scenario, secret, board, review, interviewer, task, space] = await Promise.all([
      row.brief ? null : db().from('scenarios').select('*').eq('id', row.scenario_id).single(),
      staff ? db().from('interview_scenarios').select('content').eq('interview_id', id).maybeSingle() : null,
      db().from('interview_boards').select('board').eq('interview_id', id).maybeSingle(),
      staff
        ? db().from('interview_reviews').select('session').eq('interview_id', id).eq('reviewer_id', this.me).maybeSingle()
        : null,
      db().from('profiles').select('id, name, email, avatar_url').eq('id', row.interviewer_id).maybeSingle(),
      db().from('interview_tasks').select('task').eq('interview_id', id).maybeSingle(),
      staff ? db().from('workspaces').select('name').eq('id', row.workspace_id).maybeSingle() : null,
    ]);
    this.scenarioId = row.scenario_id;
    this.workspace = staff ? { id: row.workspace_id, name: (space?.data as { name: string } | null)?.name ?? '' } : null;
    const taskRow = must(task) as { task: string } | null;
    const candidate =
      staff && row.candidate_id
        ? (must(
            await db().from('profiles').select('id, name, email, avatar_url').eq('id', row.candidate_id).maybeSingle(),
          ) as ProfileRow | null)
        : null;
    this.candidate = candidate ? toPerson(candidate) : null;
    this.createdAt = row.created_at;
    const base = fromScenario(
      row.brief
        ? { ...row.brief, id: row.scenario_id, created_at: row.created_at }
        : (must(scenario!) as ScenarioRow),
      secret ? ((must(secret) as { content: Partial<Scenario> } | null)?.content ?? null) : null,
    );
    this.scheduledAt = row.scheduled_at;
    this.durationMinutes = row.duration_minutes;
    const answer = (must(board) as { board: Board } | null)?.board ?? emptyBoard();
    const work = review ? ((must(review) as { session: Partial<Session> } | null)?.session ?? {}) : {};
    const who = must(interviewer) as ProfileRow | null;
    this.interviewer = who ? toPerson(who) : null;
    this.title = base.title;

    const design = migrate({
      ...base,
      id,
      task: taskRow?.task ?? base.task,
      ...answer,
      session: {
        ...emptySession(),
        // Своя оценка — из своей строки; ход собеседования — из самого собеседования, общий.
        scores: work.scores ?? {},
        notes: work.notes ?? '',
        revealed: (row.revealed_hints ?? []).map((hint) => hint.id),
        asked: row.asked ?? [],
        estimateSnapshot: row.estimate_snapshot ?? undefined,
        startedAt: row.started_at ?? undefined,
        finishedAt: row.finished_at ?? undefined,
        calcUnlockedAt: row.calc_unlocked_at ?? undefined,
      },
    });
    design.session.revealedHints = row.revealed_hints ?? [];
    // Кандидат до старта: задания ещё нет — придёт со стартом.
    if (!staff && !taskRow) design.session.taskLocked = true;
    // Снимки в журнал — только изменения: доска, с которой пришли, уже известна.
    this.snapshot = { board: JSON.stringify(pickBoard(design)), at: 0 };
    this.saved = {
      board: JSON.stringify(pickBoard(design)),
      review: JSON.stringify(reviewPart(design.session)),
      course: JSON.stringify(course(design)),
    };
    return design;
  }

  async save(design: Design): Promise<void> {
    if (design.id !== this.interviewId) return;
    if (this.as === 'candidate') {
      const board = JSON.stringify(pickBoard(design));
      if (board !== this.saved.board) {
        must(await db().from('interview_boards').update({ board: pickBoard(design) }).eq('interview_id', this.interviewId));
        this.saved.board = board;
      }
      await this.append(design, board);
      return;
    }

    // Своя оценка: строка своя, чужую не тронуть. Нет строки — первая оценка, вставляем.
    const review = JSON.stringify(reviewPart(design.session));
    if (review !== this.saved.review) {
      const updated = must(
        await db()
          .from('interview_reviews')
          .update({ session: reviewPart(design.session) })
          .eq('interview_id', this.interviewId)
          .eq('reviewer_id', this.me)
          .select('interview_id'),
      ) as unknown[];
      if (!updated.length)
        must(await db().from('interview_reviews').insert({ interview_id: this.interviewId, session: reviewPart(design.session) }));
      this.saved.review = review;
    }

    const next = course(design);
    const serialized = JSON.stringify(next);
    if (serialized !== this.saved.course) {
      must(
        await db()
          .from('interviews')
          .update({
            started_at: next.startedAt ?? null,
            finished_at: next.finishedAt ?? null,
            calc_unlocked_at: next.calcUnlockedAt ?? null,
            status: next.finishedAt ? 'finished' : next.startedAt ? 'live' : 'scheduled',
            revealed_hints: next.revealed,
            asked: next.asked,
            estimate_snapshot: next.estimateSnapshot ?? null,
          })
          .eq('id', this.interviewId),
      );
      this.saved.course = serialized;
    }
  }

  /** Оценки всех, кто вёл собеседование, — своя тоже, как она сохранена. */
  async reviews(): Promise<Review[]> {
    const rows = must(
      await db().from('interview_reviews').select('reviewer_id, session').eq('interview_id', this.interviewId),
    ) as { reviewer_id: string; session: Partial<Session> }[];
    const people = rows.length
      ? (must(
          await db()
            .from('profiles')
            .select('id, name, email, avatar_url')
            .in(
              'id',
              rows.map((row) => row.reviewer_id),
            ),
        ) as ProfileRow[])
      : [];
    const byId = new Map(people.map((row) => [row.id, toPerson(row)]));
    return rows.map((row) => ({
      reviewer: byId.get(row.reviewer_id) ?? { id: row.reviewer_id, name: '—' },
      scores: row.session.scores ?? {},
      notes: row.session.notes ?? '',
      mine: row.reviewer_id === this.me,
    }));
  }

  /**
   * Текст задания и исходная система — кандидату, когда собеседование
   * началось. До старта — null: строку сервер ему не отдаёт.
   */
  async task(): Promise<{ task: string; start: Board | null } | null> {
    const query = (columns: string) =>
      db().from('interview_tasks').select(columns).eq('interview_id', this.interviewId).maybeSingle();
    let result = await query('task, start');
    // База ещё без исходной системы (миграция given_system не применена) — задание всё равно отдаём.
    if (result.error?.code === '42703') result = await query('task');
    const row = must(result) as { task: string; start?: Partial<Board> | null } | null;
    return row ? { task: row.task, start: row.start ? migrateBoard(row.start) : null } : null;
  }

  async feedback(): Promise<Feedback | null> {
    const row = must(
      await db().from('interview_feedback').select('rating, comment, created_at').eq('interview_id', this.interviewId).maybeSingle(),
    ) as { rating: number; comment: string; created_at: string } | null;
    return row ? { rating: row.rating, comment: row.comment, createdAt: row.created_at } : null;
  }

  /** Отзыв кандидата — один раз, после конца собеседования. */
  async leaveFeedback(rating: number, comment: string): Promise<void> {
    must(await db().from('interview_feedback').insert({ interview_id: this.interviewId, rating, comment: comment.trim() }));
  }

  async remove(): Promise<void> {
    /* собеседование удаляется из списка собеседований, а не отсюда */
  }

  /**
   * Дописать в журнал новое: сигналы, которых там нет или которые изменились,
   * и снимок доски — не чаще SNAPSHOT_MS. Последняя доска и так лежит в
   * interview_boards, снимки нужны, чтобы потом прокрутить, как она росла.
   */
  private async append(design: Design, board: string) {
    const rows: { interview_id: string; kind: 'signal' | 'board'; payload: unknown; client_at: string }[] = [];
    for (const signal of design.session.signals) {
      const json = JSON.stringify(signal);
      if (this.sent.get(signal.id) !== json)
        rows.push({ interview_id: this.interviewId, kind: 'signal', payload: signal, client_at: signal.back ?? signal.at });
    }
    const now = Date.now();
    const snap = board !== this.snapshot.board && now - this.snapshot.at >= SNAPSHOT_MS;
    if (snap)
      rows.push({ interview_id: this.interviewId, kind: 'board', payload: pickBoard(design), client_at: new Date(now).toISOString() });
    if (!rows.length) return;
    must(await db().from('interview_events').insert(rows));
    for (const signal of design.session.signals) this.sent.set(signal.id, JSON.stringify(signal));
    if (snap) this.snapshot = { board, at: now };
  }

  /** Журнал целиком — интервьюеру, по порядку записи на сервере. */
  async journal(): Promise<JournalEntry[]> {
    const rows = must(
      await db()
        .from('interview_events')
        .select('id, kind, payload, created_at')
        .eq('interview_id', this.interviewId)
        .order('id'),
    ) as JournalRow[];
    return rows.map(toEntry);
  }
}

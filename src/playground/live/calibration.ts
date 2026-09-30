import { db, must, toPerson, type ProfileRow } from './db';
import type { Person } from './auth';
import type { InterviewRow, InterviewStatus } from './interviews';
import { signalsFrom, toEntry, type JournalEntry, type JournalRow } from './journal';
import { migrate, totalScore, type Criterion, type Scenario, type Session, type Signal } from '../model';

// ─── Сравнение кандидатов ───────────────────────────────────────────────────

export interface CalibrationRow {
  id: string;
  scenarioId: string;
  /** Название из снимка сценария — как оно было на собеседовании, а не сейчас. */
  scenarioTitle: string;
  status: InterviewStatus;
  candidate: string;
  /** Кандидат уже принял приглашение — есть кому проходить. */
  accepted: boolean;
  /** Кто назначил собеседование. */
  scheduledBy: Person;
  scheduledAt: string | null;
  durationMinutes: number;
  /** Кто оценивал; если никто — тот, кто назначил. */
  interviewers: Person[];
  /** Оценки каждого, кто вёл: итог по его баллам. */
  reviews: { reviewer: Person; scores: Record<string, number>; total: number | null }[];
  /** Когда было: начало, иначе назначенное время, иначе создание. */
  at: string;
  durationMs: number | null;
  /** Критерии из снимка этого собеседования — у разных собеседований они могут отличаться. */
  rubric: Criterion[];
  /** Средний уровень по критерию у всех, кто оценил. */
  scores: Record<string, number>;
  /** Средний итог по всем оценившим. */
  total: number | null;
  revealed: number;
  hints: number;
  signals: Signal[];
}

/**
 * Все собеседования по сценарию — для сравнения кандидатов и интервьюеров.
 *
 * Итог каждого считается по критериям его собственного снимка: если автор
 * поменял критерии между собеседованиями, старые оценки остаются про старые
 * критерии, а не пересчитываются по новым.
 */
export async function calibration(scenarioId: string): Promise<CalibrationRow[]> {
  const rows = must(
    await db().from('interviews').select('*').eq('scenario_id', scenarioId).neq('status', 'cancelled'),
  ) as InterviewRow[];
  return collect(rows);
}

/** Все собеседования пространства — кабинет интервьюера: что назначено, что прошло и с каким итогом. */
export async function cabinet(workspaceId: string): Promise<CalibrationRow[]> {
  const rows = must(await db().from('interviews').select('*').eq('workspace_id', workspaceId)) as InterviewRow[];
  return collect(rows);
}

/** Строки собеседований — в строки сравнения: люди, оценки по снимку, сигналы из журнала. */
async function collect(rows: InterviewRow[]): Promise<CalibrationRow[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  // Название сценария — из снимка; у собеседований, назначенных до снимков, — из живого сценария.
  const untitled = [...new Set(rows.filter((row) => !row.brief).map((row) => row.scenario_id))];
  const [snapshots, reviews, events, scenarios] = await Promise.all([
    db().from('interview_scenarios').select('interview_id, content').in('interview_id', ids),
    db().from('interview_reviews').select('interview_id, reviewer_id, session').in('interview_id', ids),
    db()
      .from('interview_events')
      .select('id, interview_id, kind, payload, created_at')
      .eq('kind', 'signal')
      .in('interview_id', ids)
      .order('id'),
    untitled.length ? db().from('scenarios').select('id, title').in('id', untitled) : null,
  ]);
  const content = new Map(
    (must(snapshots) as { interview_id: string; content: Partial<Scenario> }[]).map((row) => [row.interview_id, row.content]),
  );
  const titles = new Map((scenarios ? (must(scenarios) as { id: string; title: string }[]) : []).map((row) => [row.id, row.title]));
  const reviewRows = must(reviews) as { interview_id: string; reviewer_id: string; session: Partial<Session> }[];
  const people = [
    ...new Set([...rows.flatMap((row) => [row.interviewer_id, row.candidate_id]), ...reviewRows.map((row) => row.reviewer_id)]),
  ].filter(Boolean) as string[];
  const byId = new Map(
    (must(await db().from('profiles').select('id, name, email, avatar_url').in('id', people)) as ProfileRow[]).map((row) => [
      row.id,
      toPerson(row),
    ]),
  );
  const person = (id: string): Person => byId.get(id) ?? { id, name: '—' };
  const journal = new Map<string, JournalEntry[]>();
  for (const row of must(events) as (JournalRow & { interview_id: string })[])
    journal.set(row.interview_id, [...(journal.get(row.interview_id) ?? []), toEntry(row)]);

  return rows.map((row) => {
    // Через migrate — чтобы у критериев были веса и прочие умолчания, как в документе.
    const scenario = migrate({ scenario: content.get(row.id) ?? {} }).scenario;
    const own = reviewRows
      .filter((review) => review.interview_id === row.id)
      .map((review) => {
        const scores = review.session.scores ?? {};
        return { reviewer: person(review.reviewer_id), scores, total: totalScore(scenario.rubric, scores) };
      });
    // Уровень по критерию — среднее по всем, кто его оценил: панель видна одной строкой.
    const scores: Record<string, number> = {};
    for (const item of scenario.rubric) {
      const levels = own.map((review) => review.scores[item.id]).filter((level): level is number => level !== undefined);
      if (levels.length) scores[item.id] = levels.reduce((sum, level) => sum + level, 0) / levels.length;
    }
    const totals = own.map((review) => review.total).filter((total): total is number => total !== null);
    const started = row.started_at ? Date.parse(row.started_at) : null;
    const ended = row.finished_at ? Date.parse(row.finished_at) : null;
    return {
      id: row.id,
      scenarioId: row.scenario_id,
      scenarioTitle: row.brief?.title ?? titles.get(row.scenario_id) ?? '',
      status: row.status,
      candidate: (row.candidate_id && byId.get(row.candidate_id)?.name) || row.candidate_email || '',
      accepted: Boolean(row.candidate_id),
      scheduledBy: person(row.interviewer_id),
      scheduledAt: row.scheduled_at,
      durationMinutes: row.duration_minutes,
      interviewers: own.length ? own.map((review) => review.reviewer) : [person(row.interviewer_id)],
      reviews: own,
      at: row.started_at ?? row.scheduled_at ?? row.created_at,
      durationMs: started && ended ? ended - started : null,
      rubric: scenario.rubric,
      scores,
      total: totals.length ? Math.round(totals.reduce((sum, total) => sum + total, 0) / totals.length) : null,
      revealed: (row.revealed_hints ?? []).length,
      hints: scenario.hints.length,
      signals: signalsFrom(journal.get(row.id) ?? []),
    };
  });
}

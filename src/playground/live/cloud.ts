import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';
import type { Person } from './auth';
import {
  emptyBoard,
  emptySession,
  emptyTraining,
  migrate,
  pickBoard,
  type Board,
  type Design,
  type DesignSummary,
  type Scenario,
  type Session,
} from '../model';
import type { DesignRepository } from '../storage';
import { toEntry, type JournalEntry, type JournalRow } from './journal';

/** Снимок доски в журнал — не чаще раза в 15 секунд, пока доска меняется. */
const SNAPSHOT_MS = 15_000;

/**
 * Песочница поверх схемы из supabase/migrations.
 *
 * Проект песочницы (Design) — один документ, а на сервере он разложен по
 * таблицам так, чтобы права резали его по швам: задание отдельно от эталона,
 * доска кандидата отдельно от оценок интервьюера. Здесь документ собирается
 * из строк и раскладывается обратно — панелям песочницы о таблицах знать не
 * нужно, они по-прежнему работают с Design.
 */

export type WorkspaceRole = 'owner' | 'author' | 'interviewer';

export interface Workspace {
  id: string;
  name: string;
  role: WorkspaceRole;
}

export type InterviewStatus = 'scheduled' | 'live' | 'finished' | 'cancelled';

export interface Interview {
  id: string;
  scenarioId: string;
  status: InterviewStatus;
  candidateEmail: string | null;
  candidate: Person | null;
  inviteToken: string;
  createdAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Проекты пространства — с uuid, проекты браузера — `d_…`: по id видно, где проект живёт. */
export const isCloudId = (id: string) => UUID.test(id);

function db(): SupabaseClient {
  const client = supabase();
  if (!client) throw new Error('Supabase is not configured');
  return client;
}

/** Ошибка запроса — исключение: песочница покажет «не сохранено», а не промолчит. */
function must<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

// ─── Пространство ───────────────────────────────────────────────────────────

/**
 * Пространство вошедшего человека. Первого у нового пользователя нет — оно
 * создаётся сразу: без него автору некуда сохранить сценарий.
 */
export async function listWorkspaces(me: string): Promise<Workspace[]> {
  // Политика отдаёт всех участников моих пространств — роль нужна именно моя.
  const rows = must(
    await db()
      .from('workspace_members')
      .select('role, workspaces(id, name)')
      .eq('user_id', me)
      .order('created_at', { ascending: true }),
  ) as unknown as { role: WorkspaceRole; workspaces: { id: string; name: string } }[];
  return rows.map((row) => ({ id: row.workspaces.id, name: row.workspaces.name, role: row.role }));
}

/**
 * Пространство, в котором работать. Их может быть несколько — своё и
 * команды, куда позвали; открывается последнее выбранное.
 */
export async function ensureWorkspace(me: string, defaultName: string): Promise<Workspace> {
  const all = await listWorkspaces(me);
  const preferred = preferredWorkspace.get();
  if (all.length) return all.find((item) => item.id === preferred) ?? all[0];
  const id = must(await db().rpc('create_workspace', { name: defaultName })) as string;
  return { id, name: defaultName, role: 'owner' };
}

/** Выбранное пространство — удобство, а не данные: потеряется — откроется первое. */
export const preferredWorkspace = {
  get(): string | null {
    try {
      return localStorage.getItem('why:playground:workspace');
    } catch {
      return null;
    }
  },
  set(id: string) {
    try {
      localStorage.setItem('why:playground:workspace', id);
    } catch {
      /* не критично */
    }
  },
};

// ─── Команда ────────────────────────────────────────────────────────────────

export interface Member {
  person: Person;
  email: string;
  role: WorkspaceRole;
}

export interface TeamInvite {
  id: string;
  role: WorkspaceRole;
  email: string | null;
  token: string;
  createdAt: string;
  accepted: boolean;
}

export async function listMembers(workspace: string): Promise<Member[]> {
  const rows = must(
    await db().from('workspace_members').select('user_id, role').eq('workspace_id', workspace).order('created_at'),
  ) as { user_id: string; role: WorkspaceRole }[];
  const people = rows.length
    ? (must(
        await db()
          .from('profiles')
          .select('id, name, email, avatar_url')
          .in(
            'id',
            rows.map((row) => row.user_id),
          ),
      ) as ProfileRow[])
    : [];
  const byId = new Map(people.map((row) => [row.id, row]));
  return rows.map((row) => {
    const profile = byId.get(row.user_id);
    return {
      person: profile ? toPerson(profile) : { id: row.user_id, name: '—' },
      email: profile?.email ?? '',
      role: row.role,
    };
  });
}

export async function setMemberRole(workspace: string, user: string, role: WorkspaceRole): Promise<void> {
  must(await db().from('workspace_members').update({ role }).eq('workspace_id', workspace).eq('user_id', user));
}

export async function removeMember(workspace: string, user: string): Promise<void> {
  must(await db().from('workspace_members').delete().eq('workspace_id', workspace).eq('user_id', user));
}

export async function renameWorkspace(workspace: string, name: string): Promise<void> {
  must(await db().from('workspaces').update({ name }).eq('id', workspace));
}

/** Приглашения видит только владелец; остальным список просто пуст. */
export async function listTeamInvites(workspace: string): Promise<TeamInvite[]> {
  const rows = must(
    await db()
      .from('workspace_invites')
      .select('id, role, email, token, created_at, accepted_by')
      .eq('workspace_id', workspace)
      .order('created_at', { ascending: false }),
  ) as { id: string; role: WorkspaceRole; email: string | null; token: string; created_at: string; accepted_by: string | null }[];
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    email: row.email,
    token: row.token,
    createdAt: row.created_at,
    accepted: Boolean(row.accepted_by),
  }));
}

export async function createTeamInvite(workspace: string, role: WorkspaceRole, email: string): Promise<string> {
  const id = crypto.randomUUID();
  must(await db().from('workspace_invites').insert({ id, workspace_id: workspace, role, email: email.trim() || null }));
  return id;
}

export async function revokeTeamInvite(id: string): Promise<void> {
  must(await db().from('workspace_invites').delete().eq('id', id));
}

export async function acceptTeamInvite(token: string): Promise<string> {
  return must(await db().rpc('accept_workspace_invite', { token })) as string;
}

// ─── Сценарии ───────────────────────────────────────────────────────────────

/** Открытая часть сценария — то, что увидит и кандидат. */
function publicRow(design: Design) {
  return {
    title: design.title,
    task: design.task,
    task_source: design.taskSource,
    calc: design.calc,
    allow_checks: design.scenario.allowChecks,
    format_version: design.version,
  };
}

function privateContent(design: Design) {
  const { allowChecks: _shownToCandidate, ...content } = design.scenario;
  return content;
}

interface ScenarioRow {
  id: string;
  title: string;
  task: string;
  task_source: string;
  calc: Design['calc'];
  allow_checks: boolean;
  format_version: number;
  created_at: string;
  updated_at: string;
}

function fromScenario(row: ScenarioRow, content: Partial<Scenario> | null): Design {
  return migrate({
    version: row.format_version,
    id: row.id,
    title: row.title,
    task: row.task,
    taskSource: row.task_source,
    calc: row.calc,
    scenario: { ...(content ?? {}), allowChecks: row.allow_checks },
    ...emptyBoard(),
    session: emptySession(),
    training: emptyTraining(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/**
 * Сценарии пространства.
 *
 * Хранится только то, что готовит автор: задание, настройки, сценарий с
 * эталоном. Доска кандидата и прохождение принадлежат собеседованию, а не
 * сценарию, поэтому сюда не пишутся.
 *
 * Автосохранение песочницы зовёт save на любую правку, в том числе на
 * открытую интервьюером подсказку. Интервьюеру писать сценарий нельзя, да и
 * незачем: запись уходит, только если изменилась сама сохраняемая часть.
 */
export class CloudRepository implements DesignRepository {
  private saved = new Map<string, string>();

  constructor(private workspace: Workspace) {}

  async list(): Promise<DesignSummary[]> {
    const rows = must(
      await db()
        .from('scenarios')
        .select('id, title, updated_at')
        .eq('workspace_id', this.workspace.id)
        .order('updated_at', { ascending: false }),
    ) as { id: string; title: string; updated_at: string }[];
    return rows.map((row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at, cloud: true }));
  }

  async load(id: string): Promise<Design | null> {
    if (!isCloudId(id)) return null;
    const row = must(await db().from('scenarios').select('*').eq('id', id).maybeSingle()) as ScenarioRow | null;
    if (!row) return null;
    const secret = must(
      await db().from('scenario_private').select('content').eq('scenario_id', id).maybeSingle(),
    ) as { content: Partial<Scenario> } | null;
    const design = fromScenario(row, secret?.content ?? null);
    this.saved.set(id, JSON.stringify([publicRow(design), privateContent(design)]));
    return design;
  }

  async save(design: Design): Promise<void> {
    const snapshot = JSON.stringify([publicRow(design), privateContent(design)]);
    if (this.saved.get(design.id) === snapshot) return;
    must(
      await db()
        .from('scenarios')
        .upsert({ id: design.id, workspace_id: this.workspace.id, ...publicRow(design) }),
    );
    must(await db().from('scenario_private').upsert({ scenario_id: design.id, content: privateContent(design) }));
    this.saved.set(design.id, snapshot);
  }

  async remove(id: string): Promise<void> {
    must(await db().from('scenarios').delete().eq('id', id));
    this.saved.delete(id);
  }
}

/**
 * Браузер и пространство одним списком.
 *
 * Войдя, человек не теряет того, что рисовал до входа: локальные проекты
 * остаются в списке рядом со сценариями пространства. Куда писать, видно по
 * id; новые проекты создаются в пространстве.
 */
export class HybridRepository implements DesignRepository {
  constructor(
    private local: DesignRepository,
    private cloud: CloudRepository,
  ) {}

  newId() {
    return crypto.randomUUID();
  }

  async list() {
    const [cloud, local] = await Promise.all([this.cloud.list(), this.local.list()]);
    return [...cloud, ...local];
  }

  load(id: string) {
    return isCloudId(id) ? this.cloud.load(id) : this.local.load(id);
  }

  save(design: Design) {
    return isCloudId(design.id) ? this.cloud.save(design) : this.local.save(design);
  }

  remove(id: string) {
    return isCloudId(id) ? this.cloud.remove(id) : this.local.remove(id);
  }
}

// ─── Собеседования ──────────────────────────────────────────────────────────

interface InterviewRow {
  id: string;
  workspace_id: string;
  scenario_id: string;
  interviewer_id: string;
  candidate_id: string | null;
  candidate_email: string | null;
  invite_token: string;
  status: InterviewStatus;
  started_at: string | null;
  finished_at: string | null;
  calc_unlocked_at: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

const toPerson = (row: ProfileRow): Person => ({ id: row.id, name: row.name || row.email, avatar: row.avatar_url ?? undefined });

export async function listInterviews(scenarioId: string): Promise<Interview[]> {
  const rows = must(
    await db().from('interviews').select('*').eq('scenario_id', scenarioId).order('created_at', { ascending: false }),
  ) as InterviewRow[];
  const ids = rows.map((row) => row.candidate_id).filter((id): id is string => Boolean(id));
  const people = ids.length
    ? (must(await db().from('profiles').select('id, name, email, avatar_url').in('id', ids)) as ProfileRow[])
    : [];
  const byId = new Map(people.map((row) => [row.id, toPerson(row)]));
  return rows.map((row) => ({
    id: row.id,
    scenarioId: row.scenario_id,
    status: row.status,
    candidateEmail: row.candidate_email,
    candidate: row.candidate_id ? (byId.get(row.candidate_id) ?? null) : null,
    inviteToken: row.invite_token,
    createdAt: row.created_at,
  }));
}

/**
 * id задаётся здесь, а не сервером: вставка без чтения назад не требует
 * права читать строку, и не нужно ждать, пока политика чтения её увидит.
 */
export async function createInterview(workspace: Workspace, scenarioId: string, email: string): Promise<string> {
  const id = crypto.randomUUID();
  must(
    await db()
      .from('interviews')
      .insert({ id, workspace_id: workspace.id, scenario_id: scenarioId, candidate_email: email.trim() || null }),
  );
  return id;
}

export async function cancelInterview(id: string): Promise<void> {
  must(await db().from('interviews').update({ status: 'cancelled' }).eq('id', id));
}

/** Принять приглашение: сервер проверит почту и что его ещё никто не принял. */
export async function claimInvite(token: string): Promise<string> {
  return must(await db().rpc('claim_interview', { token })) as string;
}

/** Работа интервьюера — то, что уходит в interview_reviews. Сигналы и время живут не здесь. */
function reviewPart(session: Session) {
  return {
    revealed: session.revealed,
    asked: session.asked,
    scores: session.scores,
    notes: session.notes,
    ...(session.estimateSnapshot ? { estimateSnapshot: session.estimateSnapshot } : {}),
  };
}

/** Ход собеседования — колонки interviews. Их видит и кандидат: по ним его таймер и калькулятор. */
export interface Timing {
  startedAt?: string;
  finishedAt?: string;
  calcUnlockedAt?: string;
}

export const timing = (session: Session): Timing => ({
  startedAt: session.startedAt,
  finishedAt: session.finishedAt,
  calcUnlockedAt: session.calcUnlockedAt,
});

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
  private title = '';
  private saved = { board: '', review: '', timing: '' };
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

    const [scenario, secret, board, review, interviewer] = await Promise.all([
      db().from('scenarios').select('*').eq('id', row.scenario_id).single(),
      staff ? db().from('scenario_private').select('content').eq('scenario_id', row.scenario_id).maybeSingle() : null,
      db().from('interview_boards').select('board').eq('interview_id', id).maybeSingle(),
      staff ? db().from('interview_reviews').select('session').eq('interview_id', id).maybeSingle() : null,
      db().from('profiles').select('id, name, email, avatar_url').eq('id', row.interviewer_id).maybeSingle(),
    ]);
    const candidate =
      staff && row.candidate_id
        ? (must(
            await db().from('profiles').select('id, name, email, avatar_url').eq('id', row.candidate_id).maybeSingle(),
          ) as ProfileRow | null)
        : null;
    this.candidate = candidate ? toPerson(candidate) : null;
    this.createdAt = row.created_at;
    const base = fromScenario(
      must(scenario) as ScenarioRow,
      secret ? ((must(secret) as { content: Partial<Scenario> } | null)?.content ?? null) : null,
    );
    const answer = (must(board) as { board: Board } | null)?.board ?? emptyBoard();
    const work = review ? ((must(review) as { session: Partial<Session> } | null)?.session ?? {}) : {};
    const who = must(interviewer) as ProfileRow | null;
    this.interviewer = who ? toPerson(who) : null;
    this.title = base.title;

    const design = migrate({
      ...base,
      id,
      ...answer,
      session: {
        ...emptySession(),
        ...work,
        startedAt: row.started_at ?? undefined,
        finishedAt: row.finished_at ?? undefined,
        calcUnlockedAt: row.calc_unlocked_at ?? undefined,
      },
    });
    // Снимки в журнал — только изменения: доска, с которой пришли, уже известна.
    this.snapshot = { board: JSON.stringify(pickBoard(design)), at: 0 };
    this.saved = {
      board: JSON.stringify(pickBoard(design)),
      review: JSON.stringify(reviewPart(design.session)),
      timing: JSON.stringify(timing(design.session)),
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

    const review = JSON.stringify(reviewPart(design.session));
    if (review !== this.saved.review) {
      must(
        await db()
          .from('interview_reviews')
          .upsert({ interview_id: this.interviewId, session: reviewPart(design.session) }),
      );
      this.saved.review = review;
    }

    const next = timing(design.session);
    const serialized = JSON.stringify(next);
    if (serialized !== this.saved.timing) {
      must(
        await db()
          .from('interviews')
          .update({
            started_at: next.startedAt ?? null,
            finished_at: next.finishedAt ?? null,
            calc_unlocked_at: next.calcUnlockedAt ?? null,
            status: next.finishedAt ? 'finished' : next.startedAt ? 'live' : 'scheduled',
          })
          .eq('id', this.interviewId),
      );
      this.saved.timing = serialized;
    }
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

// ─── Адрес ──────────────────────────────────────────────────────────────────
// ?invite=<token> — приглашение кандидату, ?interview=<id> — открытое собеседование.

export function paramFromUrl(name: 'invite' | 'interview' | 'join'): string | null {
  const value = new URL(location.href).searchParams.get(name);
  if (!value) return null;
  if (name === 'interview') return isCloudId(value) ? value : null;
  return /^[0-9a-f]{48}$/.test(value) ? value : null;
}

export function setParams(params: Partial<Record<'invite' | 'interview' | 'join' | 'role', string | null>>) {
  const url = new URL(location.href);
  for (const [name, value] of Object.entries(params)) {
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  history.replaceState(null, '', url);
}

export function inviteUrl(token: string, param: 'invite' | 'join' = 'invite'): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(param, token);
  return url.toString();
}

/** Ссылка на само собеседование — коллегам по пространству: откроют отчёт и запись. */
export function interviewUrl(id: string): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('interview', id);
  return url.toString();
}

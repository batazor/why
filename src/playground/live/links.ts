import { db, isCloudId, must } from './db';
import type { Workspace, WorkspaceRole } from './workspaces';
import { migrate, type Design } from '../model';

/**
 * Ссылки и приглашения: короткие ссылки из базы, предпросмотр приглашения до
 * входа и всё, что про адрес — параметры, готовые ссылки, письмо.
 */

// ─── Ссылки из базы ─────────────────────────────────────────────────────────

export type ShareRole = 'candidate' | 'trainee' | 'interviewer' | 'author';

export interface ShareLink {
  id: string;
  token: string;
  role: ShareRole;
  title: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  opens: number;
  lastOpenedAt: string | null;
}

interface ShareRow {
  id: string;
  token: string;
  role: ShareRole;
  title: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  opens: number;
  last_opened_at: string | null;
}

const toShare = (row: ShareRow): ShareLink => ({
  id: row.id,
  token: row.token,
  role: row.role,
  title: row.title,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  opens: row.opens,
  lastOpenedAt: row.last_opened_at,
});

export async function listShares(scenarioId: string): Promise<ShareLink[]> {
  const rows = must(
    await db()
      .from('shares')
      .select('id, token, role, title, created_at, expires_at, revoked_at, opens, last_opened_at')
      .eq('scenario_id', scenarioId)
      .order('created_at', { ascending: false }),
  ) as ShareRow[];
  return rows.map(toShare);
}

/**
 * Сохранить ссылку. В базу уходит уже урезанный проект — тот, что собрал
 * `shared()`: сервер не знает, что в сценарии секрет, это решает автор.
 */
export async function createShare(
  workspace: Workspace,
  scenarioId: string,
  role: ShareRole,
  design: Design,
  days: number | null,
): Promise<ShareLink> {
  const row = must(
    await db()
      .from('shares')
      .insert({
        workspace_id: workspace.id,
        scenario_id: scenarioId,
        role,
        title: design.title,
        payload: design,
        expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
      })
      .select('id, token, role, title, created_at, expires_at, revoked_at, opens, last_opened_at')
      .single(),
  ) as ShareRow;
  return toShare(row);
}

export async function revokeShare(id: string): Promise<void> {
  must(await db().from('shares').update({ revoked_at: new Date().toISOString() }).eq('id', id));
}

/** Открыть ссылку — можно и без входа. Ошибка сервера — причина: нет, отозвана, истекла. */
export async function openShare(token: string): Promise<{ role: ShareRole; title: string; design: Design }> {
  const result = must(await db().rpc('open_share', { token })) as { role: ShareRole; title: string; design: unknown };
  return { role: result.role, title: result.title, design: migrate(result.design) };
}

// ─── Предпросмотр приглашения ───────────────────────────────────────────────

export interface InvitePreview {
  kind: 'interview' | 'team';
  workspace: string;
  title?: string;
  role?: WorkspaceRole;
  inviter: string;
  expiresAt: string | null;
  scheduledAt?: string | null;
  duration?: number;
  state: 'open' | 'taken' | 'expired' | 'over';
  /** Маска почты, если приглашение на неё: d***@mail.test. */
  email: string | null;
}

/** Что за приглашение — до входа: кто зовёт, куда, живо ли. null — такого нет. */
export async function invitePreview(kind: 'interview' | 'team', token: string): Promise<InvitePreview | null> {
  const row = must(await db().rpc('invite_preview', { kind, token })) as {
    kind: 'interview' | 'team';
    workspace: string;
    title?: string;
    role?: WorkspaceRole;
    inviter: string;
    expires_at: string | null;
    scheduled_at?: string | null;
    duration?: number;
    state: InvitePreview['state'];
    email: string | null;
  } | null;
  return row
    ? {
        kind: row.kind,
        workspace: row.workspace,
        title: row.title,
        role: row.role,
        inviter: row.inviter,
        expiresAt: row.expires_at,
        scheduledAt: row.scheduled_at ?? null,
        duration: row.duration,
        state: row.state,
        email: row.email,
      }
    : null;
}

// ─── Адрес ──────────────────────────────────────────────────────────────────
// ?invite=<token> — приглашение кандидату, ?interview=<id> — открытое собеседование.

export function paramFromUrl(name: 'invite' | 'interview' | 'join' | 'share'): string | null {
  const value = new URL(location.href).searchParams.get(name);
  if (!value) return null;
  if (name === 'interview') return isCloudId(value) ? value : null;
  if (name === 'share') return /^[0-9a-f]{32}$/.test(value) ? value : null;
  return /^[0-9a-f]{48}$/.test(value) ? value : null;
}

export function setParams(params: Partial<Record<'invite' | 'interview' | 'join' | 'share' | 'role', string | null>>) {
  const url = new URL(location.href);
  for (const [name, value] of Object.entries(params)) {
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  history.replaceState(null, '', url);
}

export function inviteUrl(token: string, param: 'invite' | 'join' | 'share' = 'invite'): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(param, token);
  return url.toString();
}

/**
 * Письмо со ссылкой — через почтовую программу человека. Сервер писем не
 * шлёт: без своего SMTP письма Supabase уходят со служебного адреса и
 * попадают в спам, а так приглашение приходит от того, кто зовёт.
 */
export function mailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Ссылка на само собеседование — коллегам по пространству: откроют отчёт и запись. */
export function interviewUrl(id: string): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('interview', id);
  return url.toString();
}

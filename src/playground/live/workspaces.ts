import { db, must, toPerson, type ProfileRow } from './db';
import type { Person } from './auth';

/**
 * Пространство и его команда: кто в нём и в какой роли, приглашения в
 * команду, выбор пространства, если их несколько.
 */

export type WorkspaceRole = 'owner' | 'author' | 'interviewer';

export interface Workspace {
  id: string;
  name: string;
  role: WorkspaceRole;
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
  expiresAt: string | null;
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
      .select('id, role, email, token, created_at, expires_at, accepted_by')
      .eq('workspace_id', workspace)
      .order('created_at', { ascending: false }),
  ) as {
    id: string;
    role: WorkspaceRole;
    email: string | null;
    token: string;
    created_at: string;
    expires_at: string | null;
    accepted_by: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    email: row.email,
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
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

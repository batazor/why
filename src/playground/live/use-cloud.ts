import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Person } from './auth';
import { CloudRepository, HybridRepository } from './scenarios';
import { InterviewRepository, claimInvite } from './interviews';
import { acceptTeamInvite, ensureWorkspace, preferredWorkspace, type Workspace } from './workspaces';
import { invitePreview, paramFromUrl, setParams, type InvitePreview } from './links';
import type { DesignRepository } from '../storage';

/**
 * Где сейчас работает песочница.
 *
 * - local — как до сервера: не настроено или человек не вошёл;
 * - loading — ждём сессию, пространство или приём приглашения;
 * - gate — пришли по приглашению (на собеседование или в команду) или в
 *   собеседование, а войти ещё не вошли — или приглашение не принялось;
 * - workspace — вошёл: сценарии пространства рядом с проектами браузера;
 * - interview — открыто собеседование, роль выводится из него.
 */
export type Cloud =
  | { mode: 'local' }
  | { mode: 'loading' }
  | { mode: 'gate'; kind: 'interview' | 'team'; error?: string; preview?: InvitePreview | null }
  | { mode: 'workspace'; workspace: Workspace; repo: HybridRepository }
  | { mode: 'interview'; repo: InterviewRepository };

interface Auth {
  enabled: boolean;
  ready: boolean;
  me: Person | null;
}

export function useCloud(auth: Auth, local: DesignRepository, workspaceName: string) {
  const [invite, setInvite] = useState(() => (auth.enabled ? paramFromUrl('invite') : null));
  const [join, setJoin] = useState(() => (auth.enabled ? paramFromUrl('join') : null));
  const [interview, setInterview] = useState(() => (auth.enabled ? paramFromUrl('interview') : null));
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  /** Счётчик перечитываний пространства: сменил роль, ушёл из команды, переименовал. */
  const [generation, setGeneration] = useState(0);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string>();

  const meId = auth.me?.id;

  /**
   * Что за приглашение — ещё до входа. undefined — не загружено, null —
   * такого нет. Мёртвое приглашение показывается сразу, без входа впустую.
   */
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  useEffect(() => {
    const token = invite ?? join;
    if (!token || !auth.enabled) return;
    let alive = true;
    invitePreview(invite ? 'interview' : 'team', token)
      .then((found) => alive && setPreview(found))
      .catch(() => alive && setPreview(undefined));
    return () => {
      alive = false;
    };
  }, [invite, join, auth.enabled]);

  // Приглашение принимается один раз, сразу после входа; дальше в адресе уже собеседование.
  useEffect(() => {
    if (!invite || !meId) return;
    let alive = true;
    claimInvite(invite)
      .then((id) => {
        if (!alive) return;
        setParams({ invite: null, interview: id, role: null });
        setInvite(null);
        setInterview(id);
      })
      .catch((reason: Error) => alive && setError(reason.message));
    return () => {
      alive = false;
    };
  }, [invite, meId]);

  // Приглашение в команду: принял — и сразу в этом пространстве.
  useEffect(() => {
    if (!join || !meId) return;
    let alive = true;
    acceptTeamInvite(join)
      .then((id) => {
        if (!alive) return;
        preferredWorkspace.set(id);
        setParams({ join: null });
        setJoin(null);
        setGeneration((value) => value + 1);
      })
      .catch((reason: Error) => alive && setError(reason.message));
    return () => {
      alive = false;
    };
  }, [join, meId]);

  const needWorkspace = Boolean(meId) && !invite && !join && !interview;
  useEffect(() => {
    if (!needWorkspace || !meId) return;
    let alive = true;
    setOffline(false);
    ensureWorkspace(meId, workspaceName)
      .then((found) => {
        if (!alive) return;
        // Тот же объект, если ничего не поменялось: иначе хранилище пересоздалось бы зря.
        setWorkspace((current) =>
          current && current.id === found.id && current.name === found.name && current.role === found.role ? current : found,
        );
      })
      // Сервер недоступен — работаем локально, а не держим человека на заставке.
      .catch((reason: Error) => {
        console.warn('workspace unavailable:', reason.message);
        if (alive) setOffline(true);
      });
    return () => {
      alive = false;
    };
  }, [needWorkspace, workspaceName, meId, generation]);

  // Вышел из учётки — пространство чужое.
  useEffect(() => {
    if (!meId) setWorkspace(null);
  }, [meId]);

  // Хранилище зависит только от id пространства: переименование не должно перезагружать проекты.
  const workspaceId = workspace?.id;
  const repo = useMemo(
    () => (workspace ? new HybridRepository(local, new CloudRepository(workspace)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceId, local],
  );

  // Одно собеседование — одно хранилище: пересоздавать его — значит заново грузить собеседование.
  const interviewRepo = useMemo(
    () => (interview && meId ? new InterviewRepository(interview, meId) : null),
    [interview, meId],
  );

  const cloud: Cloud = useMemo(() => {
    if (!auth.enabled) return { mode: 'local' };
    if (!auth.ready) return { mode: 'loading' };
    if (invite || interview || join) {
      const kind = join ? 'team' : 'interview';
      if (!meId || error) return { mode: 'gate', kind, error, preview };
      if (invite || join) return { mode: 'loading' };
      return { mode: 'interview', repo: interviewRepo! };
    }
    if (!meId) return { mode: 'local' };
    if (!workspace || !repo) return offline ? { mode: 'local' } : { mode: 'loading' };
    return { mode: 'workspace', workspace, repo };
  }, [auth.enabled, auth.ready, meId, invite, interview, join, error, preview, workspace, repo, interviewRepo, offline]);

  const openInterview = useCallback((id: string) => {
    setParams({ interview: id, role: null, scenario: null });
    setInterview(id);
  }, []);

  const leave = useCallback(() => {
    setParams({ interview: null, invite: null, join: null });
    setInterview(null);
    setInvite(null);
    setJoin(null);
    setError(undefined);
  }, []);

  const switchWorkspace = useCallback((next: Workspace) => {
    preferredWorkspace.set(next.id);
    setWorkspace(next);
  }, []);

  /** Перечитать своё место в пространстве: роль, имя — или что из него ушёл. */
  const reloadWorkspace = useCallback(() => setGeneration((value) => value + 1), []);

  return { cloud, openInterview, leave, switchWorkspace, reloadWorkspace };
}

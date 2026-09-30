import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Person } from './auth';
import {
  CloudRepository,
  HybridRepository,
  InterviewRepository,
  claimInvite,
  ensureWorkspace,
  paramFromUrl,
  setParams,
  type Workspace,
} from './cloud';
import type { DesignRepository } from '../storage';

/**
 * Где сейчас работает песочница.
 *
 * - local — как до сервера: не настроено или человек не вошёл;
 * - loading — ждём сессию, пространство или приём приглашения;
 * - gate — пришли по приглашению или в собеседование, а войти ещё не вошли
 *   (или приглашение не принялось);
 * - workspace — вошёл: сценарии пространства рядом с проектами браузера;
 * - interview — открыто собеседование, роль выводится из него.
 */
export type Cloud =
  | { mode: 'local' }
  | { mode: 'loading' }
  | { mode: 'gate'; error?: string }
  | { mode: 'workspace'; workspace: Workspace; repo: HybridRepository }
  | { mode: 'interview'; repo: InterviewRepository };

interface Auth {
  enabled: boolean;
  ready: boolean;
  me: Person | null;
}

export function useCloud(auth: Auth, local: DesignRepository, workspaceName: string) {
  const [invite, setInvite] = useState(() => (auth.enabled ? paramFromUrl('invite') : null));
  const [interview, setInterview] = useState(() => (auth.enabled ? paramFromUrl('interview') : null));
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string>();

  const meId = auth.me?.id;

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

  const needWorkspace = Boolean(meId) && !invite && !interview;
  useEffect(() => {
    if (!needWorkspace || !meId) return;
    let alive = true;
    setOffline(false);
    ensureWorkspace(meId, workspaceName)
      .then((found) => alive && setWorkspace(found))
      // Сервер недоступен — работаем локально, а не держим человека на заставке.
      .catch((reason: Error) => {
        console.warn('workspace unavailable:', reason.message);
        if (alive) setOffline(true);
      });
    return () => {
      alive = false;
    };
  }, [needWorkspace, workspaceName, meId]);

  // Вышел из учётки — пространство чужое.
  useEffect(() => {
    if (!meId) setWorkspace(null);
  }, [meId]);

  const cloud: Cloud = useMemo(() => {
    if (!auth.enabled) return { mode: 'local' };
    if (!auth.ready) return { mode: 'loading' };
    if (invite || interview) {
      if (!meId || error) return { mode: 'gate', error };
      if (invite) return { mode: 'loading' };
      return { mode: 'interview', repo: new InterviewRepository(interview!, meId) };
    }
    if (!meId) return { mode: 'local' };
    if (!workspace) return offline ? { mode: 'local' } : { mode: 'loading' };
    return { mode: 'workspace', workspace, repo: new HybridRepository(local, new CloudRepository(workspace)) };
  }, [auth.enabled, auth.ready, meId, invite, interview, error, workspace, offline, local]);

  const openInterview = useCallback((id: string) => {
    setParams({ interview: id, role: null });
    setInterview(id);
  }, []);

  const leave = useCallback(() => {
    setParams({ interview: null, invite: null });
    setInterview(null);
    setInvite(null);
    setError(undefined);
  }, []);

  return { cloud, openInterview, leave };
}

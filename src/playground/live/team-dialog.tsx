import { useCallback, useEffect, useState } from 'react';
import {
  createTeamInvite,
  inviteUrl,
  listMembers,
  listTeamInvites,
  listWorkspaces,
  removeMember,
  renameWorkspace,
  revokeTeamInvite,
  setMemberRole,
  type Member,
  type TeamInvite,
  type Workspace,
  type WorkspaceRole,
} from './cloud';
import type { Person } from './auth';
import type { T } from '../i18n';

/**
 * Команда пространства: кто в ней и в какой роли, приглашения и выбор
 * пространства, если их несколько.
 *
 * Права решает сервер: менять роли, звать и удалять может только владелец,
 * последнего владельца не понизить и не удалить. Интерфейс показывает
 * кнопки по тем же правилам, а ошибку сервера — как есть, если что-то
 * разошлось.
 */

const ROLES: WorkspaceRole[] = ['owner', 'author', 'interviewer'];

export function TeamDialog({
  t,
  lang,
  me,
  workspace,
  onSwitch,
  onChanged,
  onClose,
}: {
  t: T;
  lang: string;
  me: Person;
  workspace: Workspace;
  /** Открыть другое пространство. */
  onSwitch: (next: Workspace) => void;
  /** Что-то поменялось в своём месте в пространстве: имя, роль, ушёл сам. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const [spaces, setSpaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [name, setName] = useState(workspace.name);
  const [role, setRole] = useState<WorkspaceRole>('interviewer');
  const [email, setEmail] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState('');
  const owner = workspace.role === 'owner';

  /** Любое действие — одинаково: попробовать, показать ошибку сервера, перечитать. */
  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
    } catch (reason) {
      setError(explain((reason as Error).message, t));
    }
    await refresh();
  };

  const refresh = useCallback(async () => {
    try {
      const [all, people, pending] = await Promise.all([
        listWorkspaces(me.id),
        listMembers(workspace.id),
        owner ? listTeamInvites(workspace.id) : Promise.resolve([]),
      ]);
      setSpaces(all);
      setMembers(people);
      setInvites(pending);
    } catch (reason) {
      setError((reason as Error).message);
      setMembers([]);
    }
  }, [me.id, workspace.id, owner]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async (invite: TeamInvite) => {
    setShown(invite.id);
    try {
      await navigator.clipboard.writeText(inviteUrl(invite.token, 'join'));
      setCopied(invite.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* буфер недоступен — ссылка видна полем */
    }
  };

  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' });

  return (
    <div className="pg-dialog" role="dialog" aria-modal="true" aria-label={t('team.title')} onClick={onClose}>
      <div className="pg-dialog__box pg-share" onClick={(event) => event.stopPropagation()}>
        <header className="pg-dialog__head">
          <h3>{t('team.title')}</h3>
          <button type="button" className="pg-icon-button" aria-label={t('comp.close')} onClick={onClose}>
            <i className="codicon codicon-close" aria-hidden="true" />
          </button>
        </header>

        <div className="pg-share__body">
          {spaces.length > 1 && (
            <label className="pg-field">
              <span className="pg-field__label">{t('team.workspace')}</span>
              <select
                className="pg-input pg-select"
                value={workspace.id}
                onChange={(event) => {
                  const next = spaces.find((item) => item.id === event.currentTarget.value);
                  if (next) onSwitch(next);
                }}
              >
                {spaces.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {t(`team.role.${item.role}`)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <form
            className="pg-field"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() && name.trim() !== workspace.name)
                run(async () => {
                  await renameWorkspace(workspace.id, name.trim());
                  onChanged();
                });
            }}
          >
            <span className="pg-field__label">{t('team.name')}</span>
            <div className="pg-iv-new">
              <input
                className="pg-input"
                value={name}
                disabled={!owner}
                maxLength={80}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              {owner && (
                <button type="submit" className="pg-button" disabled={!name.trim() || name.trim() === workspace.name}>
                  {t('team.rename')}
                </button>
              )}
            </div>
          </form>

          {error && <p className="pg-note pg-note--warn">{error}</p>}

          <div className="pg-field">
            <span className="pg-field__label">
              {t('team.members')} <span className="pg-count">{members?.length ?? 0}</span>
            </span>
            {members === null ? (
              <p className="pg-hint">{t('iv.loading')}</p>
            ) : (
              <ul className="pg-iv-list">
                {members.map((member) => {
                  const self = member.person.id === me.id;
                  return (
                    <li key={member.person.id} className="pg-iv">
                      <div className="pg-iv__row">
                        <span className="pg-iv__who">
                          <strong>
                            {member.person.name}
                            {self && ` · ${t('team.you')}`}
                          </strong>
                          <span className="pg-hint">{member.email || t('team.guest')}</span>
                        </span>
                        {owner ? (
                          <select
                            className="pg-input pg-select"
                            value={member.role}
                            aria-label={t('team.roleOf', { name: member.person.name })}
                            onChange={(event) => {
                              const next = event.currentTarget.value as WorkspaceRole;
                              run(async () => {
                                await setMemberRole(workspace.id, member.person.id, next);
                                if (self) onChanged();
                              });
                            }}
                          >
                            {ROLES.map((item) => (
                              <option key={item} value={item}>
                                {t(`team.role.${item}`)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="pg-hint">{t(`team.role.${member.role}`)}</span>
                        )}
                        {(owner || self) && (
                          <button
                            type="button"
                            className="pg-icon-button"
                            title={t(self ? 'team.leave' : 'team.remove')}
                            aria-label={t(self ? 'team.leave' : 'team.remove')}
                            onClick={() => {
                              if (!confirm(t(self ? 'team.leaveConfirm' : 'team.removeConfirm', { name: member.person.name })))
                                return;
                              run(async () => {
                                await removeMember(workspace.id, member.person.id);
                                if (self) onChanged();
                              });
                            }}
                          >
                            <i className={`codicon codicon-${self ? 'sign-out' : 'trash'}`} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="pg-hint">{t('team.rolesHint')}</p>
          </div>

          {owner && (
            <form
              className="pg-field"
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  const id = await createTeamInvite(workspace.id, role, email);
                  setEmail('');
                  setShown(id);
                });
              }}
            >
              <span className="pg-field__label">{t('team.invite')}</span>
              <div className="pg-iv-new">
                <select
                  className="pg-input pg-select"
                  value={role}
                  aria-label={t('team.inviteRole')}
                  onChange={(event) => setRole(event.currentTarget.value as WorkspaceRole)}
                >
                  {ROLES.map((item) => (
                    <option key={item} value={item}>
                      {t(`team.role.${item}`)}
                    </option>
                  ))}
                </select>
                <input
                  className="pg-input"
                  type="email"
                  placeholder={t('team.email')}
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                />
                <button type="submit" className="pg-button">
                  <i className="codicon codicon-add" aria-hidden="true" /> {t('iv.create')}
                </button>
              </div>
              <p className="pg-hint">{t('team.inviteHint')}</p>

              {invites.length > 0 && (
                <ul className="pg-iv-list">
                  {invites.map((invite) => (
                    <li key={invite.id} className={`pg-iv ${invite.accepted ? 'is-cancelled' : ''}`}>
                      <div className="pg-iv__row">
                        <span className="pg-iv__who">
                          <strong>{invite.email ?? t('iv.byLink')}</strong>
                          <span className="pg-hint">
                            {t(`team.role.${invite.role}`)} · {date.format(new Date(invite.createdAt))}
                            {invite.accepted ? ` · ${t('team.accepted')}` : ''}
                          </span>
                        </span>
                        {!invite.accepted && (
                          <button type="button" className="pg-button pg-button--small" onClick={() => copy(invite)}>
                            <i className={`codicon codicon-${copied === invite.id ? 'check' : 'link'}`} aria-hidden="true" />{' '}
                            {t(copied === invite.id ? 'share.copied' : 'iv.copy')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="pg-icon-button"
                          title={t('team.revoke')}
                          aria-label={t('team.revoke')}
                          onClick={() => run(() => revokeTeamInvite(invite.id))}
                        >
                          <i className="codicon codicon-close" aria-hidden="true" />
                        </button>
                      </div>
                      {shown === invite.id && !invite.accepted && (
                        <input
                          className="pg-input pg-iv__link"
                          readOnly
                          value={inviteUrl(invite.token, 'join')}
                          aria-label={t('iv.link')}
                          onFocus={(event) => event.currentTarget.select()}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Ошибки сервера, которые человек может исправить сам, — словами. */
function explain(message: string, t: T): string {
  if (message.includes('at least one owner')) return t('team.lastOwner');
  return message;
}

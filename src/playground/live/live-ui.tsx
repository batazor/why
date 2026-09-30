import { useState, type CSSProperties } from 'react';
import { ViewportPortal, useViewport } from '@xyflow/react';
import type { Person } from './auth';
import { colorOf, type Peer, type Point } from './presence';
import type { RoomStatus } from './room';
import type { InvitePreview } from './links';
import { formatSchedule } from './calendar';
import { Menu, MenuItem, MenuNote, MenuSeparator } from '../menu';
import type { Role } from '../roles';
import type { T } from '../i18n';

/**
 * Курсоры других участников поверх полотна.
 *
 * Точка приходит в координатах схемы, и ViewportPortal ставит её туда же,
 * куда встал бы блок. Портал масштабируется вместе с полотном — стрелка с
 * подписью растягивалась бы с ним, поэтому её масштаб обратный.
 *
 * В комнате цвет говорит о роли: кандидат или интервьюер. Над сценарием
 * пространства роли у всех похожие, и цвет — свой у каждого (byPerson).
 */
export function RemoteCursors({
  cursors,
  peers,
  byPerson = false,
}: {
  cursors: Record<string, Point>;
  peers: Peer[];
  byPerson?: boolean;
}) {
  const { zoom } = useViewport();
  const byKey = new Map(peers.map((peer) => [peer.key, peer]));
  return (
    <ViewportPortal>
      {Object.entries(cursors).map(([key, point]) => {
        const peer = byKey.get(key);
        if (!peer) return null;
        return (
          <div
            key={key}
            className={byPerson ? 'pg-cursor' : `pg-cursor pg-cursor--${peer.role}`}
            style={
              {
                transform: `translate(${point.x}px, ${point.y}px) scale(${1 / zoom})`,
                ...(byPerson && { '--pg-cursor': colorOf(peer.person.id) }),
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <svg width="16" height="20" viewBox="0 0 16 20">
              <path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" />
            </svg>
            <span className="pg-cursor__name">{peer.person.name}</span>
          </div>
        );
      })}
    </ViewportPortal>
  );
}

/** Кольцо аватара: цвет роли в комнате или свой цвет человека над сценарием. */
export function Avatar({ person, role, color }: { person: Person; role?: Role; color?: string }) {
  const initials = person.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className={`pg-avatar ${role ? `pg-avatar--${role}` : ''}`} style={color ? { boxShadow: `0 0 0 2px ${color}` } : undefined}>
      {/* Google отдаёт аватар с 403, если видит чужой Referer. */}
      {person.avatar ? <img src={person.avatar} alt="" referrerPolicy="no-referrer" /> : initials}
    </span>
  );
}

/**
 * Вход гостем: одно поле имени, без почты. Заодно позволяет проверить
 * собеседование в двух окнах без двух Google-аккаунтов.
 */
function GuestForm({ t, onSubmit }: { t: T; onSubmit: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="pg-guest"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        setError((await onSubmit(name.trim())) ?? '');
        setBusy(false);
      }}
    >
      <input
        className="pg-input"
        placeholder={t('guest.name')}
        aria-label={t('guest.name')}
        value={name}
        maxLength={60}
        autoFocus
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <button type="submit" className="pg-button" disabled={busy || !name.trim()}>
        {t('guest.enter')}
      </button>
      {error && <span className="pg-guest__error">{error}</span>}
    </form>
  );
}

interface BarProps {
  t: T;
  role: Role;
  me: Person | null;
  ready: boolean;
  /** Открыто собеседование: показываем комнату. */
  inRoom: boolean;
  /** Собеседование закончено: комната больше не «в эфире» и никого не ждёт. */
  finished?: boolean;
  /** В пространстве: его название в меню и пункт «Команда». */
  workspaceName?: string;
  onTeam?: () => void;
  /** Перейти в кабинет интервьюера — отдельную страницу. */
  onCabinet?: () => void;
  status: RoomStatus;
  /** В комнате — её участники; над сценарием пространства — коллеги, открывшие его же. */
  peers: Peer[];
  onSignIn: () => void;
  /** Вход гостем — только если сервер его разрешает. */
  onGuest?: (name: string) => Promise<string | null>;
  onSignOut: () => void;
  /** Выйти из собеседования к сценариям пространства. Кандидату некуда — ему не передаётся. */
  onLeave?: () => void;
}

/**
 * Вход и комната в строке инструментов.
 *
 * Входят все: без учётки песочница не открывается ни в одной роли.
 */
export function LiveBar({
  t,
  role,
  me,
  ready,
  inRoom,
  finished = false,
  workspaceName,
  onTeam,
  onCabinet,
  status,
  peers,
  onSignIn,
  onGuest,
  onSignOut,
  onLeave,
}: BarProps) {
  const [asGuest, setAsGuest] = useState(false);
  if (!ready) return null;

  if (!me) {
    if (asGuest && onGuest) return <GuestForm t={t} onSubmit={onGuest} />;
    return (
      <span className="pg-live">
        <button type="button" className="pg-button" onClick={onSignIn} title={t('live.signInHint')}>
          <i className="codicon codicon-account" aria-hidden="true" /> {t('live.signIn')}
        </button>
        {onGuest && (
          <button type="button" className="pg-button" onClick={() => setAsGuest(true)} title={t('guest.hint')}>
            <i className="codicon codicon-person" aria-hidden="true" /> {t('guest.button')}
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="pg-live">
      {inRoom && (
        <>
          {finished ? (
            <span className="pg-live__status is-over">
              <i className="codicon codicon-pass" aria-hidden="true" /> {t('live.over')}
            </span>
          ) : (
            <span className={`pg-live__status is-${status}`} title={t(`live.status.${status}`)}>
              <i className="codicon codicon-circle-filled" aria-hidden="true" /> {t('live.room')}
            </span>
          )}
          {finished ? null : peers.length ? (
            <span className="pg-live__peers">
              {peers.map((peer) => (
                <span key={peer.key} title={`${peer.person.name} · ${t(`role.${peer.role}`)}`}>
                  <Avatar person={peer.person} role={peer.role} />
                </span>
              ))}
            </span>
          ) : (
            <span className="pg-live__alone">{t(role === 'interviewer' ? 'live.waitCandidate' : 'live.waitInterviewer')}</span>
          )}
          {onLeave && (
            <button type="button" className="pg-button" onClick={onLeave}>
              <i className="codicon codicon-arrow-left" aria-hidden="true" /> {t('live.leave')}
            </button>
          )}
        </>
      )}
      {!inRoom && peers.length > 0 && (
        <span className="pg-live__peers">
          {peers.map((peer) => (
            <span key={peer.key} title={t('live.here', { name: peer.person.name })}>
              <Avatar person={peer.person} color={colorOf(peer.person.id)} />
            </span>
          ))}
        </span>
      )}
      <Menu label={me.name} align="right" trigger={<Avatar person={me} />}>
        <MenuNote>
          <strong>{me.name}</strong>
          {workspaceName && <span>{workspaceName}</span>}
        </MenuNote>
        {onCabinet && (
          <MenuItem icon="dashboard" onClick={onCabinet}>
            {t('cab.button')}
          </MenuItem>
        )}
        {onTeam && (
          <MenuItem icon="organization" onClick={onTeam}>
            {t('team.button')}
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem icon="sign-out" onClick={onSignOut}>
          {t('menu.signOut')}
        </MenuItem>
      </Menu>
    </span>
  );
}

/**
 * Заставка вместо песочницы: пришли по приглашению или в собеседование, а
 * войти ещё не вошли — или сервер приглашение не принял.
 *
 * Что за приглашение, видно до входа: кто зовёт, куда и до какого числа.
 * Мёртвое — принятое, истёкшее, отменённое — не предлагает войти: входить
 * незачем, нужна новая ссылка.
 */
export function Gate({
  t,
  lang,
  kind = 'interview',
  preview,
  me,
  error,
  onSignIn,
  onGuest,
  onSignOut,
  onLeave,
}: {
  t: T;
  lang: string;
  /** Куда звали: на собеседование или в команду. */
  kind?: 'interview' | 'team';
  /** undefined — ещё не загружено (или не приглашение), null — такого приглашения нет. */
  preview?: InvitePreview | null;
  me: Person | null;
  error?: string;
  onSignIn: () => void;
  onGuest?: (name: string) => Promise<string | null>;
  onSignOut: () => void;
  onLeave: () => void;
}) {
  const dead: Reason | null =
    preview === null ? 'missing' : preview && preview.state !== 'open' ? (preview.state as Reason) : null;
  const reason = error ? explain(error) : dead;
  const team = kind === 'team';
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long' });
  // Приглашение на почту гость принять не может: почты у него нет.
  const guestAllowed = onGuest && !preview?.email;

  return (
    <div className="pg pg-gate">
      <div className="pg-gate__box">
        <i className="codicon codicon-organization pg-gate__icon" aria-hidden="true" />
        <h2>{t(reason ? (team ? 'gate.team.failed' : 'gate.failed') : team ? 'gate.team.title' : 'gate.title')}</h2>

        {preview && (
          <div className="pg-gate__invite">
            <p>
              {team
                ? t('gate.preview.team', { inviter: preview.inviter, workspace: preview.workspace, role: t(`team.role.${preview.role}`) })
                : t('gate.preview.interview', { inviter: preview.inviter, title: preview.title ?? '', workspace: preview.workspace })}
            </p>
            {preview.state === 'open' && preview.scheduledAt && (
              <p>
                <strong>
                  {t('gate.preview.when', { when: formatSchedule({ at: preview.scheduledAt, minutes: preview.duration ?? 60 }, lang, t) })}
                </strong>
              </p>
            )}
            {preview.state === 'open' && preview.expiresAt && (
              <p className="pg-hint">{t('gate.preview.until', { date: date.format(new Date(preview.expiresAt)) })}</p>
            )}
            {preview.state === 'open' && preview.email && (
              <p className="pg-hint">{t('gate.preview.email', { email: preview.email })}</p>
            )}
          </div>
        )}

        <p>{reason ? t(`gate.error.${reason}`, { name: me?.name ?? '' }) : t(team ? 'gate.team.body' : 'gate.body')}</p>

        {!me && !reason && (
          <button type="button" className="pg-button pg-button--primary" onClick={onSignIn}>
            <i className="codicon codicon-account" aria-hidden="true" /> {t('live.signIn')}
          </button>
        )}
        {!me && !reason && guestAllowed && (
          <>
            <span className="pg-hint">{t('guest.or')}</span>
            <GuestForm t={t} onSubmit={onGuest} />
          </>
        )}
        {reason && (
          <div className="pg-actions">
            {me && reason === 'email' && (
              <button type="button" className="pg-button" onClick={onSignOut}>
                <i className="codicon codicon-account" aria-hidden="true" /> {t('gate.switch')}
              </button>
            )}
            <button type="button" className="pg-button" onClick={onLeave}>
              {t('gate.leave')}
            </button>
          </div>
        )}
        <p className="pg-hint">{t('gate.note')}</p>
      </div>
    </div>
  );
}

/**
 * Заставка на входе: учётки нет — входим через Google или гостем, в любой роли.
 *
 * Пропустить нельзя: работа без учётки и есть гость, только безымянный.
 * Гость — по одному имени, без почты; вход гостем показывается, только если
 * сервер его разрешает.
 */
export function WelcomeGate({
  t,
  onSignIn,
  onGuest,
}: {
  t: T;
  onSignIn: () => void;
  onGuest?: (name: string) => Promise<string | null>;
}) {
  return (
    <div className="pg pg-gate">
      <div className="pg-gate__box">
        <i className="codicon codicon-account pg-gate__icon" aria-hidden="true" />
        <h2>{t('welcome.title')}</h2>
        <p>{t('welcome.body')}</p>
        <button type="button" className="pg-button pg-button--primary" onClick={onSignIn}>
          <i className="codicon codicon-account" aria-hidden="true" /> {t('live.signIn')}
        </button>
        {onGuest && (
          <>
            <span className="pg-gate__or">{t('welcome.or')}</span>
            <GuestForm t={t} onSubmit={onGuest} />
            <p className="pg-hint">{t('welcome.guestNote')}</p>
          </>
        )}
        <p className="pg-hint">{t('gate.note')}</p>
      </div>
    </div>
  );
}

type Reason = 'email' | 'taken' | 'over' | 'expired' | 'staff' | 'missing' | 'other';

/** Сообщение сервера из claim_interview / accept_workspace_invite — в понятную причину. */
function explain(message: string): Reason {
  if (message.includes('another email')) return 'email';
  if (message.includes('already accepted')) return 'taken';
  if (message.includes('is over')) return 'over';
  if (message.includes('expired')) return 'expired';
  if (message.includes('staff')) return 'staff';
  if (message.includes('not found')) return 'missing';
  return 'other';
}

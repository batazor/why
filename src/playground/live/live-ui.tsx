import { ViewportPortal, useViewport } from '@xyflow/react';
import type { Person } from './auth';
import type { Peer, Point, RoomStatus } from './room';
import type { Role } from '../roles';
import type { T } from '../i18n';

/**
 * Курсоры других участников поверх полотна.
 *
 * Точка приходит в координатах схемы, и ViewportPortal ставит её туда же,
 * куда встал бы блок. Портал масштабируется вместе с полотном — стрелка с
 * подписью растягивалась бы с ним, поэтому её масштаб обратный.
 */
export function RemoteCursors({ cursors, peers }: { cursors: Record<string, Point>; peers: Peer[] }) {
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
            className={`pg-cursor pg-cursor--${peer.role}`}
            style={{ transform: `translate(${point.x}px, ${point.y}px) scale(${1 / zoom})` }}
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

function Avatar({ person, role }: { person: Person; role?: Role }) {
  const initials = person.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className={`pg-avatar ${role ? `pg-avatar--${role}` : ''}`}>
      {/* Google отдаёт аватар с 403, если видит чужой Referer. */}
      {person.avatar ? <img src={person.avatar} alt="" referrerPolicy="no-referrer" /> : initials}
    </span>
  );
}

interface BarProps {
  t: T;
  role: Role;
  me: Person | null;
  ready: boolean;
  /** Открыто собеседование: показываем комнату. */
  inRoom: boolean;
  status: RoomStatus;
  peers: Peer[];
  onSignIn: () => void;
  onSignOut: () => void;
  /** Выйти из собеседования к сценариям пространства. Кандидату некуда — ему не передаётся. */
  onLeave?: () => void;
}

/**
 * Вход и комната в строке инструментов.
 *
 * Вход нужен автору (сценарии в пространстве) и интервьюеру (собеседования).
 * Тренировка остаётся локальной, а кандидат входит по приглашению — у него
 * своя заставка.
 */
export function LiveBar({ t, role, me, ready, inRoom, status, peers, onSignIn, onSignOut, onLeave }: BarProps) {
  if (!ready) return null;

  if (!me) {
    if (role !== 'author' && role !== 'interviewer') return null;
    return (
      <button type="button" className="pg-button" onClick={onSignIn} title={t('live.signInHint')}>
        <i className="codicon codicon-account" aria-hidden="true" /> {t('live.signIn')}
      </button>
    );
  }

  return (
    <span className="pg-live">
      {inRoom && (
        <>
          <span className={`pg-live__status is-${status}`} title={t(`live.status.${status}`)}>
            <i className="codicon codicon-circle-filled" aria-hidden="true" /> {t('live.room')}
          </span>
          {peers.length ? (
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
      <button type="button" className="pg-live__me" onClick={onSignOut} title={t('live.signOut', { name: me.name })}>
        <Avatar person={me} />
      </button>
    </span>
  );
}

/**
 * Заставка вместо песочницы: пришли по приглашению или в собеседование, а
 * войти ещё не вошли — или сервер приглашение не принял.
 */
export function Gate({
  t,
  me,
  error,
  onSignIn,
  onSignOut,
  onLeave,
}: {
  t: T;
  me: Person | null;
  error?: string;
  onSignIn: () => void;
  onSignOut: () => void;
  onLeave: () => void;
}) {
  const reason = error ? explain(error) : null;
  return (
    <div className="pg pg-gate">
      <div className="pg-gate__box">
        <i className="codicon codicon-organization pg-gate__icon" aria-hidden="true" />
        <h2>{t(error ? 'gate.failed' : 'gate.title')}</h2>
        <p>{error ? t(`gate.error.${reason}`, { name: me?.name ?? '' }) : t('gate.body')}</p>
        {!me && (
          <button type="button" className="pg-button pg-button--primary" onClick={onSignIn}>
            <i className="codicon codicon-account" aria-hidden="true" /> {t('live.signIn')}
          </button>
        )}
        {me && error && (
          <div className="pg-actions">
            {reason === 'email' && (
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

/** Сообщение сервера из claim_interview — в понятную причину. */
function explain(message: string): 'email' | 'taken' | 'over' | 'staff' | 'missing' | 'other' {
  if (message.includes('another email')) return 'email';
  if (message.includes('already accepted')) return 'taken';
  if (message.includes('is over')) return 'over';
  if (message.includes('staff')) return 'staff';
  if (message.includes('not found')) return 'missing';
  return 'other';
}

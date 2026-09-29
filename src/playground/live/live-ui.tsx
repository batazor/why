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
  room: string | null;
  status: RoomStatus;
  peers: Peer[];
  onSignIn: () => void;
  onSignOut: () => void;
  onStart: () => void;
  onLeave: () => void;
}

/**
 * Вход и комната в строке инструментов.
 *
 * Совместная работа нужна только собеседованию: автору и тренировке кнопка
 * входа ни к чему, пока их не позвали в комнату.
 */
export function LiveBar({ t, role, me, ready, room, status, peers, onSignIn, onSignOut, onStart, onLeave }: BarProps) {
  const interview = role === 'interviewer' || role === 'candidate';
  if (!ready || (!interview && !room)) return null;

  if (!me) {
    return (
      <button type="button" className={`pg-button ${room ? 'pg-button--primary' : ''}`} onClick={onSignIn}>
        <i className="codicon codicon-account" aria-hidden="true" /> {t(room ? 'live.signInToJoin' : 'live.signIn')}
      </button>
    );
  }

  return (
    <span className="pg-live">
      {room ? (
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
          <button type="button" className="pg-icon-button" onClick={onLeave} title={t('live.leave')} aria-label={t('live.leave')}>
            <i className="codicon codicon-debug-disconnect" aria-hidden="true" />
          </button>
        </>
      ) : (
        role === 'interviewer' && (
          <button type="button" className="pg-button" onClick={onStart} title={t('live.startHint')}>
            <i className="codicon codicon-broadcast" aria-hidden="true" /> {t('live.start')}
          </button>
        )
      )}
      <button type="button" className="pg-live__me" onClick={onSignOut} title={t('live.signOut', { name: me.name })}>
        <Avatar person={me} />
      </button>
    </span>
  );
}

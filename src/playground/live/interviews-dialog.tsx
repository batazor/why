import { useCallback, useEffect, useState } from 'react';
import { cancelInterview, createInterview, listInterviews, refreshSnapshot, renewInvite, reschedule, type Interview, type Schedule } from './interviews';
import { inviteUrl, mailtoUrl } from './links';
import { scenarioUpdatedAt as fetchScenarioUpdatedAt } from './scenarios';
import { type Workspace } from './workspaces';
import { LinkBox, mailBody } from './cloud-share';
import { CalendarButtons, ScheduleFields, formatSchedule } from './calendar';
import type { T } from '../i18n';

/**
 * Собеседования по сценарию: кого позвали, кто уже принял, что закончено.
 *
 * Приглашение — ссылка с секретом. Почта необязательна: без неё ссылку
 * примет первый вошедший, с ней — только владелец этой почты. Второй раз
 * принять ссылку нельзя, так что переслать её дальше кандидат не сможет.
 */
export function InterviewsDialog({
  t,
  lang,
  workspace,
  scenarioId,
  title,
  onOpen,
  onClose,
}: {
  t: T;
  lang: string;
  workspace: Workspace;
  scenarioId: string;
  /** Название сценария — для письма с приглашением. */
  title: string;

  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Interview[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  /** Какое приглашение показано ссылкой: буфер обмена есть не везде, а ссылку можно выделить руками. */
  const [shown, setShown] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Schedule>({ at: null, minutes: 60 });
  /** Какое собеседование сейчас переносят и на когда. */
  const [moving, setMoving] = useState<{ id: string; schedule: Schedule } | null>(null);
  /** Когда сценарий правили последний раз на сервере — чтобы заметить, что снимок отстал. */
  const [scenarioUpdatedAt, setScenarioUpdatedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, updated] = await Promise.all([listInterviews(scenarioId), fetchScenarioUpdatedAt(scenarioId)]);
      setItems(list);
      setScenarioUpdatedAt(updated);
    } catch (reason) {
      setError((reason as Error).message);
      setItems([]);
    }
  }, [scenarioId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const id = await createInterview(workspace, scenarioId, email, schedule);
      setEmail('');
      setSchedule({ at: null, minutes: 60 });
      await refresh();
      setShown(id);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (item: Interview) => {
    setShown(item.id);
    try {
      await navigator.clipboard.writeText(inviteUrl(item.inviteToken));
      setCopied(item.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* буфер недоступен */
    }
  };

  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="pg-dialog" role="dialog" aria-modal="true" aria-label={t('iv.title')} onClick={onClose}>
      <div className="pg-dialog__box pg-share" onClick={(event) => event.stopPropagation()}>
        <header className="pg-dialog__head">
          <h3>{t('iv.title')}</h3>
          <button type="button" className="pg-icon-button" aria-label={t('comp.close')} onClick={onClose}>
            <i className="codicon codicon-close" aria-hidden="true" />
          </button>
        </header>

        <div className="pg-share__body">
          <form
            className="pg-field"
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            <span className="pg-field__label">{t('iv.new')}</span>
            <ScheduleFields t={t} value={schedule} onChange={setSchedule} />
            <div className="pg-iv-new">
              <input
                className="pg-input"
                type="email"
                placeholder={t('iv.email')}
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
              <button type="submit" className="pg-button" disabled={busy}>
                <i className="codicon codicon-add" aria-hidden="true" /> {t('iv.create')}
              </button>
            </div>
            <p className="pg-hint">{t('iv.emailHint')}</p>
          </form>

          {error && <p className="pg-note pg-note--warn">{error}</p>}

          {items === null ? (
            <p className="pg-hint">{t('iv.loading')}</p>
          ) : items.length === 0 ? (
            <p className="pg-hint">{t('iv.empty')}</p>
          ) : (
            <ul className="pg-iv-list">
              {items.map((item) => {
                const open = item.status === 'scheduled' || item.status === 'live';
                const pending = !item.candidate && open;
                const expired = pending && item.inviteExpiresAt !== null && Date.parse(item.inviteExpiresAt) <= Date.now();
                const when = formatSchedule({ at: item.scheduledAt, minutes: item.durationMinutes }, lang, t);
                const notStarted = item.status === 'scheduled' && !item.startedAt;
                // Сценарий правили после приглашения: до старта снимок можно подтянуть.
                const stale =
                  notStarted &&
                  item.snapshotOf !== null &&
                  scenarioUpdatedAt !== null &&
                  Date.parse(scenarioUpdatedAt) > Date.parse(item.snapshotOf) + 1000;
                const url = inviteUrl(item.inviteToken);
                return (
                  <li key={item.id} className={`pg-iv is-${item.status}`}>
                    <div className="pg-iv__row">
                    <span className="pg-iv__who">
                      <strong>{item.candidate?.name ?? item.candidateEmail ?? t('iv.byLink')}</strong>
                      <span className="pg-hint">
                        {t(`iv.status.${item.status}`)} · {when ? `${t('when.on')} ${when}` : date.format(new Date(item.createdAt))}
                        {pending ? ` · ${t('iv.notAccepted')}` : ''}
                        {pending && item.inviteExpiresAt
                          ? ` · ${expired ? t('link.expiredShort') : t('link.until', { date: date.format(new Date(item.inviteExpiresAt)) })}`
                          : ''}
                      </span>
                    </span>
                    {pending && !expired && (
                      <button type="button" className="pg-button pg-button--small" onClick={() => copy(item)}>
                        <i className={`codicon codicon-${copied === item.id ? 'check' : 'link'}`} aria-hidden="true" />{' '}
                        {t(copied === item.id ? 'share.copied' : 'iv.copy')}
                      </button>
                    )}
                    {notStarted && (
                      <button
                        type="button"
                        className="pg-button pg-button--small"
                        onClick={() =>
                          setMoving(
                            moving?.id === item.id
                              ? null
                              : { id: item.id, schedule: { at: item.scheduledAt, minutes: item.durationMinutes } },
                          )
                        }
                      >
                        <i className="codicon codicon-calendar" aria-hidden="true" /> {t(item.scheduledAt ? 'when.move' : 'when.set')}
                      </button>
                    )}
                    {pending && (
                      <button
                        type="button"
                        className="pg-button pg-button--small"
                        title={t('iv.renewHint')}
                        onClick={async () => {
                          if (!expired && !confirm(t('iv.renewConfirm'))) return;
                          try {
                            await renewInvite(item.id);
                            await refresh();
                            setShown(item.id);
                          } catch (reason) {
                            setError((reason as Error).message);
                          }
                        }}
                      >
                        <i className="codicon codicon-refresh" aria-hidden="true" /> {t('iv.renew')}
                      </button>
                    )}
                    {item.status !== 'cancelled' && (
                      <button type="button" className="pg-button pg-button--small" onClick={() => onOpen(item.id)}>
                        <i className="codicon codicon-play" aria-hidden="true" /> {t('iv.open')}
                      </button>
                    )}
                    {open && (
                      <button
                        type="button"
                        className="pg-icon-button"
                        title={t('iv.cancel')}
                        aria-label={t('iv.cancel')}
                        onClick={async () => {
                          if (!confirm(t('iv.cancelConfirm'))) return;
                          try {
                            await cancelInterview(item.id);
                            await refresh();
                          } catch (reason) {
                            setError((reason as Error).message);
                          }
                        }}
                      >
                        <i className="codicon codicon-close" aria-hidden="true" />
                      </button>
                    )}
                    </div>
                    {stale && (
                      <p className="pg-note pg-iv__stale">
                        {t('iv.stale')}{' '}
                        <button
                          type="button"
                          className="pg-link-button"
                          onClick={async () => {
                            try {
                              await refreshSnapshot(item.id);
                              await refresh();
                            } catch (reason) {
                              setError((reason as Error).message);
                            }
                          }}
                        >
                          {t('iv.refresh')}
                        </button>
                      </p>
                    )}
                    {moving?.id === item.id && (
                      <form
                        className="pg-iv__move"
                        onSubmit={async (event) => {
                          event.preventDefault();
                          try {
                            await reschedule(item.id, moving.schedule);
                            setMoving(null);
                            await refresh();
                          } catch (reason) {
                            setError((reason as Error).message);
                          }
                        }}
                      >
                        <ScheduleFields t={t} value={moving.schedule} onChange={(next) => setMoving({ id: item.id, schedule: next })} />
                        <button type="submit" className="pg-button pg-button--small">
                          {t('when.save')}
                        </button>
                      </form>
                    )}
                    {shown === item.id && pending && !expired && (
                      <LinkBox
                        t={t}
                        url={url}
                        expires={item.inviteExpiresAt ? t('link.until', { date: date.format(new Date(item.inviteExpiresAt)) }) : t('link.forever')}
                        mail={mailtoUrl(
                          item.candidateEmail ?? '',
                          t('link.mail.subject.candidate', { title, workspace: workspace.name }),
                          mailBody(t, 'candidate', title, workspace.name, url, when),
                        )}
                        extra={
                          item.scheduledAt && (
                            <CalendarButtons
                              t={t}
                              event={{
                                title: t('when.eventTitle', { title }),
                                details: t('when.eventDetails'),
                                url,
                                start: item.scheduledAt,
                                minutes: item.durationMinutes,
                                guest: item.candidateEmail ?? undefined,
                              }}
                            />
                          )
                        }
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

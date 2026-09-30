import { useEffect, useMemo, useState } from 'react';
import { cabinet, type CalibrationRow } from './calibration';
import { formatSchedule } from './calendar';
import type { Person } from './auth';
import { duration, isNotable } from '../integrity';
import type { T } from '../i18n';

/**
 * Кабинет интервьюера: все собеседования пространства на одном экране.
 *
 * Сверху — что впереди: назначенные и идущие, ближайшие первыми, — кто
 * проходит, по какому сценарию, принято ли приглашение. Ниже — что прошло:
 * кандидат, сценарий, когда и сколько, кто вёл, итог и заметные сигналы.
 * Строка открывает собеседование; прошедшее — сразу с отчётом.
 *
 * Итог здесь один на строку, без критериев: сценарии разные, и столбцы по
 * критериям сравнимы только внутри одного — для этого есть «Сравнение».
 */
export function CabinetDialog({
  t,
  lang,
  me,
  workspaceId,
  onOpen,
  onClose,
}: {
  t: T;
  lang: string;
  me: Person;
  workspaceId: string;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CalibrationRow[] | null>(null);
  const [error, setError] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [withCancelled, setWithCancelled] = useState(false);

  useEffect(() => {
    cabinet(workspaceId)
      .then(setRows)
      .catch((reason: Error) => {
        setError(reason.message);
        setRows([]);
      });
  }, [workspaceId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const now = Date.now();
  /** Моё — назначил я или ставил оценку я. */
  const mine = (row: CalibrationRow) =>
    row.scheduledBy.id === me.id || row.reviews.some((review) => review.reviewer.id === me.id);
  const shown = useMemo(() => (rows ?? []).filter((row) => !onlyMine || mine(row)), [rows, onlyMine, me.id]);

  /** Впереди: идущие первыми, потом назначенные по времени, без времени — в конце. */
  const upcoming = useMemo(
    () =>
      shown
        .filter((row) => row.status === 'scheduled' || row.status === 'live')
        .sort((a, b) => {
          if ((a.status === 'live') !== (b.status === 'live')) return a.status === 'live' ? -1 : 1;
          if (a.scheduledAt && b.scheduledAt) return a.scheduledAt.localeCompare(b.scheduledAt);
          if (a.scheduledAt || b.scheduledAt) return a.scheduledAt ? -1 : 1;
          return b.at.localeCompare(a.at);
        }),
    [shown],
  );

  /** Прошло: свежие сверху; отменённые — только по просьбе. */
  const past = useMemo(
    () =>
      shown
        .filter((row) => row.status === 'finished' || (withCancelled && row.status === 'cancelled'))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [shown, withCancelled],
  );

  const scored = past.filter((row) => row.total !== null);
  const average = scored.length ? Math.round(scored.reduce((sum, row) => sum + row.total!, 0) / scored.length) : null;

  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });
  const today = new Date().toDateString();

  return (
    <div className="pg-dialog" role="dialog" aria-modal="true" aria-label={t('cab.title')} onClick={onClose}>
      <div className="pg-dialog__box pg-cab" onClick={(event) => event.stopPropagation()}>
        <header className="pg-dialog__head">
          <h3>{t('cab.title')}</h3>
          <button type="button" className="pg-icon-button" aria-label={t('comp.close')} onClick={onClose}>
            <i className="codicon codicon-close" aria-hidden="true" />
          </button>
        </header>

        <div className="pg-share__body">
          <div className="pg-cal__bar">
            <label className="pg-toggle">
              <input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.currentTarget.checked)} />
              {t('cab.mine')}
            </label>
            <label className="pg-toggle">
              <input type="checkbox" checked={withCancelled} onChange={(event) => setWithCancelled(event.currentTarget.checked)} />
              {t('cab.cancelled')}
            </label>
            <span className="pg-hint pg-cab__summary">
              {t('cab.summary', {
                upcoming: String(upcoming.length),
                finished: String(past.filter((row) => row.status === 'finished').length),
                avg: average === null ? '—' : `${average}%`,
              })}
            </span>
          </div>

          {error && <p className="pg-note pg-note--warn">{error}</p>}

          {rows === null ? (
            <p className="pg-hint">{t('iv.loading')}</p>
          ) : !upcoming.length && !past.length ? (
            <p className="pg-hint">{t('cab.empty')}</p>
          ) : (
            <>
              <section className="pg-cab__section">
                <h4>
                  {t('cab.upcoming')} <span className="pg-count">{upcoming.length}</span>
                </h4>
                {upcoming.length ? (
                  <div className="pg-cal__scroll">
                    <table className="pg-cal__table pg-cab__table">
                      <thead>
                        <tr>
                          <th>{t('cab.when')}</th>
                          <th>{t('report.candidate')}</th>
                          <th>{t('cab.scenario')}</th>
                          <th>{t('report.status')}</th>
                          <th>{t('cab.scheduledBy')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {upcoming.map((row) => {
                          const live = row.status === 'live';
                          const when = formatSchedule({ at: row.scheduledAt, minutes: row.durationMinutes }, lang, t);
                          const isToday = row.scheduledAt !== null && new Date(row.scheduledAt).toDateString() === today;
                          const overdue = !live && row.scheduledAt !== null && Date.parse(row.scheduledAt) < now;
                          return (
                            <tr key={row.id} className={live ? 'is-live' : ''} onClick={() => onOpen(row.id)} title={t('iv.open')}>
                              <td>
                                {when ? (
                                  <>
                                    {isToday && <strong>{t('cab.today')} · </strong>}
                                    {when}
                                  </>
                                ) : (
                                  <span className="pg-hint">{t('cab.unscheduled')}</span>
                                )}
                              </td>
                              <td>
                                <strong>{row.candidate || t('iv.byLink')}</strong>
                              </td>
                              <td>{row.scenarioTitle || t('pg.untitled')}</td>
                              <td className={live ? 'is-live' : overdue ? 'is-warn' : ''}>
                                {live ? (
                                  <>
                                    <i className="codicon codicon-circle-filled" aria-hidden="true" /> {t('iv.status.live')}
                                  </>
                                ) : overdue ? (
                                  t('cab.overdue')
                                ) : row.accepted ? (
                                  t('cab.accepted')
                                ) : (
                                  t('iv.notAccepted')
                                )}
                              </td>
                              <td>{row.scheduledBy.name}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="pg-hint">{t('cab.emptyUpcoming')}</p>
                )}
              </section>

              <section className="pg-cab__section">
                <h4>
                  {t('cab.past')} <span className="pg-count">{past.length}</span>
                </h4>
                {past.length ? (
                  <div className="pg-cal__scroll">
                    <table className="pg-cal__table pg-cab__table">
                      <thead>
                        <tr>
                          <th>{t('report.date')}</th>
                          <th>{t('report.candidate')}</th>
                          <th>{t('cab.scenario')}</th>
                          <th>{t('report.interviewer')}</th>
                          <th>{t('score.total')}</th>
                          <th title={t('cal.signalsHint')}>{t('cal.signals')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {past.map((row) => {
                          const cancelled = row.status === 'cancelled';
                          const notable = row.signals.filter((signal) => isNotable(signal, now)).length;
                          return (
                            <tr
                              key={row.id}
                              className={cancelled ? 'is-static' : ''}
                              onClick={cancelled ? undefined : () => onOpen(row.id)}
                              title={cancelled ? undefined : t('cal.open')}
                            >
                              <td>
                                {date.format(new Date(row.at))}
                                {row.durationMs !== null && <span className="pg-hint"> · {duration(row.durationMs)}</span>}
                                {cancelled && <span className="pg-hint"> · {t('iv.status.cancelled')}</span>}
                              </td>
                              <td>
                                <strong>{row.candidate || t('iv.byLink')}</strong>
                              </td>
                              <td>{row.scenarioTitle || t('pg.untitled')}</td>
                              <td title={row.reviews.map((review) => `${review.reviewer.name}: ${review.total ?? '—'}%`).join('\n')}>
                                {row.interviewers.map((person) => person.name).join(', ')}
                              </td>
                              <td className="pg-cal__total">
                                {row.total !== null ? `${row.total}%` : cancelled ? '—' : <span className="pg-hint">{t('cab.noScore')}</span>}
                              </td>
                              <td className={notable ? 'is-warn' : ''}>{cancelled ? '' : notable}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="pg-hint">{t('cab.emptyPast')}</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

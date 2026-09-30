import { useState } from 'react';
import { totalScore, type Design, type Signal } from '../model';
import { duration, summarize } from '../integrity';
import { interviewUrl } from './cloud';
import type { Person } from './auth';
import type { Snapshot } from './journal';
import type { T } from '../i18n';

/**
 * Отчёт по собеседованию: всё, что нужно тому, кто решает о найме, на одной
 * странице — кто, когда и сколько, оценки по критериям, заметки, что
 * подсказали, сигналы и запись того, как росла доска.
 *
 * Ссылка на отчёт — ссылка на само собеседование: коллеги по пространству
 * откроют его с теми же правами. Для всех остальных — печать в PDF.
 *
 * Запись доски управляет самим полотном: ползунок подменяет доску на экране
 * снимком из журнала, «Сейчас» возвращает живую.
 */

interface Props {
  design: Design;
  signals: Signal[];
  snapshots: Snapshot[];
  replay: number | null;
  onReplay: (index: number | null) => void;
  interviewId: string;
  candidate: Person | null;
  interviewer: Person | null;
  createdAt: string;
  now: number;
  t: T;
  lang: string;
}

export function ReportPanel({
  design,
  signals,
  snapshots,
  replay,
  onReplay,
  interviewId,
  candidate,
  interviewer,
  createdAt,
  now,
  t,
  lang,
}: Props) {
  const [copied, setCopied] = useState(false);
  const { scenario, session } = design;
  const total = totalScore(scenario.rubric, session.scores);
  const summary = summarize(signals, now);
  const started = session.startedAt ? Date.parse(session.startedAt) : null;
  const ended = session.finishedAt ? Date.parse(session.finishedAt) : now;
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeStyle: 'short' });
  const position = replay ?? snapshots.length;

  /** Время снимка — от начала собеседования, если оно начато, иначе по часам. */
  const when = (at: string) =>
    started ? `+${duration(Date.parse(at) - started)}` : new Intl.DateTimeFormat(lang, { timeStyle: 'medium' }).format(new Date(at));

  const facts: Array<[string, string]> = [
    ['report.candidate', candidate?.name ?? t('iv.byLink')],
    ['report.interviewer', interviewer?.name ?? '—'],
    ['report.date', date.format(new Date(session.startedAt ?? createdAt))],
    ['report.duration', started ? duration(ended - started) : '—'],
    ['report.status', t(session.finishedAt ? 'iv.status.finished' : started ? 'iv.status.live' : 'iv.status.scheduled')],
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(interviewUrl(interviewId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* буфер недоступен */
    }
  };

  return (
    <div className="pg-panel pg-report">
      <header className="pg-report__head">
        <h3>{design.title || t('pg.untitled')}</h3>
        <dl className="pg-report__facts">
          {facts.map(([key, value]) => (
            <div key={key}>
              <dt>{t(key)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section>
        <div className="pg-total">
          <span>{t('score.total')}</span>
          <strong>{total === null ? '—' : `${total}%`}</strong>
        </div>
        {scenario.rubric.length ? (
          <table className="pg-report__table">
            <tbody>
              {scenario.rubric.map((item) => {
                const level = session.scores[item.id];
                return (
                  <tr key={item.id}>
                    <td>
                      {item.text}
                      {item.weight > 1 && <span className="pg-count">×{item.weight}</span>}
                    </td>
                    <td className={level === undefined ? 'is-empty' : `pg-level--${level}`}>
                      {level === undefined ? '—' : `${level} · ${t(`score.level${level}`)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="pg-hint">{t('conduct.none')}</p>
        )}
      </section>

      <section>
        <h4 className="pg-heading">{t('score.notes')}</h4>
        <p className="pg-report__notes">{session.notes.trim() || '—'}</p>
      </section>

      <section>
        <h4 className="pg-heading">{t('report.course')}</h4>
        <ul className="pg-report__list">
          <li>{t('report.hints', { n: String(session.revealed.length), of: String(scenario.hints.length) })}</li>
          <li>{t('report.questions', { n: String(session.asked.length), of: String(scenario.questions.length) })}</li>
          <li>
            {t('report.nodes', { n: String(design.nodes.length), edges: String(design.edges.length) })} ·{' '}
            {t('report.reqs', { n: String(design.requirements.length) })} · {t('report.api', { n: String(design.api.length) })}
          </li>
        </ul>
        {session.estimateSnapshot !== undefined && (
          <>
            <h4 className="pg-heading">{t('report.estimateBefore')}</h4>
            <p className="pg-report__notes">{session.estimateSnapshot.trim() || '—'}</p>
          </>
        )}
        {design.estimate.trim() && (
          <>
            <h4 className="pg-heading">{t('report.estimate')}</h4>
            <p className="pg-report__notes">{design.estimate}</p>
          </>
        )}
      </section>

      <section>
        <h4 className="pg-heading">{t('tab.signals')}</h4>
        <ul className="pg-report__list">
          <li className={summary.longest >= 30_000 ? 'is-warn' : ''}>
            {t('sig.stat.away')}: {summary.awayCount} · {duration(summary.awayTotal)}
          </li>
          <li className={summary.pastedChars >= 200 ? 'is-warn' : ''}>
            {t('sig.stat.paste')}: {summary.pastes} · {summary.pastedChars}
          </li>
          <li className={summary.devtools ? 'is-warn' : ''}>
            {t('sig.stat.devtools')}: {summary.devtools}
          </li>
          <li>
            {t('sig.stat.copy')}: {summary.copies}
          </li>
        </ul>
        <p className="pg-hint">{t('report.serverTime')}</p>
      </section>

      <section className="pg-report__replay">
        <h4 className="pg-heading">
          {t('report.replay')} <span className="pg-count">{snapshots.length}</span>
        </h4>
        {snapshots.length ? (
          <>
            <input
              type="range"
              min={0}
              max={snapshots.length}
              step={1}
              value={position}
              aria-label={t('report.replay')}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                onReplay(next >= snapshots.length ? null : next);
              }}
            />
            <div className="pg-report__replay-bar">
              <button
                type="button"
                className="pg-icon-button"
                disabled={position === 0}
                aria-label={t('report.prev')}
                onClick={() => onReplay(Math.max(0, position - 1))}
              >
                <i className="codicon codicon-chevron-left" aria-hidden="true" />
              </button>
              <span>
                {replay === null
                  ? t('report.now')
                  : t('report.frame', { n: String(position + 1), of: String(snapshots.length), at: when(snapshots[position].at) })}
              </span>
              <button
                type="button"
                className="pg-icon-button"
                disabled={replay === null}
                aria-label={t('report.next')}
                onClick={() => onReplay(position + 1 >= snapshots.length ? null : position + 1)}
              >
                <i className="codicon codicon-chevron-right" aria-hidden="true" />
              </button>
            </div>
          </>
        ) : (
          <p className="pg-hint">{t('report.noReplay')}</p>
        )}
      </section>

      <div className="pg-actions pg-report__actions">
        <button type="button" className="pg-button" onClick={() => window.print()}>
          <i className="codicon codicon-file-pdf" aria-hidden="true" /> {t('report.print')}
        </button>
        <button type="button" className="pg-button" onClick={copy} title={t('report.linkHint')}>
          <i className={`codicon codicon-${copied ? 'check' : 'link'}`} aria-hidden="true" />{' '}
          {t(copied ? 'share.copied' : 'report.link')}
        </button>
      </div>
    </div>
  );
}

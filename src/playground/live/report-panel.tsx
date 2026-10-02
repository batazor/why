import { useEffect, useState } from 'react';
import { blocksOf, totalScore, type Design, type Signal } from '../model';
import { duration, summarize } from '../integrity';
import { RequirementsTable } from '../req-doc';
import { interviewUrl } from './links';
import { type Feedback, type Review } from './interviews';
import type { Person } from './auth';
import type { Snapshot } from './journal';
import type { T } from '../i18n';

/**
 * Отчёт по собеседованию: всё, что нужно тому, кто решает о найме, на одной
 * странице — кто, когда и сколько, оценки по критериям, заметки, что
 * подсказали, требования кандидата и чем он их закрыл, сигналы и запись
 * того, как росла доска.
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
  /** Оценки всех ведущих и отзыв кандидата — с сервера. */
  loadReviews: () => Promise<Review[]>;
  loadFeedback: () => Promise<Feedback | null>;
  /** Отчёт на пол-экрана — таблица панели и записи шире. */
  wide: boolean;
  onToggleWide: () => void;
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
  loadReviews,
  loadFeedback,
  wide,
  onToggleWide,
  now,
  t,
  lang,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [others, setOthers] = useState<Review[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Чужие оценки и отзыв — при открытии отчёта; своя оценка — живая, из документа.
  useEffect(() => {
    loadReviews()
      .then((all) => setOthers(all.filter((review) => !review.mine)))
      .catch(() => setOthers([]));
    loadFeedback()
      .then(setFeedback)
      .catch(() => setFeedback(null));
  }, [loadReviews, loadFeedback]);
  const { scenario, session } = design;
  const mine = totalScore(scenario.rubric, session.scores);
  // Панель: итог — среднее по всем, кто поставил оценки; у каждого — свой столбец.
  const panel = [{ name: t('report.you'), scores: session.scores }, ...others.map((review) => ({ name: review.reviewer.name, scores: review.scores }))];
  const totals = panel.map((column) => totalScore(scenario.rubric, column.scores));
  const counted = totals.filter((value): value is number => value !== null);
  const total = others.length ? (counted.length ? Math.round(counted.reduce((sum, value) => sum + value, 0) / counted.length) : null) : mine;
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
    <div className={`pg-panel pg-report ${wide ? 'is-wide' : ''}`}>
      <header className="pg-report__head">
        <div className="pg-report__title">
          <h3>{design.title || t('pg.untitled')}</h3>
          <button
            type="button"
            className="pg-icon-button pg-report__widen"
            onClick={onToggleWide}
            title={t(wide ? 'report.collapse' : 'report.expand')}
            aria-label={t(wide ? 'report.collapse' : 'report.expand')}
          >
            <i className={`codicon codicon-${wide ? 'screen-normal' : 'screen-full'}`} aria-hidden="true" />
          </button>
        </div>
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
        {scenario.rubric.length && others.length ? (
          <table className="pg-report__table">
            <thead>
              <tr>
                <th />
                {panel.map((column) => (
                  <th key={column.name}>{column.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scenario.rubric.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.text}
                    {item.weight > 1 && <span className="pg-count">×{item.weight}</span>}
                  </td>
                  {panel.map((column) => {
                    const level = column.scores[item.id];
                    return (
                      <td key={column.name} className={level === undefined ? 'is-empty' : `pg-level--${level}`}>
                        {level ?? '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td>{t('score.total')}</td>
                {totals.map((value, index) => (
                  <td key={panel[index].name}>
                    <strong>{value === null ? '—' : `${value}%`}</strong>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        ) : scenario.rubric.length ? (
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
        {others.length ? (
          [{ name: t('report.you'), notes: session.notes }, ...others.map((review) => ({ name: review.reviewer.name, notes: review.notes }))].map(
            (entry) => (
              <p key={entry.name} className="pg-report__notes">
                <strong>{entry.name}:</strong> {entry.notes.trim() || '—'}
              </p>
            ),
          )
        ) : (
          <p className="pg-report__notes">{session.notes.trim() || '—'}</p>
        )}
      </section>

      <section>
        <h4 className="pg-heading">{t('report.feedback')}</h4>
        {feedback ? (
          <>
            <p className="pg-report__stars" aria-label={t('fb.rated', { n: String(feedback.rating) })}>
              {'★'.repeat(feedback.rating)}
              <span className="is-off">{'★'.repeat(5 - feedback.rating)}</span>
            </p>
            {feedback.comment && <p className="pg-report__notes">{feedback.comment}</p>}
          </>
        ) : (
          <p className="pg-hint">{t('report.noFeedback')}</p>
        )}
      </section>

      <section>
        <h4 className="pg-heading">{t('report.course')}</h4>
        <ul className="pg-report__list">
          <li>{t('report.hints', { n: String(session.revealed.length), of: String(scenario.hints.length) })}</li>
          <li>{t('report.questions', { n: String(session.asked.length), of: String(scenario.questions.length) })}</li>
          <li>
            {t('report.nodes', { n: String(blocksOf(design.nodes).length), edges: String(design.edges.length) })} ·{' '}
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

      {/* Требования — как в документе: с блоками и маршрутами, которые их закрывают. Это и есть ответ, а не только схема. */}
      <section className="pg-report__reqs">
        <h4 className="pg-heading">
          {t('report.requirements')} <span className="pg-count">{design.requirements.length}</span>
        </h4>
        {design.requirements.length ? <RequirementsTable design={design} t={t} /> : <p className="pg-hint">{t('req.empty')}</p>}
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

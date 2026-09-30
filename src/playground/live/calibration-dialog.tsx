import { useEffect, useMemo, useState } from 'react';
import { calibration, type CalibrationRow } from './cloud';
import { duration, isNotable } from '../integrity';
import type { Criterion } from '../model';
import type { T } from '../i18n';

/**
 * Сравнение кандидатов по одному сценарию — калибровка.
 *
 * Строка — собеседование, столбцы — критерии. У каждого собеседования свой
 * снимок сценария, поэтому столбцы — объединение критериев всех снимков:
 * если критерий появился позже, у старых собеседований в нём пусто, а не
 * ноль. Итог каждого посчитан по его собственным критериям.
 *
 * Ниже — интервьюеры: сколько провели, средний итог и насколько он выше или
 * ниже среднего по сценарию. Большой сдвиг при нескольких собеседованиях —
 * повод свериться, как кто понимает критерии, а не приговор.
 */

/** Со скольких собеседований сдвиг интервьюера уже что-то значит, и какой сдвиг заметен. */
const MIN_FOR_BIAS = 2;
const BIAS_POINTS = 10;

export function CalibrationDialog({
  t,
  lang,
  scenarioId,
  title,
  onOpen,
  onClose,
}: {
  t: T;
  lang: string;
  scenarioId: string;
  title: string;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CalibrationRow[] | null>(null);
  const [error, setError] = useState('');
  const [onlyFinished, setOnlyFinished] = useState(true);

  useEffect(() => {
    calibration(scenarioId)
      .then(setRows)
      .catch((reason: Error) => {
        setError(reason.message);
        setRows([]);
      });
  }, [scenarioId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const now = Date.now();
  const shown = useMemo(
    () =>
      (rows ?? [])
        .filter((row) => !onlyFinished || row.status === 'finished')
        // Сильнейшие сверху; без оценок — в конце.
        .sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || b.at.localeCompare(a.at)),
    [rows, onlyFinished],
  );

  /** Столбцы — критерии всех снимков, в порядке самого свежего собеседования. */
  const criteria = useMemo(() => {
    const byRecency = [...shown].sort((a, b) => b.at.localeCompare(a.at));
    const seen = new Map<string, Criterion>();
    for (const row of byRecency) for (const item of row.rubric) if (!seen.has(item.id)) seen.set(item.id, item);
    return [...seen.values()];
  }, [shown]);

  const scored = shown.filter((row) => row.total !== null);
  const average = scored.length ? scored.reduce((sum, row) => sum + row.total!, 0) / scored.length : null;

  const perCriterion = criteria.map((item) => {
    const levels = shown.map((row) => row.scores[item.id]).filter((level): level is number => level !== undefined);
    return levels.length ? levels.reduce((sum, level) => sum + level, 0) / levels.length : null;
  });

  /**
   * Строгость — по оценкам каждого интервьюера, а не по итогу собеседования:
   * в панели двое могут оценить одного кандидата по-разному, и видно это
   * только так.
   */
  const interviewers = useMemo(() => {
    const groups = new Map<string, { name: string; totals: number[]; count: number }>();
    for (const row of shown)
      for (const person of row.interviewers) {
        const group = groups.get(person.id) ?? { name: person.name, totals: [] as number[], count: 0 };
        group.count += 1;
        const own = row.reviews.find((review) => review.reviewer.id === person.id);
        if (own?.total !== null && own?.total !== undefined) group.totals.push(own.total);
        groups.set(person.id, group);
      }
    return [...groups.values()].map((group) => {
      const mean = group.totals.length ? group.totals.reduce((sum, value) => sum + value, 0) / group.totals.length : null;
      return { ...group, mean, shift: mean !== null && average !== null ? mean - average : null };
    });
  }, [shown, average]);

  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' });

  const exportCsv = () => {
    const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const head = [
      t('report.candidate'),
      t('report.interviewer'),
      t('report.date'),
      t('report.duration'),
      t('score.total'),
      ...criteria.map((item) => item.text),
      t('cal.hints'),
      t('cal.signals'),
    ];
    const lines = shown.map((row) => [
      row.candidate || t('iv.byLink'),
      row.interviewers.map((person) => person.name).join(', '),
      date.format(new Date(row.at)),
      row.durationMs ? duration(row.durationMs) : '',
      row.total ?? '',
      ...criteria.map((item) => row.scores[item.id] ?? ''),
      `${row.revealed}/${row.hints}`,
      row.signals.filter((signal) => isNotable(signal, now)).length,
    ]);
    const csv = [head, ...lines].map((line) => line.map(cell).join(',')).join('\r\n');
    // BOM — чтобы Excel открыл кириллицу как есть.
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${title.trim().replace(/[^\p{L}\p{N}]+/gu, '-') || 'scenario'}-calibration.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="pg-dialog" role="dialog" aria-modal="true" aria-label={t('cal.title')} onClick={onClose}>
      <div className="pg-dialog__box pg-cal" onClick={(event) => event.stopPropagation()}>
        <header className="pg-dialog__head">
          <h3>
            {t('cal.title')} · {title || t('pg.untitled')}
          </h3>
          <button type="button" className="pg-icon-button" aria-label={t('comp.close')} onClick={onClose}>
            <i className="codicon codicon-close" aria-hidden="true" />
          </button>
        </header>

        <div className="pg-share__body">
          <div className="pg-cal__bar">
            <label className="pg-toggle">
              <input type="checkbox" checked={onlyFinished} onChange={(event) => setOnlyFinished(event.currentTarget.checked)} />
              {t('cal.onlyFinished')}
            </label>
            <span className="pg-hint">
              {t('cal.summary', {
                n: String(shown.length),
                avg: average === null ? '—' : `${Math.round(average)}%`,
              })}
            </span>
            <button type="button" className="pg-button pg-button--small" onClick={exportCsv} disabled={!shown.length}>
              <i className="codicon codicon-cloud-download" aria-hidden="true" /> CSV
            </button>
          </div>

          {error && <p className="pg-note pg-note--warn">{error}</p>}

          {rows === null ? (
            <p className="pg-hint">{t('iv.loading')}</p>
          ) : !shown.length ? (
            <p className="pg-hint">{t('cal.empty')}</p>
          ) : (
            <>
              <div className="pg-cal__scroll">
                <table className="pg-cal__table">
                  <thead>
                    <tr>
                      <th>{t('report.candidate')}</th>
                      <th>{t('report.interviewer')}</th>
                      <th>{t('report.date')}</th>
                      <th>{t('score.total')}</th>
                      {criteria.map((item) => (
                        <th key={item.id} className="pg-cal__crit" title={item.text}>
                          <span>{item.text}</span>
                          {item.weight > 1 && <span className="pg-count">×{item.weight}</span>}
                        </th>
                      ))}
                      <th title={t('cal.hintsHint')}>{t('cal.hints')}</th>
                      <th title={t('cal.signalsHint')}>{t('cal.signals')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => {
                      const notable = row.signals.filter((signal) => isNotable(signal, now)).length;
                      const own = new Set(row.rubric.map((item) => item.id));
                      return (
                        <tr key={row.id} onClick={() => onOpen(row.id)} title={t('cal.open')}>
                          <td>
                            <strong>{row.candidate || t('iv.byLink')}</strong>
                            {row.status !== 'finished' && <span className="pg-hint"> · {t(`iv.status.${row.status}`)}</span>}
                          </td>
                          <td title={row.reviews.map((review) => `${review.reviewer.name}: ${review.total ?? '—'}%`).join('\n')}>
                            {row.interviewers.map((person) => person.name).join(', ')}
                          </td>
                          <td>
                            {date.format(new Date(row.at))}
                            {row.durationMs && <span className="pg-hint"> · {duration(row.durationMs)}</span>}
                          </td>
                          <td className="pg-cal__total">{row.total === null ? '—' : `${row.total}%`}</td>
                          {criteria.map((item) => {
                            const level = row.scores[item.id];
                            return (
                              <td
                                key={item.id}
                                className={`pg-cal__level ${level === undefined ? 'is-empty' : `pg-level--${Math.round(level)}`}`}
                                title={own.has(item.id) ? undefined : t('cal.notInSnapshot')}
                              >
                                {own.has(item.id) ? (level === undefined ? '—' : Number.isInteger(level) ? level : level.toFixed(1)) : '·'}
                              </td>
                            );
                          })}
                          <td>
                            {row.revealed}/{row.hints}
                          </td>
                          <td className={notable ? 'is-warn' : ''}>{notable}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>{t('cal.average')}</td>
                      <td className="pg-cal__total">{average === null ? '—' : `${Math.round(average)}%`}</td>
                      {perCriterion.map((value, index) => (
                        <td key={criteria[index].id} className="pg-cal__level">
                          {value === null ? '—' : value.toFixed(1)}
                        </td>
                      ))}
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="pg-field">
                <span className="pg-field__label">{t('cal.interviewers')}</span>
                <ul className="pg-iv-list">
                  {interviewers.map((person) => {
                    const biased = person.shift !== null && person.totals.length >= MIN_FOR_BIAS && Math.abs(person.shift) >= BIAS_POINTS;
                    return (
                      <li key={person.name} className="pg-iv">
                        <div className="pg-iv__row">
                          <span className="pg-iv__who">
                            <strong>{person.name}</strong>
                            <span className="pg-hint">
                              {t('cal.conducted', { n: String(person.count) })}
                              {person.mean !== null && ` · ${t('cal.mean', { value: `${Math.round(person.mean)}%` })}`}
                              {person.shift !== null &&
                                ` · ${person.shift >= 0 ? '+' : '−'}${Math.abs(Math.round(person.shift))} ${t('cal.vsAverage')}`}
                            </span>
                          </span>
                          {biased && (
                            <span className="pg-note pg-note--warn">{t(person.shift! > 0 ? 'cal.lenient' : 'cal.strict')}</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="pg-hint">{t('cal.biasHint')}</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

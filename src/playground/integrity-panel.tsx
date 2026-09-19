import { useEffect, useState } from 'react';
import { awayMs, duration, isNotable, summarize } from './integrity';
import type { Design, Signal } from './model';
import type { T } from './i18n';

/**
 * Сигналы честности для интервьюера: сводка сверху, лента событий под ней.
 *
 * Время в ленте — от старта сессии, если её запустили (так его удобно
 * сверять с таймером), иначе — по часам.
 */

const ICONS: Record<Signal['type'], string> = {
  away: 'eye-closed',
  resize: 'screen-full',
  devtools: 'tools',
  copy: 'copy',
  cut: 'copy',
  paste: 'clippy',
};

function when(signal: Signal, startedAt: string | undefined, lang: string) {
  if (startedAt) return `+${duration(Date.parse(signal.at) - Date.parse(startedAt))}`;
  return new Date(signal.at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Row({ signal, design, t, lang, now }: { signal: Signal; design: Design; t: T; lang: string; now: number }) {
  const [open, setOpen] = useState(false);
  const notable = isNotable(signal, now);

  let text: string;
  switch (signal.type) {
    case 'away':
      text = t(`sig.away.${signal.via}`, {
        time: signal.back ? duration(awayMs(signal, now)) : t('sig.stillAway'),
      });
      break;
    case 'resize':
      text = t('sig.resize', {
        from: signal.from?.join('×') ?? '?',
        to: signal.to?.join('×') ?? '?',
      });
      break;
    case 'devtools':
      text = t(`sig.devtools.${signal.via}`, { combo: signal.field ?? '' });
      break;
    case 'paste':
      text = t('sig.paste', { n: String(signal.length ?? 0), field: signal.field || '—' });
      break;
    default:
      text = t(`sig.${signal.type}`, { n: String(signal.length ?? 0) });
  }

  return (
    <li className={`pg-signal pg-signal--${signal.type} ${notable ? 'is-notable' : ''}`}>
      <span className="pg-signal__time">{when(signal, design.session.startedAt, lang)}</span>
      <i className={`codicon codicon-${ICONS[signal.type]} pg-signal__icon`} aria-hidden="true" />
      <span className="pg-signal__body">
        <span>{text}</span>
        {signal.text && (
          <>
            <button type="button" className="pg-signal__toggle" onClick={() => setOpen(!open)}>
              {open ? t('sig.hide') : t('sig.show')}
            </button>
            {open && (
              <pre className="pg-signal__text">
                {signal.text}
                {(signal.length ?? 0) > signal.text.length && '…'}
              </pre>
            )}
          </>
        )}
      </span>
    </li>
  );
}

export function IntegrityPanel({ design, t, lang }: { design: Design; t: T; lang: string }) {
  // Пока кандидат не вернулся, длительность ухода растёт — тикаем раз в секунду.
  const [now, setNow] = useState(() => Date.now());
  const open = design.session.signals.some((signal) => signal.type === 'away' && !signal.back);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  const [onlyNotable, setOnlyNotable] = useState(false);
  const signals = design.session.signals;
  const summary = summarize(signals, now);
  const shown = [...signals].reverse().filter((signal) => !onlyNotable || isNotable(signal, now));

  const stats: Array<[string, string, boolean]> = [
    ['sig.stat.away', `${summary.awayCount} · ${duration(summary.awayTotal)}`, summary.longest >= 30_000],
    ['sig.stat.paste', `${summary.pastes} · ${summary.pastedChars}`, summary.pastedChars >= 200],
    ['sig.stat.devtools', String(summary.devtools), summary.devtools > 0],
    ['sig.stat.copy', String(summary.copies), false],
    ['sig.stat.resize', String(summary.resizes), false],
  ];

  return (
    <div className="pg-panel">
      <p className="pg-note">{t('sig.intro')}</p>
      <dl className="pg-sig-stats">
        {stats.map(([key, value, warn]) => (
          <div key={key} className={warn ? 'is-warn' : ''}>
            <dt>{t(key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="pg-sig-bar">
        <h3 className="pg-heading">
          {t('sig.timeline')} <span className="pg-count">{signals.length}</span>
        </h3>
        <label className="pg-toggle">
          <input type="checkbox" checked={onlyNotable} onChange={(event) => setOnlyNotable(event.currentTarget.checked)} />
          {t('sig.onlyNotable')}
        </label>
      </div>

      {!shown.length && <p className="pg-hint pg-hint--empty">{t('sig.empty')}</p>}
      <ol className="pg-signals">
        {shown.map((signal) => (
          <Row key={signal.id} signal={signal} design={design} t={t} lang={lang} now={now} />
        ))}
      </ol>
    </div>
  );
}

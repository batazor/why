import { useEffect, useState } from 'react';
import type { Feedback } from './cloud';
import type { T } from '../i18n';

/**
 * Конец собеседования глазами кандидата.
 *
 * Раньше после «Стопа» у кандидата просто замерзала доска — непонятно,
 * закончилось всё или что-то сломалось. Теперь он видит, что собеседование
 * закончено, и может коротко оценить его: насколько понятной была задача и
 * как шло. Отзыв один, его читает команда интервьюеров.
 */
export function CandidateEnd({
  t,
  load,
  send,
  onClose,
}: {
  t: T;
  load: () => Promise<Feedback | null>;
  send: (rating: number, comment: string) => Promise<void>;
  onClose: () => void;
}) {
  const [sent, setSent] = useState<Feedback | null | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load()
      .then(setSent)
      .catch(() => setSent(null));
  }, [load]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await send(rating, comment);
      setSent({ rating, comment, createdAt: new Date().toISOString() });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pg-end" role="dialog" aria-label={t('end.title')}>
      <div className="pg-end__box">
        <i className="codicon codicon-pass pg-gate__icon" aria-hidden="true" />
        <h2>{t('end.title')}</h2>
        <p>{t('end.body')}</p>

        {sent === undefined ? null : sent ? (
          <p className="pg-note">{t('end.thanks')}</p>
        ) : (
          <form
            className="pg-end__form"
            onSubmit={(event) => {
              event.preventDefault();
              if (rating) submit();
            }}
          >
            <span className="pg-field__label">{t('end.ask')}</span>
            <div className="pg-stars" role="radiogroup" aria-label={t('end.ask')}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={t('fb.rated', { n: String(value) })}
                  className={value <= rating ? 'is-on' : ''}
                  onClick={() => setRating(value)}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              className="pg-input pg-textarea"
              rows={3}
              maxLength={2000}
              placeholder={t('end.comment')}
              value={comment}
              onChange={(event) => setComment(event.currentTarget.value)}
            />
            {error && <p className="pg-note pg-note--warn">{error}</p>}
            <button type="submit" className="pg-button pg-button--primary" disabled={!rating || busy}>
              {t('end.send')}
            </button>
          </form>
        )}

        <button type="button" className="pg-link-button" onClick={onClose}>
          {t('end.board')}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { RequirementMatchData } from '../../code/widgets';

/**
 * Итог разбора: решения против требований.
 *
 * Слева карточки решений из разбора, справа таблица требований целиком.
 * Читатель кладёт карточку на строку, которую она закрывает: перетаскиванием
 * или щелчком — сначала карточка, потом строка. Промах не просто красный: под
 * карточками объясняется, про что это решение на самом деле и куда оно ложится.
 *
 * Итог — все строки закрыты. Строка без карточки — требование, на которое
 * разбор так и не ответил; проверка в check-steps следит, чтобы таких не было.
 */

interface Props {
  data: RequirementMatchData;
  labels: Record<string, string>;
}

const DRAG = 'application/x-why-match';

type Feedback = { card: string; row: string; ok: boolean } | null;

export default function RequirementMatch({ data, labels }: Props) {
  const text = (key: string) => labels[key] ?? key;
  const fill = (key: string, vars: Record<string, string | number>) =>
    text(key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

  const rows = data.requirements.rows;
  const cardOf = (key: string) => data.cards.find((card) => card.key === key)!;

  /** Строка → карточки на ней. */
  const [placed, setPlaced] = useState<Record<string, string[]>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  /** Строка, на которую только что промахнулись: вздрагивает. */
  const [miss, setMiss] = useState<string | null>(null);

  useEffect(() => {
    if (!miss) return;
    const timer = setTimeout(() => setMiss(null), 450);
    return () => clearTimeout(timer);
  }, [miss]);

  /**
   * Карточки в случайном порядке: в колоде они стоят по ходу разбора, и
   * тогда порядок почти совпадал бы с таблицей — ответ подсказывала бы
   * раскладка. Перемешивание после монтирования: сервер рисует порядок
   * колоды, и разметка при гидрации с ним совпадает.
   */
  const [order, setOrder] = useState(() => data.cards.map((card) => card.key));
  const shuffle = () =>
    setOrder((keys) => {
      const next = [...keys];
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
  useEffect(shuffle, []);

  const covered = rows.filter((row) => placed[row.id]?.length).length;
  const done = covered === rows.length;

  function drop(cardKey: string, rowId: string) {
    const card = cardOf(cardKey);
    const ok = card.fits.includes(rowId);
    setFeedback({ card: cardKey, row: rowId, ok });
    setPicked(null);
    if (!ok) {
      setMiss(rowId);
      return;
    }
    setPlaced((current) => {
      const list = current[rowId] ?? [];
      return list.includes(cardKey) ? current : { ...current, [rowId]: [...list, cardKey] };
    });
  }

  /** Сколько строк карточки уже закрыто ею. */
  const usedRows = (key: string) => rows.filter((row) => placed[row.id]?.includes(key)).map((row) => row.id);

  function revealAll() {
    const all: Record<string, string[]> = {};
    for (const card of data.cards) {
      for (const id of card.fits) all[id] = [...(all[id] ?? []), card.key];
    }
    setPlaced(all);
    setFeedback(null);
    setPicked(null);
  }

  function reset() {
    setPlaced({});
    setFeedback(null);
    setPicked(null);
    shuffle();
  }

  const section = (kind: 'fr' | 'nfr') => (
    <div className={`match__section match__section--${kind}`}>
      <p className="match__kind">{text(`req.${kind}`)}</p>
      <ul className="match__rows">
        {rows
          .filter((row) => row.kind === kind)
          .map((row) => {
            const cards = placed[row.id] ?? [];
            return (
              <li
                key={row.id}
                className={[
                  'match__row',
                  cards.length ? 'is-answered' : '',
                  over === row.id ? 'is-over' : '',
                  miss === row.id ? 'is-miss' : '',
                  picked ? 'is-target' : '',
                ].join(' ')}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes(DRAG)) return;
                  event.preventDefault();
                  setOver(row.id);
                }}
                onDragLeave={() => setOver((value) => (value === row.id ? null : value))}
                onDrop={(event) => {
                  const key = event.dataTransfer.getData(DRAG);
                  setOver(null);
                  if (!key) return;
                  event.preventDefault();
                  drop(key, row.id);
                }}
                onClick={() => picked && drop(picked, row.id)}
              >
                <span className="match__id">{row.id}</span>
                <span className="match__req">{text(`req.text.${row.id}`)}</span>
                <span className="match__answers">
                  {cards.map((key) => (
                    <span key={key} className="match__chip">
                      {text(`match.card.${key}`)}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
      </ul>
    </div>
  );

  return (
    <div className="match">
      <div className="match__left">
        <div className="match__head">
          <p className="match__label">{text('match.cards')}</p>
          <p className={`match__progress ${done ? 'is-done' : ''}`}>
            {fill('match.progress', { n: covered, total: rows.length })}
          </p>
        </div>

        <ul className="match__cards">
          {order.map(cardOf).map((card) => {
            const used = usedRows(card.key);
            const full = used.length === card.fits.length;
            return (
              <li key={card.key}>
                <button
                  type="button"
                  draggable
                  aria-pressed={picked === card.key}
                  className={[
                    'match__card',
                    picked === card.key ? 'is-picked' : '',
                    full ? 'is-full' : used.length ? 'is-used' : '',
                  ].join(' ')}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG, card.key);
                    event.dataTransfer.effectAllowed = 'copy';
                    setPicked(null);
                  }}
                  onClick={() => setPicked((value) => (value === card.key ? null : card.key))}
                >
                  <span className="match__card-title">{text(`match.card.${card.key}`)}</span>
                  <span className="match__card-text">{text(`match.card.${card.key}.text`)}</span>
                  {used.length > 0 && (
                    <span className="match__card-rows">
                      {used.join(' · ')}
                      {!full && ` · ${used.length}/${card.fits.length}`}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className={`match__feedback ${feedback ? (feedback.ok ? 'is-ok' : 'is-bad') : ''}`} aria-live="polite">
          {done ? (
            <p>{text('match.done')}</p>
          ) : feedback ? (
            feedback.ok ? (
              <p>
                <strong>{text('match.right')}</strong> {feedback.row} ← {text(`match.card.${feedback.card}`)}.{' '}
                {text(`match.why.${feedback.card}`)}
              </p>
            ) : (
              <>
                <p>
                  <strong>{text('match.wrong')}</strong>{' '}
                  {fill('match.miss', {
                    card: text(`match.card.${feedback.card}`),
                    row: feedback.row,
                  })}
                </p>
                <p>{text(`match.why.${feedback.card}`)}</p>
                <p className="match__goes">
                  {text('match.goesTo')}:{' '}
                  {cardOf(feedback.card).fits.map((id) => (
                    <span key={id} className="match__goes-row">
                      <code>{id}</code> {text(`req.text.${id}`)}
                    </span>
                  ))}
                </p>
              </>
            )
          ) : (
            <p className="match__hint">{text('match.hint')}</p>
          )}
        </div>

        <div className="match__actions">
          <button type="button" className="match__link" onClick={revealAll}>
            {text('match.open')}
          </button>
          {Object.keys(placed).length > 0 && (
            <button type="button" className="match__link" onClick={reset}>
              {text('match.reset')}
            </button>
          )}
        </div>
      </div>

      <div className="match__table">
        {section('fr')}
        {section('nfr')}
      </div>
    </div>
  );
}

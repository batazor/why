import { useState } from 'react';
import type { RequirementSortData } from '../../code/widgets';

/**
 * «Разложи требования»: утверждения из разговора с продуктом — по видам.
 *
 * Разница между функцией, свойством и тем, что вне рамок, прозой объясняется
 * за абзац и не запоминается: читатель кивает и через страницу снова называет
 * «приём отвечает за 200 мс» функцией. Разложив десяток утверждений сам и
 * получив объяснение на каждую ошибку, он спорит уже с примером, а не с
 * определением.
 *
 * Врезка стоит в колонке рядом с текстом шага, поэтому это список, а не доска
 * с корзинами: у каждого утверждения свой переключатель из трёх вариантов.
 * Перетаскивать в одной узкой колонке некуда, а три корзины рядом в ней
 * складывались в башню выше экрана.
 */

interface Props {
  data: RequirementSortData;
  labels: Record<string, string>;
}

export default function RequirementSort({ data, labels }: Props) {
  /** Ключ утверждения → вид, который выбрал читатель. */
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);

  const text = (key: string) => labels[key] ?? key;

  const count = Object.keys(placed).length;
  const right = data.items.filter((item) => placed[item.key] === item.bin).length;

  const put = (key: string, bin: string) => {
    setPlaced((previous) => ({ ...previous, [key]: bin }));
    // Проверка снимается, как только читатель что-то переложил: иначе на строке
    // висит вердикт, вынесенный другому ответу.
    setChecked(false);
  };

  const reset = () => {
    setPlaced({});
    setChecked(false);
  };

  return (
    <div className="sort">
      <p className="sort__prompt">{text('sort.prompt')}</p>

      <ol className="sort__list">
        {data.items.map((item) => {
          const bin = placed[item.key];
          const verdict = checked && bin ? (item.bin === bin ? 'is-right' : 'is-wrong') : '';

          return (
            <li className={`sort__item ${verdict}`} key={item.key}>
              <span className="sort__text">{text(`sort.item.${item.key}`)}</span>

              {/* Переключатель, а не три независимые кнопки: вариант у
                  утверждения ровно один, и выбранный видно сразу. */}
              <span className="sort__choice" role="radiogroup" aria-label={text(`sort.item.${item.key}`)}>
                {data.bins.map((target) => (
                  <button
                    className={`sort__option ${bin === target ? 'is-on' : ''}`}
                    type="button"
                    role="radio"
                    aria-checked={bin === target}
                    key={target}
                    onClick={() => put(item.key, target)}
                  >
                    {text(`sort.bin.${target}`)}
                  </button>
                ))}
              </span>

              {/* Объяснение — только у ошибки: правильный ответ читатель уже
                  знает, он его и дал. */}
              {checked && bin && item.bin !== bin && (
                <span className="sort__why">{text(`sort.why.${item.key}`)}</span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="sort__foot">
        <span className="sort__progress">
          {text('sort.progress')
            .replace('{placed}', String(count))
            .replace('{total}', String(data.items.length))}
        </span>
        <button
          className="btn"
          type="button"
          onClick={() => setChecked(true)}
          disabled={count < data.items.length}
        >
          {text('sort.check')}
        </button>
        <button className="sort__again" type="button" onClick={reset}>
          {text('sort.again')}
        </button>
        {checked && (
          <p className="sort__score" aria-live="polite">
            {text('sort.score')
              .replace('{right}', String(right))
              .replace('{total}', String(data.items.length))}{' '}
            {right === data.items.length ? text('sort.right') : text('sort.wrong')}
          </p>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { BrokerMatrixData, BrokerScore } from '../../code/widgets';

/**
 * Матрица сравнения брокеров: какую MQ взять под наши требования.
 *
 * Строки — не «фичи вообще», а то, что нужно именно этому сервису, и у каждой
 * номер требования: так видно, что сравнение идёт от документа, а не от
 * списка возможностей из документации брокера.
 *
 * Наведение на колонку подсвечивает её целиком: сравнивают обычно один брокер
 * с выбранным, и глазу проще, когда колонка читается полосой.
 */

interface Props {
  data: BrokerMatrixData;
  labels: Record<string, string>;
}

const MARK: Record<BrokerScore, string> = { yes: '✓', partial: '~', no: '✗' };

export default function BrokerMatrix({ data, labels }: Props) {
  const text = (key: string) => labels[key] ?? key;
  const [hover, setHover] = useState<string | null>(null);

  const total = (broker: string) =>
    data.rows.reduce(
      (sum, row) => sum + (row.scores[broker] === 'yes' ? 1 : row.scores[broker] === 'partial' ? 0.5 : 0),
      0,
    );

  const column = (broker: string) =>
    [broker === data.choice ? 'is-choice' : '', hover === broker ? 'is-hover' : '']
      .filter(Boolean)
      .join(' ');

  return (
    <div className="bm">
      <div className="bm__scroll">
        <table className="bm__table" onMouseLeave={() => setHover(null)}>
          <thead>
            <tr>
              <th className="bm__corner">{text('bm.criterion')}</th>
              {data.brokers.map((broker) => (
                <th
                  key={broker.key}
                  className={`bm__broker ${column(broker.key)}`}
                  onMouseEnter={() => setHover(broker.key)}
                >
                  {broker.name}
                  {broker.key === data.choice && <span className="bm__badge">{text('bm.choice')}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.key}>
                <th className="bm__criterion" scope="row">
                  {row.req && (
                    <span className={`bm__req ${row.req.startsWith('NFR') ? 'bm__req--nfr' : ''}`}>
                      {row.req}
                    </span>
                  )}
                  {text(`bm.row.${row.key}`)}
                </th>
                {data.brokers.map((broker) => {
                  const score = row.scores[broker.key];
                  return (
                    <td
                      key={broker.key}
                      className={`bm__cell bm__cell--${score} ${column(broker.key)}`}
                      onMouseEnter={() => setHover(broker.key)}
                    >
                      <span className="bm__mark" aria-label={text(`bm.score.${score}`)}>
                        {MARK[score]}
                      </span>
                      <span className="bm__note">{text(`bm.cell.${row.key}.${broker.key}`)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="bm__criterion" scope="row">
                {text('bm.total')}
              </th>
              {data.brokers.map((broker) => (
                <td
                  key={broker.key}
                  className={`bm__total ${column(broker.key)}`}
                  onMouseEnter={() => setHover(broker.key)}
                >
                  {total(broker.key)} / {data.rows.length}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="bm__legend">
        <span className="bm__cell--yes">
          <span className="bm__mark">✓</span> {text('bm.score.yes')}
        </span>
        <span className="bm__cell--partial">
          <span className="bm__mark">~</span> {text('bm.score.partial')}
        </span>
        <span className="bm__cell--no">
          <span className="bm__mark">✗</span> {text('bm.score.no')}
        </span>
      </p>
    </div>
  );
}

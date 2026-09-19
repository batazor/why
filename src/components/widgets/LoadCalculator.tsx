import { useMemo, useState } from 'react';
import { LOAD_OUTPUTS, type LoadCalculatorData, type LoadInput } from '../../code/widgets';

/**
 * Калькулятор нагрузки: от числа пользователей до числа воркеров.
 *
 * Смысл врезки не в арифметике — её читатель сделает и в уме. Смысл в том, что
 * ползунок «длительность джобы» переводит разговор из «нужна очередь» в «нужна
 * очередь вот такая»: две секунды дают четырёх воркеров, тридцать — шестьдесят,
 * и выбор хранилища меняется вместе с этим числом.
 *
 * Вся проза приходит из `labels` локали: виджет общий для всех языков.
 */

interface Props {
  lang: string;
  data: LoadCalculatorData;
  labels: Record<string, string>;
}

/** Положение ползунка (0…1) → значение. Логарифм для величин на порядки. */
function toValue(input: LoadInput, position: number): number {
  if (input.scale !== 'log') {
    const raw = input.min + position * (input.max - input.min);
    const step = input.step ?? 1;
    return Math.round(raw / step) * step;
  }
  const value = input.min * Math.pow(input.max / input.min, position);
  // Круглые числа: 12 483 пользователя выглядят как опечатка, а не как оценка.
  const digits = Math.pow(10, Math.max(0, Math.floor(Math.log10(value)) - 1));
  return Math.round(value / digits) * digits;
}

function toPosition(input: LoadInput, value: number): number {
  if (input.scale !== 'log') return (value - input.min) / (input.max - input.min);
  return Math.log(value / input.min) / Math.log(input.max / input.min);
}

export default function LoadCalculator({ lang, data, labels }: Props) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(data.inputs.map((input) => [input.key, input.value])),
  );

  const text = (key: string) => labels[key] ?? key;

  /**
   * Числа форматирует площадка читателя: разделитель тысяч в русском и
   * английском разный, и «10,000» на русской странице читается как десять.
   */
  const number = useMemo(
    () => (value: number) => {
      if (!Number.isFinite(value)) return '∞';
      const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
      return new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(value);
    },
    [lang],
  );

  const out = useMemo(() => {
    const { users, jobsPerUser, jobSeconds, peakFactor, perWorker, resultKb, retentionDays } =
      values;

    const perDay = users * jobsPerUser;
    const average = perDay / 86_400;
    const peak = average * peakFactor;

    // Закон Литтла: сколько джоб находится в работе одновременно — это поток,
    // умноженный на время одной джобы. Отсюда и берётся размер пула.
    const inFlight = peak * jobSeconds;
    const workers = Math.ceil(inFlight / perWorker);

    /**
     * Очередь за пять минут пика, если пул посчитан по среднему потоку.
     *
     * Это главный ответ калькулятора на «а зачем вообще очередь»: разница
     * между средним и пиком не исчезает, она копится.
     */
    const backlog = Math.max(0, (peak - average) * 300);

    const perDayBytes = perDay * resultKb * 1024;
    const stored = perDayBytes * retentionDays;

    return { perDay, average, peak, inFlight, workers, backlog, perDayBytes, stored };
  }, [values]);

  /** Объём показывается в той единице, в которой его произносят вслух. */
  const bytes = (value: number) => {
    const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
    let size = value / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${number(size)} ${units[unit]}`;
  };

  const verdict =
    out.peak <= data.verdict.single
      ? text('calc.verdict.single')
      : out.peak <= data.verdict.pool
        ? text('calc.verdict.pool')
        : text('calc.verdict.shard');

  const law = text('calc.law')
    .replace('{peak}', number(out.peak))
    .replace('{seconds}', number(values.jobSeconds))
    .replace('{inFlight}', number(out.inFlight));

  const shown: Record<string, string> = {
    perDay: number(out.perDay),
    average: number(out.average),
    peak: number(out.peak),
    inFlight: number(out.inFlight),
    workers: number(out.workers),
    backlog: number(out.backlog),
    perDayBytes: bytes(out.perDayBytes),
    stored: bytes(out.stored),
  };

  // Единица уже внутри строки объёма: показывать «GB KB» незачем.
  const withUnit = (key: string) =>
    key === 'perDayBytes' || key === 'stored' ? '' : text(`calc.out.${key}.unit`);

  return (
    <div className="calc">
      <div className="calc__inputs">
        <h4 className="calc__heading">{text('calc.inputs')}</h4>
        {data.inputs.map((input) => (
          <label className="calc__row" key={input.key}>
            <span className="calc__name">{text(`calc.${input.key}`)}</span>
            <span className="calc__value">
              {number(values[input.key])} <small>{text(`calc.${input.key}.unit`)}</small>
            </span>
            <input
              className="calc__slider"
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={toPosition(input, values[input.key])}
              onChange={(event) => {
                /**
                 * Положение снимается здесь, а не внутри обновления состояния.
                 *
                 * Функцию обновления React зовёт уже на рендере, когда событие
                 * отработало и `currentTarget` у него обнулён, — а замыкание
                 * держит само событие. Поэтому первое же движение ползунка
                 * роняло виджет: `null.value`.
                 */
                const position = Number(event.currentTarget.value);
                setValues((previous) => ({ ...previous, [input.key]: toValue(input, position) }));
              }}
            />
          </label>
        ))}
      </div>

      <div className="calc__output">
        <h4 className="calc__heading">{text('calc.result')}</h4>
        <dl className="calc__grid">
          {LOAD_OUTPUTS.map((key) => (
            <div
              className={
                key === 'inFlight' || key === 'workers' ? 'calc__cell is-key' : 'calc__cell'
              }
              key={key}
            >
              <dt>{text(`calc.out.${key}`)}</dt>
              <dd>
                {shown[key]} <small>{withUnit(key)}</small>
              </dd>
            </div>
          ))}
        </dl>
        <p className="calc__law">{law}</p>
        <p className="calc__verdict">{verdict}</p>
      </div>
    </div>
  );
}

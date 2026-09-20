import { useMemo, useState } from 'react';
import { LAW_OUTPUTS, type LittlesLawData, type LoadInput } from '../../code/widgets';

/**
 * Закон Литтла со всеми тремя величинами разом.
 *
 * Врезка не считает за читателя — умножение он сделает и в уме. Она показывает
 * то, что из формулы на бумаге не видно: закон применяется не к системе
 * целиком, а к любому её куску, и каждое применение даёт своё число — заявки
 * в системе, заявки на обслуживании, заявки в очереди.
 *
 * Устроена как калькулятор нагрузки: разметка и классы у них общие, вся проза
 * приходит из `labels` локали.
 */

interface Props {
  lang: string;
  data: LittlesLawData;
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
  const digits = Math.pow(10, Math.max(0, Math.floor(Math.log10(value)) - 1));
  return Math.round(value / digits) * digits;
}

function toPosition(input: LoadInput, value: number): number {
  if (input.scale !== 'log') return (value - input.min) / (input.max - input.min);
  return Math.log(value / input.min) / Math.log(input.max / input.min);
}

export default function LittlesLaw({ lang, data, labels }: Props) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(data.inputs.map((input) => [input.key, input.value])),
  );

  const text = (key: string) => labels[key] ?? key;

  const number = useMemo(
    () => (value: number) => {
      if (!Number.isFinite(value)) return '∞';
      const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
      return new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(value);
    },
    [lang],
  );

  const out = useMemo(() => {
    const { arrivals, queueSeconds, serviceSeconds, perServer } = values;

    /**
     * Время пребывания — сумма ожидания и обслуживания, а не отдельный
     * ползунок. Так уменьшение обслуживания уменьшает W, а за ним и L; в
     * обратной раскладке оно вместо этого надувало бы очередь.
     */
    const timeInSystem = queueSeconds + serviceSeconds;

    // Сам закон.
    const inSystem = arrivals * timeInSystem;

    // Он же, применённый к меньшим ящикам: к обслуживанию и к очереди.
    const inService = arrivals * serviceSeconds;
    const waiting = arrivals * queueSeconds;

    // Минимум обслуживающих приборов: ожидающие заявки их не занимают.
    const servers = Math.ceil(inService / perServer);

    return { timeInSystem, inSystem, inService, waiting, servers };
  }, [values]);

  const verdict =
    out.waiting === 0
      ? text('law.verdict.smooth')
      : out.waiting > out.inService
        ? text('law.verdict.queue')
        : text('law.verdict.balanced');

  const formula = text('law.formula')
    .replace('{queueSeconds}', number(values.queueSeconds))
    .replace('{serviceSeconds}', number(values.serviceSeconds))
    .replace('{timeInSystem}', number(out.timeInSystem))
    .replace('{inSystem}', number(out.inSystem));

  const split = text('law.split')
    .replace('{arrivals}', number(values.arrivals))
    .replace('{serviceSeconds}', number(values.serviceSeconds))
    .replace('{inService}', number(out.inService))
    .replace('{waiting}', number(out.waiting));

  const shown: Record<string, string> = {
    timeInSystem: number(out.timeInSystem),
    inSystem: number(out.inSystem),
    inService: number(out.inService),
    waiting: number(out.waiting),
    servers: number(out.servers),
  };

  return (
    <div className="calc">
      <div className="calc__inputs">
        <h4 className="calc__heading">{text('law.inputs')}</h4>
        {data.inputs.map((input) => (
          <label className="calc__row" key={input.key}>
            <span className="calc__name">{text(`law.${input.key}`)}</span>
            <span className="calc__value">
              {number(values[input.key])} <small>{text(`law.${input.key}.unit`)}</small>
            </span>
            <input
              className="calc__slider"
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={toPosition(input, values[input.key])}
              onChange={(event) => {
                // Положение снимается до обновления состояния: к моменту, когда
                // React зовёт функцию обновления, `currentTarget` уже обнулён.
                const position = Number(event.currentTarget.value);
                setValues((previous) => ({ ...previous, [input.key]: toValue(input, position) }));
              }}
            />
          </label>
        ))}
      </div>

      <div className="calc__output">
        <h4 className="calc__heading">{text('law.result')}</h4>
        <dl className="calc__grid">
          {LAW_OUTPUTS.map((key) => (
            <div
              className={key === 'inSystem' || key === 'waiting' ? 'calc__cell is-key' : 'calc__cell'}
              key={key}
            >
              <dt>{text(`law.out.${key}`)}</dt>
              <dd>
                {shown[key]} <small>{text(`law.out.${key}.unit`)}</small>
              </dd>
            </div>
          ))}
        </dl>
        <p className="calc__law">{formula}</p>
        <p className="calc__law">{split}</p>
        <p className="calc__verdict">{verdict}</p>
      </div>
    </div>
  );
}

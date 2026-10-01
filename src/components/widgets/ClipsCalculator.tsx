import { useMemo, useState } from 'react';
import { CLIPS_LINES, CLIPS_OUTPUTS, type ClipsCalculatorData, type LoadInput, type P2PFormat } from '../../code/widgets';
import { clipsCalculate } from '../../code/clips-calc';

/**
 * Калькуляторы разбора сервиса клипов: пайплайн, хранилище, раздача.
 *
 * Компонент один на три модели: ползунки и таблица у них одинаковые, формулы
 * лежат отдельно, в `clips-calc.ts`. Разметка и классы — те же, что у
 * калькулятора нагрузки; вся проза приходит из `labels` локали.
 */

interface Props {
  lang: string;
  data: ClipsCalculatorData;
  labels: Record<string, string>;
}

/** Положение ползунка (0…1) → значение. Логарифм для величин на порядки. */
function toValue(input: LoadInput, position: number): number {
  if (input.scale !== 'log') {
    const raw = input.min + position * (input.max - input.min);
    const step = input.step ?? 1;
    const value = Math.round(raw / step) * step;
    // Шаг с дробью даёт хвосты вроде 0,30000000000000004.
    return Number(value.toFixed(4));
  }
  const value = input.min * Math.pow(input.max / input.min, position);
  // Круглые числа: 4 831 загрузка выглядит как опечатка, а не как оценка.
  // Два значащих знака — и ниже единицы тоже: 0,2 секунды GPU на секунду
  // видео здесь законное значение.
  const digits = Math.pow(10, Math.floor(Math.log10(value)) - 1);
  return Number((Math.round(value / digits) * digits).toPrecision(2));
}

function toPosition(input: LoadInput, value: number): number {
  if (input.scale !== 'log') return (value - input.min) / (input.max - input.min);
  return Math.log(value / input.min) / Math.log(input.max / input.min);
}

export default function ClipsCalculator({ lang, data, labels }: Props) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(data.inputs.map((input) => [input.key, input.value])),
  );

  const prefix = `clips.${data.model}`;
  const text = (key: string) => labels[key] ?? key;

  const number = useMemo(
    () => (value: number) => {
      if (!Number.isFinite(value)) return '∞';
      const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
      return new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(value);
    },
    [lang],
  );

  const result = useMemo(() => clipsCalculate(data.model, values), [data.model, values]);

  /** Объём — в той единице, в которой его произносят вслух. */
  const bytes = (value: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${number(size)} ${units[unit]}`;
  };

  /** Время тоже: «21 600 секунд» никто не читает, «6 ч» читают все. */
  const duration = (seconds: number) => {
    if (seconds < 120) return `${number(seconds)} ${text('clips.time.s')}`;
    if (seconds < 7_200) return `${number(seconds / 60)} ${text('clips.time.min')}`;
    if (seconds < 172_800) return `${number(seconds / 3_600)} ${text('clips.time.h')}`;
    return `${number(seconds / 86_400)} ${text('clips.time.d')}`;
  };

  const format = (kind: P2PFormat, value: number) =>
    kind === 'bytes'
      ? bytes(value)
      : kind === 'duration'
        ? duration(value)
        : kind === 'times'
          ? `×${number(value)}`
          : number(value);

  const outputs = CLIPS_OUTPUTS[data.model];

  // Подстановки для строк-формул: и входы, и итоги, уже в читаемом виде.
  const shown: Record<string, string> = {
    ...Object.fromEntries(data.inputs.map((input) => [input.key, number(values[input.key])])),
    ...Object.fromEntries(outputs.map((out) => [out.key, format(out.format, result.out[out.key])])),
  };
  const fill = (template: string) => template.replace(/\{(\w+)\}/g, (raw, key) => shown[key] ?? raw);

  return (
    <div className="calc">
      <div className="calc__inputs">
        <h4 className="calc__heading">{text('clips.inputs')}</h4>
        {data.inputs.map((input) => (
          <label className="calc__row" key={input.key}>
            <span className="calc__name">{text(`${prefix}.${input.key}`)}</span>
            <span className="calc__value">
              {number(values[input.key])} <small>{text(`${prefix}.${input.key}.unit`)}</small>
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
        <h4 className="calc__heading">{text('clips.result')}</h4>
        <dl className="calc__grid">
          {outputs.map((out) => (
            <div className={out.main ? 'calc__cell is-key' : 'calc__cell'} key={out.key}>
              <dt>{text(`${prefix}.out.${out.key}`)}</dt>
              <dd>
                {shown[out.key]}{' '}
                {out.format === 'number' && <small>{text(`${prefix}.out.${out.key}.unit`)}</small>}
              </dd>
            </div>
          ))}
        </dl>
        {Array.from({ length: CLIPS_LINES[data.model] }, (_, i) => (
          <p className="calc__law" key={i}>
            {fill(text(`${prefix}.line.${i + 1}`))}
          </p>
        ))}
        <p className="calc__verdict">{text(`${prefix}.verdict.${result.verdict}`)}</p>
      </div>
    </div>
  );
}

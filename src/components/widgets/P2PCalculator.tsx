import { useMemo, useState } from 'react';
import { P2P_LINES, P2P_OUTPUTS, type P2PCalculatorData, type P2PFormat, type P2PInput } from '../../code/widgets';
import { p2pCalculate } from '../../code/p2p-calc';

/**
 * Калькуляторы разбора P2P-сети: рой против сервера, трекер против DHT,
 * разбросанные копии против полных.
 *
 * Компонент один на три модели: ползунки и таблица у них одинаковые, а формулы
 * лежат отдельно, в `p2p-calc.ts`. Разметка и классы — те же, что у
 * калькулятора нагрузки; вся проза приходит из `labels` локали.
 */

interface Props {
  lang: string;
  data: P2PCalculatorData;
  labels: Record<string, string>;
}

/** Положение ползунка (0…1) → значение. */
function toValue(input: P2PInput, position: number): number {
  if (input.scale === 'pow2') {
    const low = Math.log2(input.min);
    return 2 ** Math.round(low + position * (Math.log2(input.max) - low));
  }
  if (input.scale !== 'log') {
    const raw = input.min + position * (input.max - input.min);
    const step = input.step ?? 1;
    return Math.round(raw / step) * step;
  }
  const value = input.min * Math.pow(input.max / input.min, position);
  // Круглые числа: 12 483 пира выглядят как опечатка, а не как оценка. Два
  // значащих знака — и ниже единицы тоже: файл в 0,3 ГБ и канал в 0,5 Мбит/с
  // здесь законные значения, а округление до целого дало бы ноль.
  const digits = Math.pow(10, Math.floor(Math.log10(value)) - 1);
  return Number((Math.round(value / digits) * digits).toPrecision(2));
}

function toPosition(input: P2PInput, value: number): number {
  if (input.scale === 'linear' || input.scale === undefined) {
    return (value - input.min) / (input.max - input.min);
  }
  return Math.log(value / input.min) / Math.log(input.max / input.min);
}

export default function P2PCalculator({ lang, data, labels }: Props) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(data.inputs.map((input) => [input.key, input.value])),
  );

  const prefix = `p2p.${data.model}`;
  const text = (key: string) => labels[key] ?? key;

  const number = useMemo(
    () => (value: number) => {
      if (!Number.isFinite(value)) return '∞';
      const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
      return new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(value);
    },
    [lang],
  );

  const result = useMemo(() => p2pCalculate(data.model, values), [data.model, values]);

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

  /** Время тоже: «343 597 секунд» никто не читает, «4 дня» читают все. */
  const duration = (seconds: number) => {
    if (seconds < 120) return `${number(seconds)} ${text('p2p.time.s')}`;
    if (seconds < 7_200) return `${number(seconds / 60)} ${text('p2p.time.min')}`;
    if (seconds < 172_800) return `${number(seconds / 3_600)} ${text('p2p.time.h')}`;
    return `${number(seconds / 86_400)} ${text('p2p.time.d')}`;
  };

  /**
   * Доля — с запасом знаков у краёв: 99,97% и 99,5% — разные ответы, а ноль с
   * двадцатью нулями после запятой — просто ноль.
   */
  const percent = (value: number) => {
    const share = value * 100;
    const plain = (digits: number) =>
      new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(share);
    if (share > 0 && share < 0.01) return `< ${new Intl.NumberFormat(lang).format(0.01)}%`;
    const digits = share >= 99 && share < 100 ? 3 : share >= 10 ? 1 : 2;
    return `${plain(digits)}%`;
  };

  const format = (kind: P2PFormat, value: number) =>
    kind === 'bytes'
      ? bytes(value)
      : kind === 'duration'
        ? duration(value)
        : kind === 'percent'
          ? percent(value)
          : kind === 'times'
            ? `×${number(value)}`
            : number(value);

  const outputs = P2P_OUTPUTS[data.model];

  // Подстановки для строк-формул: и входы, и итоги, уже в читаемом виде.
  const shown: Record<string, string> = {
    ...Object.fromEntries(data.inputs.map((input) => [input.key, number(values[input.key])])),
    ...Object.fromEntries(outputs.map((out) => [out.key, format(out.format, result.out[out.key])])),
  };
  const fill = (template: string) => template.replace(/\{(\w+)\}/g, (raw, key) => shown[key] ?? raw);

  return (
    <div className="calc">
      <div className="calc__inputs">
        <h4 className="calc__heading">{text('p2p.inputs')}</h4>
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
        <h4 className="calc__heading">{text('p2p.result')}</h4>
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
        {Array.from({ length: P2P_LINES[data.model] }, (_, i) => (
          <p className="calc__law" key={i}>
            {fill(text(`${prefix}.line.${i + 1}`))}
          </p>
        ))}
        <p className="calc__verdict">{text(`${prefix}.verdict.${result.verdict}`)}</p>
      </div>
    </div>
  );
}

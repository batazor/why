/**
 * Калькулятор базовых оценок — back-of-the-envelope.
 *
 * Чистые функции без интерфейса: те же числа потом понадобятся и бэкенду,
 * например чтобы проверить НФТ против схемы.
 */

export interface CalcInput {
  key: string;
  min: number;
  max: number;
  value: number;
  scale?: 'log';
  step?: number;
}

export const CALC_INPUTS: CalcInput[] = [
  { key: 'dau', min: 100, max: 500_000_000, scale: 'log', value: 1_000_000 },
  { key: 'writesPerUser', min: 0.1, max: 1000, scale: 'log', value: 5 },
  { key: 'readRatio', min: 1, max: 1000, scale: 'log', value: 10 },
  { key: 'peakFactor', min: 1, max: 20, value: 3 },
  { key: 'objectKb', min: 0.1, max: 50_000, scale: 'log', value: 2 },
  { key: 'retentionDays', min: 1, max: 3650, scale: 'log', value: 365 },
  { key: 'replication', min: 1, max: 5, value: 3 },
  { key: 'latencyMs', min: 1, max: 5000, scale: 'log', value: 50 },
];

export const CALC_DEFAULTS: Record<string, number> = Object.fromEntries(
  CALC_INPUTS.map((input) => [input.key, input.value]),
);

export type CalcOutputKey =
  | 'writesPerDay'
  | 'writeRps'
  | 'readRps'
  | 'peakRps'
  | 'inFlight'
  | 'storagePerDay'
  | 'storageTotal'
  | 'ingress'
  | 'egress';

export interface CalcResult {
  writesPerDay: number;
  writeRps: number;
  readRps: number;
  peakRps: number;
  inFlight: number;
  storagePerDay: number;
  storageTotal: number;
  ingress: number;
  egress: number;
  hints: string[];
}

const DAY = 86_400;

export function calculate(raw: Record<string, number>): CalcResult {
  const v = { ...CALC_DEFAULTS, ...raw };
  const writesPerDay = v.dau * v.writesPerUser;
  const writeRps = writesPerDay / DAY;
  const readRps = writeRps * v.readRatio;
  const peakRps = (writeRps + readRps) * v.peakFactor;

  // Закон Литтла: одновременно в работе = поток × время одного запроса.
  const inFlight = peakRps * (v.latencyMs / 1000);

  const bytes = v.objectKb * 1024;
  const storagePerDay = writesPerDay * bytes;
  const storageTotal = storagePerDay * v.retentionDays * v.replication;
  const ingress = writeRps * v.peakFactor * bytes;
  const egress = readRps * v.peakFactor * bytes;

  /**
   * Подсказки — порядки, а не пороги конкретной базы. Их задача — задать
   * вопрос вслух, а не ответить на него.
   */
  const hints: string[] = [];
  const peakWrites = writeRps * v.peakFactor;
  if (peakWrites > 5_000) hints.push('calc.hint.writeShard');
  else if (peakWrites > 1_000) hints.push('calc.hint.writePrimary');
  if (v.readRatio >= 10 && readRps * v.peakFactor > 1_000) hints.push('calc.hint.cache');
  if (storageTotal > 10 * 1024 ** 4) hints.push('calc.hint.storageShard');
  if (v.objectKb > 1024) hints.push('calc.hint.blob');
  if (egress > 1024 ** 3) hints.push('calc.hint.cdn');
  if (peakRps < 50) hints.push('calc.hint.small');

  return { writesPerDay, writeRps, readRps, peakRps, inFlight, storagePerDay, storageTotal, ingress, egress, hints };
}

export const BYTE_OUTPUTS: ReadonlySet<CalcOutputKey> = new Set(['storagePerDay', 'storageTotal']);
export const RATE_OUTPUTS: ReadonlySet<CalcOutputKey> = new Set(['ingress', 'egress']);

/** Положение ползунка (0…1) → значение. Логарифм для величин на порядки. */
export function toValue(input: CalcInput, position: number): number {
  if (input.scale !== 'log') {
    const raw = input.min + position * (input.max - input.min);
    const step = input.step ?? 1;
    return Math.round(raw / step) * step;
  }
  const value = input.min * Math.pow(input.max / input.min, position);
  // Круглые числа: 1 043 212 пользователей выглядят как опечатка, а не как оценка.
  const digits = Math.pow(10, Math.floor(Math.log10(value)) - 1);
  return Math.round(value / digits) * digits;
}

export function toPosition(input: CalcInput, value: number): number {
  if (input.scale !== 'log') return (value - input.min) / (input.max - input.min);
  return Math.log(value / input.min) / Math.log(input.max / input.min);
}

export function formatNumber(lang: string, value: number): string {
  if (!Number.isFinite(value)) return '∞';
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(value);
}

/** Объём — в той единице, в которой его произносят вслух. */
export function formatBytes(lang: string, value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${formatNumber(lang, size)} ${units[unit]}`;
}

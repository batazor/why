import { CALC_DEFAULTS } from './calc';
import type { Design, DesignNode } from './model';
import { isMessaging, schemaFamily, type DbColumn, type DbTable, type SchemaFamily } from './schema';

/**
 * Срок хранения по умолчанию — от природы хранилища, а не из оценок: очередь
 * держит сообщения неделю, кэш — сутки (TTL), и только база — весь срок.
 */
export function defaultRetention(kind: string, retentionDays: number): number {
  if (isMessaging(kind)) return 7;
  if (kind === 'cache') return 1;
  return retentionDays;
}

/** Транзит, а не хранилище: в «размер записи» калькулятора не входит. */
export function isTransient(kind: string) {
  return isMessaging(kind) || kind === 'cache';
}

/**
 * Объём хранилища по его схеме.
 *
 * Строка — сумма полей плюс служебный заголовок, индекс — ключ плюс ссылка
 * на строку. Числа — порядки, а не байты конкретного движка: у PostgreSQL
 * заголовок кортежа 24 байта, у Cassandra служебное на каждую ячейку, у
 * сжатия свои планы. Для собеседования порядок и нужен — «десятки гигабайт»
 * или «сотни терабайт» решают выбор, а третий знак — нет.
 *
 * Средний размер поля можно задать руками: текст бывает и в 20 байт, и в 2 КБ,
 * и никакая таблица типов этого не знает.
 */

/** Служебное на строку: заголовок кортежа и указатель на него / метаданные ячеек. */
const ROW_OVERHEAD: Record<SchemaFamily, number> = { relational: 28, partitioned: 24 };
/** Служебное на запись индекса: ссылка на строку и заголовок записи B-дерева. */
const INDEX_OVERHEAD = 16;

/** Средний размер значения по типу — первое приближение, пока его не задали руками. */
export function typeBytes(type: string): number {
  const t = type.trim().toLowerCase();
  const n = Number(t.match(/\((\d+)/)?.[1]);
  if (/^(var)?char/.test(t) && n) return t.startsWith('char') ? n : Math.min(n, 64);
  if (/^(bigint|int8|bigserial|double|float8|float|timestamp|timestamptz|datetime|counter|number|long|time)/.test(t)) return 8;
  if (/^(int|integer|int4|serial|real|float4|date)/.test(t)) return 4;
  if (/^(smallint|int2)/.test(t)) return 2;
  if (/^(bool|boolean|tinyint)/.test(t)) return 1;
  if (/^(uuid|timeuuid)/.test(t)) return 16;
  if (/^(numeric|decimal|money)/.test(t)) return 12;
  if (/^(jsonb?|document)/.test(t)) return 256;
  if (/^(map|list|set|array)/.test(t)) return 128;
  if (/^(bytea|blob|binary|bytes)/.test(t)) return 1024;
  if (/^(text|string|varchar)/.test(t)) return t === 'string' ? 32 : 64;
  return 32;
}

export function columnBytes(column: DbColumn): number {
  return column.size && column.size > 0 ? column.size : typeBytes(column.type);
}

/** Какие поля ключуют индекс: у SQL — PK, UNIQUE, INDEX; у партиционированных — вторичные IDX. */
function indexes(table: DbTable, family: SchemaFamily): DbColumn[][] {
  if (family === 'relational') {
    const pk = table.columns.filter((column) => column.keys.includes('pk'));
    const single = table.columns.filter((column) => column.keys.includes('unique') || column.keys.includes('index'));
    return [...(pk.length ? [pk] : []), ...single.map((column) => [column])];
  }
  // Вторичный индекс в партиционированном хранилище — ещё одна таблица:
  // поле индекса плюс ключ партиции, по которому потом идут за строкой.
  const partition = table.columns.filter((column) => column.keys.includes('partition'));
  return table.columns
    .filter((column) => column.keys.includes('index'))
    .map((column) => [column, ...partition]);
}

export interface TableSize {
  /** Байт на строку: поля плюс служебное. */
  row: number;
  /** Байт индексов на строку. */
  index: number;
  rowsPerDay: number;
  retentionDays: number;
  rows: number;
  /** Всего байт с индексами и репликами за срок хранения. */
  total: number;
}

export function tableSize(table: DbTable, family: SchemaFamily, values: Record<string, number>, kind: string): TableSize {
  const v = { ...CALC_DEFAULTS, ...values };
  const row = ROW_OVERHEAD[family] + table.columns.reduce((sum, column) => sum + columnBytes(column), 0);
  const index = indexes(table, family).reduce(
    (sum, key) => sum + INDEX_OVERHEAD + key.reduce((bytes, column) => bytes + columnBytes(column), 0),
    0,
  );
  const rowsPerDay = v.dau * v.writesPerUser * (table.rowsPerWrite ?? 1);
  const retentionDays = table.retentionDays ?? defaultRetention(kind, v.retentionDays);
  const rows = rowsPerDay * retentionDays;
  return { row, index, rowsPerDay, retentionDays, rows, total: rows * (row + index) * v.replication };
}

export interface NodeSize {
  node: DesignNode;
  tables: Array<{ table: DbTable; size: TableSize }>;
  total: number;
}

/** Все хранилища со схемой и их объём — для раздела в «Оценках». */
export function schemaSizes(design: Design): NodeSize[] {
  return design.nodes
    .filter((node) => node.schema?.length && schemaFamily(node.kind))
    .map((node) => {
      const family = schemaFamily(node.kind)!;
      const tables = node.schema!.map((table) => ({
        table,
        size: tableSize(table, family, design.calc.values, node.kind),
      }));
      return { node, tables, total: tables.reduce((sum, item) => sum + item.size.total, 0) };
    });
}

/**
 * Сколько байт ложится на диск за одну запись пользователя — по всем
 * таблицам, с индексами, без реплик. Это то самое «размер записи» из
 * калькулятора, только посчитанное по схеме, а не на глаз.
 */
export function bytesPerWrite(sizes: NodeSize[]): number {
  // Очереди и кэш — транзит: в «размер записи», который живёт весь срок хранения, их не считаем.
  return sizes.filter((item) => !isTransient(item.node.kind)).reduce(
    (sum, item) =>
      sum + item.tables.reduce((bytes, { table, size }) => bytes + (size.row + size.index) * (table.rowsPerWrite ?? 1), 0),
    0,
  );
}

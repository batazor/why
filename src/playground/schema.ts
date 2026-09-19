import { uid, type DesignNode } from './model';

/**
 * Схема данных хранилища: таблицы (или коллекции, ключи кэша, сообщения
 * очереди) и их поля.
 *
 * Словарь ключей зависит от семейства хранилища. У реляционной базы — PK, FK,
 * UNIQUE и индексы: связи между таблицами и есть её сила. У партиционированных
 * (wide-column, key-value, кэш, временные ряды, логи и очереди) — ключ
 * партиции и ключ сортировки: они решают, на какой узел ляжет строка и в каком
 * порядке её прочитают, а join-ов там нет.
 */

export type KeyFlag = 'pk' | 'fk' | 'unique' | 'index' | 'partition' | 'sort';

export interface DbColumn {
  id: string;
  name: string;
  type: string;
  keys: KeyFlag[];
  nullable: boolean;
  /** FK: на какую колонку ссылается — `tableId.columnId` в этом же хранилище. */
  ref?: string;
  /** Средний размер значения в байтах, если прикидка по типу не подходит. */
  size?: number;
}

export interface DbTable {
  id: string;
  name: string;
  note: string;
  columns: DbColumn[];
  /** Сколько строк ложится в таблицу на одну запись пользователя. По умолчанию 1. */
  rowsPerWrite?: number;
  /** Свой срок хранения, дней. По умолчанию — из оценок (у очередей — неделя). */
  retentionDays?: number;
}

export type SchemaFamily = 'relational' | 'partitioned';

/** У каких блоков есть схема и какого она семейства. */
const FAMILY: Record<string, SchemaFamily> = {
  sql: 'relational',
  nosql: 'partitioned',
  kv: 'partitioned',
  cache: 'partitioned',
  search: 'partitioned',
  tsdb: 'partitioned',
  queue: 'partitioned',
  stream: 'partitioned',
  pubsub: 'partitioned',
};

export function schemaFamily(kind: string): SchemaFamily | undefined {
  return FAMILY[kind];
}

/** Очередь и стрим хранят не таблицы, а сообщения: подписи у них свои. */
export function isMessaging(kind: string) {
  return kind === 'queue' || kind === 'stream' || kind === 'pubsub';
}

export const KEY_FLAGS: Record<SchemaFamily, KeyFlag[]> = {
  relational: ['pk', 'fk', 'unique', 'index'],
  partitioned: ['partition', 'sort', 'index'],
};

/** Типы-подсказки: поле свободное, список только чтобы не вспоминать написание. */
export const TYPE_HINTS: Record<SchemaFamily, string[]> = {
  relational: ['bigint', 'uuid', 'text', 'varchar(255)', 'int', 'boolean', 'numeric(12,2)', 'timestamptz', 'date', 'jsonb', 'bytea'],
  partitioned: ['string', 'number', 'uuid', 'timestamp', 'boolean', 'map', 'list', 'set', 'blob', 'counter'],
};

export function newColumn(name = '', type = ''): DbColumn {
  return { id: uid('c'), name, type, keys: [], nullable: false };
}

export function newTable(name: string, family: SchemaFamily): DbTable {
  const id = newColumn('id', family === 'relational' ? 'bigint' : 'string');
  id.keys = [family === 'relational' ? 'pk' : 'partition'];
  return { id: uid('t'), name, note: '', columns: [id] };
}

/** Колонка по ссылке FK — для подписи «→ users.id». */
export function resolveRef(tables: DbTable[], ref?: string): string | undefined {
  if (!ref) return undefined;
  const [tableId, columnId] = ref.split('.');
  const table = tables.find((item) => item.id === tableId);
  const column = table?.columns.find((item) => item.id === columnId);
  return table && column ? `${table.name}.${column.name}` : undefined;
}

/* -------------------------------------------------------------- DDL */

const ident = (name: string) => (/^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`);

/** PostgreSQL: то, что вставляют в миграцию. */
function postgres(tables: DbTable[]): string {
  const out: string[] = [];
  const indexes: string[] = [];
  for (const table of tables) {
    const lines = table.columns.map(
      (column) => `  ${ident(column.name || 'column')} ${column.type || 'text'}${column.nullable ? '' : ' NOT NULL'}`,
    );
    const pk = table.columns.filter((column) => column.keys.includes('pk'));
    if (pk.length) lines.push(`  PRIMARY KEY (${pk.map((column) => ident(column.name)).join(', ')})`);
    for (const column of table.columns) {
      if (column.keys.includes('unique')) lines.push(`  UNIQUE (${ident(column.name)})`);
      const target = resolveRef(tables, column.ref);
      if (column.keys.includes('fk') && target) {
        const [refTable, refColumn] = target.split('.');
        lines.push(`  FOREIGN KEY (${ident(column.name)}) REFERENCES ${ident(refTable)} (${ident(refColumn)})`);
      }
      if (column.keys.includes('index'))
        indexes.push(`CREATE INDEX ON ${ident(table.name)} (${ident(column.name)});`);
    }
    if (table.note.trim()) out.push(`-- ${table.note.trim().replace(/\n+/g, ' ')}`);
    out.push(`CREATE TABLE ${ident(table.name || 'table')} (\n${lines.join(',\n')}\n);\n`);
  }
  return [...out, ...indexes].join('\n').trim() + '\n';
}

/**
 * CQL — для партиционированных хранилищ это самый понятный общий язык:
 * PRIMARY KEY ((партиция), сортировка) читают и те, кто пишет под DynamoDB.
 */
function cql(tables: DbTable[]): string {
  const out: string[] = [];
  for (const table of tables) {
    const lines = table.columns.map((column) => `  ${ident(column.name || 'column')} ${column.type || 'text'}`);
    const part = table.columns.filter((column) => column.keys.includes('partition')).map((column) => ident(column.name));
    const sort = table.columns.filter((column) => column.keys.includes('sort')).map((column) => ident(column.name));
    if (part.length) lines.push(`  PRIMARY KEY ((${part.join(', ')})${sort.length ? `, ${sort.join(', ')}` : ''})`);
    if (table.note.trim()) out.push(`-- ${table.note.trim().replace(/\n+/g, ' ')}`);
    out.push(`CREATE TABLE ${ident(table.name || 'table')} (\n${lines.join(',\n')}\n);`);
    for (const column of table.columns)
      if (column.keys.includes('index')) out.push(`CREATE INDEX ON ${ident(table.name)} (${ident(column.name)});`);
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}

export function ddl(node: DesignNode): string {
  const tables = node.schema ?? [];
  return schemaFamily(node.kind) === 'relational' ? postgres(tables) : cql(tables);
}

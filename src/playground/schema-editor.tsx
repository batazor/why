import { useEffect, useState } from 'react';
import {
  KEY_FLAGS,
  TYPE_HINTS,
  ddl,
  isMessaging,
  newColumn,
  newTable,
  resolveRef,
  schemaFamily,
  type DbColumn,
  type DbTable,
  type KeyFlag,
  type SchemaFamily,
} from './schema';
import type { DesignNode } from './model';
import type { T } from './i18n';

/**
 * Схема данных хранилища: сводка в инспекторе и редактор во всю ширину окна.
 *
 * Таблицы — карточками, как на ER-диаграмме: имя сверху, поля строками, ключи
 * плашками. Боковая панель для этого узка — в ней только сводка и кнопка.
 */

type Patch = (value: Partial<DesignNode>) => void;

function KeyBadge({ flag, t }: { flag: KeyFlag; t: T }) {
  return (
    <span className={`pg-key pg-key--${flag}`} title={t(`key.${flag}.title`)}>
      {t(`key.${flag}`)}
    </span>
  );
}

/** Подпись схемы у очереди — «сообщения», у остальных — «таблицы». */
const noun = (node: DesignNode) => (isMessaging(node.kind) ? 'msg' : 'table');

function ColumnRow({ column, table, tables, family, readOnly, t, onChange, onRemove }: {
  column: DbColumn;
  table: DbTable;
  tables: DbTable[];
  family: SchemaFamily;
  readOnly: boolean;
  t: T;
  onChange: (value: Partial<DbColumn>) => void;
  onRemove: () => void;
}) {
  const target = resolveRef(tables, column.ref);

  if (readOnly)
    return (
      <li className="pg-col">
        <span className="pg-col__name">{column.name}</span>
        <span className="pg-col__type">
          {column.type}
          {column.nullable && '?'}
        </span>
        <span className="pg-col__keys">
          {column.keys.map((flag) => (
            <KeyBadge key={flag} flag={flag} t={t} />
          ))}
          {target && <span className="pg-col__ref">→ {target}</span>}
        </span>
      </li>
    );

  const toggle = (flag: KeyFlag) =>
    onChange({
      keys: column.keys.includes(flag) ? column.keys.filter((item) => item !== flag) : [...column.keys, flag],
      // Снятый FK больше никуда не ссылается.
      ...(flag === 'fk' && column.keys.includes('fk') ? { ref: undefined } : {}),
    });

  // Ссылаться можно на любое поле другой таблицы этого же хранилища.
  const targets = tables.filter((other) => other.id !== table.id);

  return (
    <li className="pg-col is-editing">
      <input
        className="pg-input pg-col__name-input"
        aria-label={t('schema.column')}
        placeholder={t('schema.column')}
        value={column.name}
        onChange={(event) => onChange({ name: event.currentTarget.value })}
      />
      <input
        className="pg-input pg-col__type-input"
        aria-label={t('schema.type')}
        placeholder={t('schema.type')}
        list={`pg-types-${family}`}
        value={column.type}
        onChange={(event) => onChange({ type: event.currentTarget.value })}
      />
      <span className="pg-col__keys">
        {KEY_FLAGS[family].map((flag) => (
          <button
            key={flag}
            type="button"
            className={`pg-key pg-key--${flag} pg-key--toggle ${column.keys.includes(flag) ? 'is-on' : ''}`}
            aria-pressed={column.keys.includes(flag)}
            title={t(`key.${flag}.title`)}
            onClick={() => toggle(flag)}
          >
            {t(`key.${flag}`)}
          </button>
        ))}
        {family === 'relational' && (
          <button
            type="button"
            className={`pg-key pg-key--null pg-key--toggle ${column.nullable ? 'is-on' : ''}`}
            aria-pressed={column.nullable}
            title={t('schema.nullable.title')}
            onClick={() => onChange({ nullable: !column.nullable })}
          >
            NULL
          </button>
        )}
      </span>
      <button type="button" className="pg-icon-button" aria-label={t('schema.deleteColumn')} title={t('schema.deleteColumn')} onClick={onRemove}>
        <i className="codicon codicon-close" aria-hidden="true" />
      </button>
      {column.keys.includes('fk') && (
        <select
          className="pg-input pg-select pg-col__ref-select"
          aria-label={t('schema.ref')}
          value={column.ref ?? ''}
          onChange={(event) => onChange({ ref: event.currentTarget.value || undefined })}
        >
          <option value="">{t('schema.ref')}…</option>
          {targets.map((other) =>
            other.columns.map((col) => (
              <option key={`${other.id}.${col.id}`} value={`${other.id}.${col.id}`}>
                {other.name}.{col.name}
              </option>
            )),
          )}
        </select>
      )}
    </li>
  );
}

function TableCard({ table, tables, family, readOnly, t, node, onChange, onRemove }: {
  table: DbTable;
  tables: DbTable[];
  family: SchemaFamily;
  readOnly: boolean;
  t: T;
  node: DesignNode;
  onChange: (value: Partial<DbTable>) => void;
  onRemove: () => void;
}) {
  const setColumn = (id: string, value: Partial<DbColumn>) =>
    onChange({ columns: table.columns.map((column) => (column.id === id ? { ...column, ...value } : column)) });

  return (
    <section className="pg-table">
      <header className="pg-table__head">
        <i className={`codicon codicon-${isMessaging(node.kind) ? 'mail' : 'table'}`} aria-hidden="true" />
        {readOnly ? (
          <strong className="pg-table__name">{table.name}</strong>
        ) : (
          <>
            <input
              className="pg-input pg-table__name-input"
              aria-label={t(`schema.${noun(node)}Name`)}
              value={table.name}
              onChange={(event) => onChange({ name: event.currentTarget.value })}
            />
            <button
              type="button"
              className="pg-icon-button"
              aria-label={t('schema.deleteTable')}
              title={t('schema.deleteTable')}
              onClick={onRemove}
            >
              <i className="codicon codicon-trash" aria-hidden="true" />
            </button>
          </>
        )}
      </header>
      <ul className="pg-table__cols">
        {table.columns.map((column) => (
          <ColumnRow
            key={column.id}
            column={column}
            table={table}
            tables={tables}
            family={family}
            readOnly={readOnly}
            t={t}
            onChange={(value) => setColumn(column.id, value)}
            onRemove={() => onChange({ columns: table.columns.filter((item) => item.id !== column.id) })}
          />
        ))}
      </ul>
      {!readOnly && (
        <button
          type="button"
          className="pg-table__add"
          onClick={() => onChange({ columns: [...table.columns, newColumn()] })}
        >
          + {t('schema.addColumn')}
        </button>
      )}
      {readOnly ? (
        table.note && <p className="pg-table__note">{table.note}</p>
      ) : (
        <textarea
          className="pg-input pg-textarea pg-table__note-input"
          rows={1}
          placeholder={t('schema.note')}
          value={table.note}
          onChange={(event) => onChange({ note: event.currentTarget.value })}
        />
      )}
    </section>
  );
}

function SchemaDialog({ node, patch, readOnly, t, onClose }: {
  node: DesignNode;
  patch: Patch;
  readOnly: boolean;
  t: T;
  onClose: () => void;
}) {
  const family = schemaFamily(node.kind)!;
  const tables = node.schema ?? [];
  const [showDdl, setShowDdl] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setTables = (next: DbTable[]) => patch({ schema: next });
  const setTable = (id: string, value: Partial<DbTable>) =>
    setTables(tables.map((table) => (table.id === id ? { ...table, ...value } : table)));
  const removeTable = (id: string) =>
    // Ссылки на удалённую таблицу снимаются: FK в никуда хуже, чем без FK.
    setTables(
      tables
        .filter((table) => table.id !== id)
        .map((table) => ({
          ...table,
          columns: table.columns.map((column) => (column.ref?.startsWith(`${id}.`) ? { ...column, ref: undefined } : column)),
        })),
    );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ddl(node));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* буфер недоступен */
    }
  };

  const title = node.label || t(`block.${node.kind}`);

  return (
    <div className="pg-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="pg-dialog__box pg-schema" onClick={(event) => event.stopPropagation()}>
        <header className="pg-dialog__head">
          <h3>{t(`schema.title.${noun(node)}`, { block: title })}</h3>
          <span className="pg-schema__actions">
            <button type="button" className="pg-doc__action" onClick={() => setShowDdl(!showDdl)}>
              <i className="codicon codicon-code" aria-hidden="true" /> {t(showDdl ? 'schema.hideDdl' : 'schema.showDdl')}
            </button>
            <button type="button" className="pg-doc__action" onClick={copy}>
              <i className={`codicon codicon-${copied ? 'check' : 'copy'}`} aria-hidden="true" />{' '}
              {t(copied ? 'doc.copied' : family === 'relational' ? 'schema.copySql' : 'schema.copyCql')}
            </button>
            <button type="button" className="pg-icon-button" aria-label={t('comp.close')} onClick={onClose}>
              <i className="codicon codicon-close" aria-hidden="true" />
            </button>
          </span>
        </header>
        <div className="pg-schema__body">
          <p className="pg-hint">{t(`schema.hint.${family}`)}</p>
          <datalist id={`pg-types-${family}`}>
            {TYPE_HINTS[family].map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
          <div className="pg-schema__grid">
            {tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                tables={tables}
                family={family}
                readOnly={readOnly}
                t={t}
                node={node}
                onChange={(value) => setTable(table.id, value)}
                onRemove={() => removeTable(table.id)}
              />
            ))}
            {!readOnly && (
              <button
                type="button"
                className="pg-table pg-table--new"
                onClick={() => setTables([...tables, newTable(isMessaging(node.kind) ? 'event' : `table_${tables.length + 1}`, family)])}
              >
                <i className="codicon codicon-add" aria-hidden="true" /> {t(`schema.add.${noun(node)}`)}
              </button>
            )}
          </div>
          {!tables.length && readOnly && <p className="pg-hint pg-hint--empty">{t('schema.empty')}</p>}
          {showDdl && <pre className="pg-schema__ddl">{ddl(node)}</pre>}
        </div>
      </div>
    </div>
  );
}

/** Сводка схемы в инспекторе: имена таблиц и их ключи, кнопка — открыть редактор. */
export function SchemaSummary({ node, patch, readOnly, t }: { node: DesignNode; patch: Patch; readOnly: boolean; t: T }) {
  const [open, setOpen] = useState(false);
  const family = schemaFamily(node.kind);
  if (!family) return null;
  const tables = node.schema ?? [];

  return (
    <section className="pg-competency pg-schema-summary">
      <header className="pg-competency__head">
        <span className="pg-field__label">
          {t(`schema.heading.${noun(node)}`)} <span className="pg-count">{tables.length}</span>
        </span>
        {(!readOnly || tables.length > 0) && (
          <button type="button" className="pg-button pg-button--small" onClick={() => setOpen(true)}>
            <i className="codicon codicon-table" aria-hidden="true" /> {t(readOnly ? 'schema.view' : 'schema.open')}
          </button>
        )}
      </header>
      {!tables.length && <p className="pg-hint pg-hint--empty">{t(`schema.none.${noun(node)}`)}</p>}
      <ul className="pg-schema-summary__list">
        {tables.map((table) => {
          const keys = table.columns.filter((column) => column.keys.some((flag) => flag !== 'index'));
          return (
            <li key={table.id}>
              <strong>{table.name}</strong>
              <span className="pg-schema-summary__cols">
                {keys.map((column) => column.name).join(', ')}
                {table.columns.length > keys.length && ` +${table.columns.length - keys.length}`}
              </span>
            </li>
          );
        })}
      </ul>
      {open && <SchemaDialog node={node} patch={patch} readOnly={readOnly} t={t} onClose={() => setOpen(false)} />}
    </section>
  );
}

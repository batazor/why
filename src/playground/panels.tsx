import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { BLOCK_BY_KIND, STATEFUL_KINDS } from './catalog';
import { bytesPerWrite, schemaSizes } from './sizing';
import {
  BYTE_OUTPUTS,
  CALC_DEFAULTS,
  CALC_INPUTS,
  RATE_OUTPUTS,
  calculate,
  formatBytes,
  formatNumber,
  toPosition,
  toValue,
  type CalcOutputKey,
} from './calc';
import {
  NFR_CATEGORIES,
  lint,
  nextRequirementId,
  type Design,
  type Finding,
  type NfrCategory,
  REQ_DRAG,
  type Requirement,
  type RequirementKind,
} from './model';
import type { T } from './i18n';
import { SaveStatus, type SaveState } from './toolbar';

type Update = (fn: (design: Design) => Design) => void;

interface PanelProps {
  design: Design;
  update: Update;
  t: T;
  lang: string;
}

/* ---------------------------------------------------------------- Задача */

export function TaskPanel({ design, update, t }: PanelProps) {
  return (
    <div className="pg-panel">
      <label className="pg-field">
        <span className="pg-field__label">{t('task.title')}</span>
        <input
          className="pg-input"
          value={design.title}
          onChange={(event) => {
            const title = event.currentTarget.value;
            update((current) => ({ ...current, title }));
          }}
        />
      </label>
      <label className="pg-field">
        <span className="pg-field__label">{t('task.source')}</span>
        <input
          className="pg-input"
          placeholder="Product Owner"
          value={design.taskSource}
          onChange={(event) => {
            const taskSource = event.currentTarget.value;
            update((current) => ({ ...current, taskSource }));
          }}
        />
      </label>
      <label className="pg-field pg-field--grow">
        <span className="pg-field__label">{t('task.body')}</span>
        <textarea
          className="pg-input pg-textarea pg-textarea--task"
          placeholder={t('task.placeholder')}
          value={design.task}
          onChange={(event) => {
            const task = event.currentTarget.value;
            update((current) => ({ ...current, task }));
          }}
        />
      </label>
      <p className="pg-hint">{t('task.hint')}</p>
    </div>
  );
}

/* ------------------------------------------------------------ Требования */

export function patchRequirement(update: Update, id: string, patch: Partial<Requirement>) {
  update((design) => ({
    ...design,
    requirements: design.requirements.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }));
}

export function addRequirement(update: Update, kind: RequirementKind, patch: Partial<Requirement> = {}) {
  update((design) => ({
    ...design,
    requirements: [
      ...design.requirements,
      { id: nextRequirementId(design, kind), kind, text: '', target: '', covers: [], ...patch },
    ],
  }));
}

/** Состояние автосохранения проекта и куда он пишется: в облако или в этот браузер. */
export interface SaveMark {
  status: SaveState;
  onServer: boolean;
}

interface RequirementCardProps {
  design: Design;
  item: Requirement;
  t: T;
  editing: boolean;
  /** Отметка сохранения — у карточки, которую только что правили. */
  saved?: ReactNode;
  onEdit: () => void;
  onDone: () => void;
  onPatch: (patch: Partial<Requirement>) => void;
  onRemove: () => void;
}

/**
 * Требование карточкой, как в Trello: по умолчанию это текст, а не форма —
 * поле ввода без рамки вокруг смысла читалось как «здесь ничего нельзя».
 * Щелчок превращает карточку в редактор, щелчок мимо возвращает обратно.
 *
 * Читаемую карточку тащат на блок схемы за любое место. В редакторе ручкой
 * остаётся номер: перетаскивание из textarea выделяет текст, а не карточку.
 */
function RequirementCard({ design, item, t, editing, saved, onEdit, onDone, onPatch, onRemove }: RequirementCardProps) {
  const root = useRef<HTMLLIElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  /** Вышли клавишей или кнопкой — фокус вернётся на карточку, иначе с клавиатуры теряется место в списке. */
  const refocus = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;
  /** Кнопка мыши сейчас нажата: потерю фокуса от этого нажатия разберёт щелчок, а не blur. */
  const held = useRef(false);
  /** Где началось нажатие — в карточке или мимо. */
  const pressed = useRef<'in' | 'out' | null>(null);

  useEffect(() => {
    if (editing) {
      const input = field.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (refocus.current) {
      refocus.current = false;
      card.current?.focus();
    }
  }, [editing]);

  /** Поле растёт по тексту: читаемая карточка показывала его целиком, редактор не должен прятать половину. */
  useLayoutEffect(() => {
    const input = field.current;
    if (!editing || !input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight + input.offsetHeight - input.clientHeight}px`;
  }, [editing, item.text]);

  /**
   * Щелчок мимо закрывает редактор — но по click, а не по нажатию: карточка
   * при закрытии сжимается, соседи под ней съезжают, и щелчок, начатый на
   * одной карточке, отпускался бы уже над другой и пропадал.
   */
  useEffect(() => {
    if (!editing) return;
    const inside = (target: EventTarget | null) => Boolean(root.current?.contains(target as Node | null));
    const down = (event: PointerEvent) => {
      held.current = true;
      pressed.current = inside(event.target) ? 'in' : 'out';
    };
    const release = () => {
      held.current = false;
    };
    const click = (event: MouseEvent) => {
      // Выделяли текст и отпустили кнопку за карточкой — это не щелчок мимо.
      if (pressed.current === 'out' && !inside(event.target)) done.current();
      pressed.current = null;
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    document.addEventListener('dragend', release, true);
    document.addEventListener('click', click, true);
    return () => {
      held.current = false;
      pressed.current = null;
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', release, true);
      document.removeEventListener('pointercancel', release, true);
      document.removeEventListener('dragend', release, true);
      document.removeEventListener('click', click, true);
    };
  }, [editing]);

  const drag = (event: DragEvent) => {
    event.dataTransfer.setData(REQ_DRAG, item.id);
    event.dataTransfer.effectAllowed = 'link';
  };

  const finish = () => {
    refocus.current = true;
    onDone();
  };

  const remove = (
    <button
      type="button"
      className="pg-icon-button pg-req__remove"
      title={t('req.remove')}
      aria-label={`${t('req.remove')}: ${item.id}`}
      onClick={onRemove}
    >
      <i className="codicon codicon-trash" aria-hidden="true" />
    </button>
  );

  if (!editing) {
    const blocks = design.nodes.filter((node) => item.covers.includes(node.id));
    const nfr = item.kind === 'nfr';
    return (
      <li ref={root} className="pg-req__item is-read" draggable onDragStart={drag}>
        <div
          ref={card}
          className="pg-req__card"
          role="button"
          tabIndex={0}
          title={t('req.cardHint')}
          onClick={onEdit}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onEdit();
            }
          }}
        >
          <span className="pg-req__id pg-req__grip">
            <i className="codicon codicon-gripper" aria-hidden="true" />
            {item.id}
          </span>
          <div className="pg-req__body">
            <p className={`pg-req__read ${item.text.trim() ? '' : 'is-empty'}`}>
              {item.text.trim() ? item.text : t('req.clickToWrite')}
            </p>
            {(nfr || blocks.length > 0) && (
              <div className="pg-req__meta">
                {nfr && item.category && <span className="pg-req__category">{t(`nfr.${item.category}`)}</span>}
                {nfr && (
                  <span className={`pg-req__target ${item.target.trim() ? '' : 'is-empty'}`}>
                    {item.target.trim() ? item.target : t('req.noTarget')}
                  </span>
                )}
                {/* Чем требование уже закрыто: ответ на перетаскивание виден на самой карточке. */}
                {blocks.map((node) => (
                  <span key={node.id} className="pg-doc__block">
                    <i
                      className={`codicon codicon-${BLOCK_BY_KIND.get(node.kind)?.icon ?? 'server-process'}`}
                      aria-hidden="true"
                    />
                    {node.label || t(`block.${node.kind}`)}
                  </span>
                ))}
              </div>
            )}
          </div>
          <i className="codicon codicon-edit pg-req__pencil" aria-hidden="true" />
        </div>
        {remove}
        {saved}
      </li>
    );
  }

  return (
    <li
      ref={root}
      className="pg-req__item is-editing"
      onKeyDown={(event) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
          event.preventDefault();
          event.stopPropagation();
          finish();
        }
      }}
      onBlur={(event) => {
        // Фокус ушёл клавишей Tab за пределы карточки. Уход мышью разбирает щелчок выше.
        if (held.current) return;
        const next = event.relatedTarget as Node | null;
        if (next && !event.currentTarget.contains(next)) onDone();
      }}
    >
      <div className="pg-req__row">
        {/*
          Номер — ручка и подпись поля: щелчок ставит курсор в текст,
          перетаскивание на блок схемы связывает требование с блоком.
        */}
        <label
          className="pg-req__id pg-req__grip"
          htmlFor={`pg-req-${item.id}`}
          draggable
          title={t('req.dragHint')}
          onDragStart={drag}
        >
          <i className="codicon codicon-gripper" aria-hidden="true" />
          {item.id}
        </label>
        <textarea
          ref={field}
          id={`pg-req-${item.id}`}
          className="pg-input pg-textarea pg-req__text"
          rows={2}
          placeholder={t('req.text')}
          value={item.text}
          onChange={(event) => onPatch({ text: event.currentTarget.value })}
        />
        {remove}
      </div>
      {item.kind === 'nfr' && (
        <div className="pg-req__row pg-req__row--nfr">
          <select
            className="pg-input pg-select"
            aria-label={t('req.category')}
            value={item.category ?? ''}
            onChange={(event) =>
              onPatch({ category: (event.currentTarget.value || undefined) as NfrCategory | undefined })
            }
          >
            <option value="">{t('req.category')}</option>
            {NFR_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`nfr.${category}`)}
              </option>
            ))}
          </select>
          <input
            className="pg-input"
            placeholder={t('req.target')}
            value={item.target}
            onChange={(event) => onPatch({ target: event.currentTarget.value })}
          />
        </div>
      )}
      <div className="pg-req__foot">
        <button type="button" className="pg-button pg-button--small" title={t('req.doneHint')} onClick={finish}>
          <i className="codicon codicon-check" aria-hidden="true" /> {t('req.done')}
        </button>
      </div>
      {saved}
    </li>
  );
}

export function RequirementsPanel({ design, update, t, save }: PanelProps & { save?: SaveMark }) {
  /** Правится одна карточка за раз: остальные остаются текстом. */
  const [editing, setEditing] = useState<string | null>(null);
  /** Какую карточку правили последней — отметка сохранения встаёт рядом с ней, а не в шапке окна. */
  const [touched, setTouched] = useState<string | null>(null);

  // «Сохранено» повисит пару секунд и уйдёт; «сохраняю» и «не сохранено» остаются, пока это правда.
  const status = save?.status;
  useEffect(() => {
    if (!touched || status !== 'saved') return;
    const timer = setTimeout(() => setTouched(null), 2000);
    return () => clearTimeout(timer);
  }, [touched, status]);

  const add = (kind: RequirementKind) => {
    // Тот же номер, что выдаст addRequirement: новая карточка сразу открыта на правку.
    const id = nextRequirementId(design, kind);
    addRequirement(update, kind);
    setEditing(id);
    setTouched(id);
  };

  const remove = (id: string) => {
    update((current) => ({
      ...current,
      requirements: current.requirements.filter((other) => other.id !== id),
      api: current.api.map((route) => ({ ...route, covers: route.covers.filter((covered) => covered !== id) })),
    }));
    setEditing((current) => (current === id ? null : current));
  };

  const section = (kind: RequirementKind) => {
    const items = design.requirements.filter((item) => item.kind === kind);
    return (
      <section className="pg-req">
        <header className="pg-req__head">
          <h3 className="pg-heading">
            {t(`req.${kind}`)} <span className="pg-count">{items.length}</span>
          </h3>
          <button type="button" className="pg-button pg-button--small" onClick={() => add(kind)}>
            + {t('req.add')}
          </button>
        </header>
        <p className="pg-hint">{t(`req.${kind}Hint`)}</p>
        {!items.length && <p className="pg-hint pg-hint--empty">{t('req.empty')}</p>}
        <ol className="pg-req__list">
          {items.map((item) => (
            <RequirementCard
              key={item.id}
              design={design}
              item={item}
              t={t}
              editing={editing === item.id}
              saved={
                save &&
                touched === item.id && (
                  <span className="pg-req__saved" role="status">
                    <SaveStatus t={t} status={save.status} onServer={save.onServer} />
                  </span>
                )
              }
              onEdit={() => setEditing(item.id)}
              onDone={() => setEditing((current) => (current === item.id ? null : current))}
              onPatch={(patch) => {
                patchRequirement(update, item.id, patch);
                setTouched(item.id);
              }}
              onRemove={() => remove(item.id)}
            />
          ))}
        </ol>
      </section>
    );
  };

  return (
    <div className="pg-panel">
      {section('fr')}
      {section('nfr')}
    </div>
  );
}

/* ------------------------------------------------------------- Оценки */

const OUTPUTS: CalcOutputKey[] = [
  'writesPerDay',
  'writeRps',
  'readRps',
  'peakRps',
  'inFlight',
  'storagePerDay',
  'storageTotal',
  'ingress',
  'egress',
];

const KEY_OUTPUTS: ReadonlySet<CalcOutputKey> = new Set(['peakRps', 'storageTotal']);

function CalcTool({ design, update, t, lang }: PanelProps) {
  const values = { ...CALC_DEFAULTS, ...design.calc.values };
  const result = useMemo(() => calculate(values), [JSON.stringify(values)]);
  const num = (value: number) => formatNumber(lang, value);

  const shown = (key: CalcOutputKey) => {
    const value = result[key];
    if (BYTE_OUTPUTS.has(key)) return formatBytes(lang, value);
    if (RATE_OUTPUTS.has(key)) return `${formatBytes(lang, value)}/s`;
    return num(value);
  };

  const set = (key: string, value: number) =>
    update((current) => ({ ...current, calc: { ...current.calc, values: { ...current.calc.values, [key]: value } } }));

  return (
    <>
      <div className="pg-calc__bar">
        <h3 className="pg-heading">{t('calc.inputs')}</h3>
        <button
          type="button"
          className="pg-button pg-button--small"
          onClick={() => update((current) => ({ ...current, calc: { ...current.calc, values: {} } }))}
        >
          {t('calc.reset')}
        </button>
      </div>
      {CALC_INPUTS.map((input) => (
        <label className="pg-calc__row" key={input.key}>
          <span className="pg-calc__name">{t(`calc.${input.key}`)}</span>
          <span className="pg-calc__value">{num(values[input.key])}</span>
          <input
            className="pg-calc__slider"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={toPosition(input, values[input.key])}
            onChange={(event) => set(input.key, toValue(input, Number(event.currentTarget.value)))}
          />
        </label>
      ))}

      <h3 className="pg-heading">{t('calc.result')}</h3>
      <dl className="pg-calc__grid">
        {OUTPUTS.map((key) => (
          <div className={`pg-calc__cell ${KEY_OUTPUTS.has(key) ? 'is-key' : ''}`} key={key}>
            <dt>{t(`calc.out.${key}`)}</dt>
            <dd>{shown(key)}</dd>
          </div>
        ))}
      </dl>
      <p className="pg-calc__law">
        {t('calc.law', { rps: num(result.peakRps), sec: num(values.latencyMs / 1000), n: num(result.inFlight) })}
      </p>
      {result.hints.length > 0 && (
        <ul className="pg-calc__hints">
          {result.hints.map((hint) => (
            <li key={hint}>{t(hint)}</li>
          ))}
        </ul>
      )}
      <div className="pg-actions">
        <button
          type="button"
          className="pg-button pg-button--small"
          onClick={() =>
            addRequirement(update, 'nfr', {
              text: t('calc.nfr.throughput'),
              target: t('calc.nfr.throughputTarget', { rps: num(result.peakRps), n: num(result.inFlight) }),
              category: 'throughput',
            })
          }
        >
          + {t('calc.toNfr')}: {t('nfr.throughput')}
        </button>
        <button
          type="button"
          className="pg-button pg-button--small"
          onClick={() =>
            addRequirement(update, 'nfr', {
              text: t('calc.nfr.storage'),
              target: t('calc.nfr.storageTarget', {
                days: num(values.retentionDays),
                size: formatBytes(lang, result.storageTotal),
              }),
              category: 'durability',
            })
          }
        >
          + {t('calc.toNfr')}: {t('nfr.durability')}
        </button>
      </div>

      <SchemaSizing design={design} update={update} t={t} lang={lang} />
    </>
  );
}

/**
 * Объём по таблицам схемы: то же «сколько места», но из полей, а не из
 * одного ползунка «размер записи». Кнопка переносит посчитанный размер в
 * калькулятор, и две оценки сходятся.
 */
function SchemaSizing({ design, update, t, lang }: PanelProps) {
  const sizes = schemaSizes(design);
  if (!sizes.length)
    return (
      <section className="pg-sizing">
        <h3 className="pg-heading">{t('sizing.heading')}</h3>
        <p className="pg-hint">{t('sizing.none')}</p>
      </section>
    );

  const perWrite = bytesPerWrite(sizes);
  const total = sizes.reduce((sum, item) => sum + item.total, 0);
  const kb = Math.max(0.1, Math.round((perWrite / 1024) * 100) / 100);

  return (
    <section className="pg-sizing">
      <h3 className="pg-heading">{t('sizing.heading')}</h3>
      <p className="pg-hint">{t('sizing.hint')}</p>
      {sizes.map(({ node, tables, total: nodeTotal }) => (
        <div className="pg-sizing__node" key={node.id}>
          <div className="pg-sizing__row pg-sizing__row--node">
            <span>{node.label || t(`block.${node.kind}`)}</span>
            <strong>{formatBytes(lang, nodeTotal)}</strong>
          </div>
          {tables.map(({ table, size }) => (
            <div className="pg-sizing__row" key={table.id}>
              <code>{table.name}</code>
              <span className="pg-sizing__detail">
                {t('sizing.row', {
                  row: formatBytes(lang, size.row + size.index),
                  days: formatNumber(lang, size.retentionDays),
                })}
              </span>
              <span>{formatBytes(lang, size.total)}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="pg-sizing__row pg-sizing__row--total">
        <span>{t('sizing.total')}</span>
        <strong>{formatBytes(lang, total)}</strong>
      </div>
      <button
        type="button"
        className="pg-button pg-button--small"
        onClick={() =>
          update((current) => ({ ...current, calc: { ...current.calc, values: { ...current.calc.values, objectKb: kb } } }))
        }
      >
        {t('sizing.apply', { kb: formatNumber(lang, kb) })}
      </button>
    </section>
  );
}

/**
 * Шаг оценок. Прикидка словами есть всегда: её пишут до калькулятора, а
 * если калькулятор открыт — записывают выводы. Сам калькулятор — если
 * автор его дал, или если интервьюер открыл его по ходу собеседования.
 */
export function CalcPanel({
  design,
  update,
  t,
  lang,
  showCalc,
  locked,
  snapshot,
}: PanelProps & { showCalc: boolean; locked: boolean; snapshot?: string }) {
  return (
    <div className="pg-panel">
      <label className="pg-field">
        <span className="pg-field__label">{t('estimate.label')}</span>
        <textarea
          className="pg-input pg-textarea pg-estimate"
          rows={6}
          placeholder={t('estimate.placeholder')}
          value={design.estimate}
          onChange={(event) => {
            const estimate = event.currentTarget.value;
            update((current) => ({ ...current, estimate }));
          }}
        />
      </label>
      {locked && <p className="pg-hint">{t('estimate.locked')}</p>}
      {snapshot !== undefined && (
        <section className="pg-guide">
          <h3 className="pg-heading">{t('estimate.before')}</h3>
          <p>{snapshot.trim() || t('estimate.beforeEmpty')}</p>
        </section>
      )}
      {showCalc && <CalcTool design={design} update={update} t={t} lang={lang} />}
    </div>
  );
}

/* ------------------------------------------------------------ Проверки */

export function useFindings(design: Design) {
  return useMemo(() => lint(design, STATEFUL_KINDS), [design]);
}

export function ChecksPanel({ design, t, extra = [] }: PanelProps & { extra?: Finding[] }) {
  const findings = [...extra, ...useFindings(design)];
  return (
    <div className="pg-panel">
      {!findings.length && <p className="pg-hint pg-hint--empty">{t('lint.clean')}</p>}
      <ul className="pg-findings">
        {findings.map((finding, index) => (
          <li key={index} className={`pg-finding pg-finding--${finding.level}`}>
            <i className={`codicon codicon-${finding.level === 'warn' ? 'warning' : 'info'}`} aria-hidden="true" />
            {t(finding.key, finding.params?.kind ? { ...finding.params, kind: t(`block.${finding.params.kind}`) } : finding.params)}
          </li>
        ))}
      </ul>
    </div>
  );
}

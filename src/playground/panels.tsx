import { useMemo } from 'react';
import { STATEFUL_KINDS } from './catalog';
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

export function RequirementsPanel({ design, update, t }: PanelProps) {
  const section = (kind: RequirementKind) => {
    const items = design.requirements.filter((item) => item.kind === kind);
    return (
      <section className="pg-req">
        <header className="pg-req__head">
          <h3 className="pg-heading">
            {t(`req.${kind}`)} <span className="pg-count">{items.length}</span>
          </h3>
          <button type="button" className="pg-button pg-button--small" onClick={() => addRequirement(update, kind)}>
            + {t('req.add')}
          </button>
        </header>
        <p className="pg-hint">{t(`req.${kind}Hint`)}</p>
        {!items.length && <p className="pg-hint pg-hint--empty">{t('req.empty')}</p>}
        <ol className="pg-req__list">
          {items.map((item) => (
            <li className="pg-req__item" key={item.id}>
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
                  onDragStart={(event) => {
                    event.dataTransfer.setData(REQ_DRAG, item.id);
                    event.dataTransfer.effectAllowed = 'link';
                  }}
                >
                  <i className="codicon codicon-gripper" aria-hidden="true" />
                  {item.id}
                </label>
                <textarea
                  id={`pg-req-${item.id}`}
                  className="pg-input pg-textarea pg-req__text"
                  rows={2}
                  placeholder={t('req.text')}
                  value={item.text}
                  onChange={(event) => patchRequirement(update, item.id, { text: event.currentTarget.value })}
                />
                <button
                  type="button"
                  className="pg-icon-button"
                  title={t('req.remove')}
                  aria-label={t('req.remove')}
                  onClick={() =>
                    update((design) => ({
                      ...design,
                      requirements: design.requirements.filter((other) => other.id !== item.id),
                      api: design.api.map((route) => ({ ...route, covers: route.covers.filter((id) => id !== item.id) })),
                    }))
                  }
                >
                  <i className="codicon codicon-trash" aria-hidden="true" />
                </button>
              </div>
              {kind === 'nfr' && (
                <div className="pg-req__row pg-req__row--nfr">
                  <select
                    className="pg-input pg-select"
                    aria-label={t('req.category')}
                    value={item.category ?? ''}
                    onChange={(event) =>
                      patchRequirement(update, item.id, {
                        category: (event.currentTarget.value || undefined) as NfrCategory | undefined,
                      })
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
                    onChange={(event) => patchRequirement(update, item.id, { target: event.currentTarget.value })}
                  />
                </div>
              )}
            </li>
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

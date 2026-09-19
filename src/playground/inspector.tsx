import { useEffect, useState } from 'react';
import { BLOCKS, EDGE_PRESETS } from './catalog';
import { competencyFor, localized, type CompetencyGroup } from './competency';
import { patchRequirement } from './panels';
import { BlockRoutes } from './api-panel';
import type { Design, DesignNode, Requirement } from './model';
import type { T } from './i18n';

type Update = (fn: (design: Design) => Design) => void;

interface Props {
  design: Design;
  update: Update;
  t: T;
  lang: string;
  selection: { node?: string; edge?: string };
  readOnly: boolean;
  /** Интервьюеру — вопросы на углубление по выбранному блоку. */
  showProbes: boolean;
}

/**
 * Требования блока — сразу текстом, а не номерами: смотрящему на блок
 * важно, что он обещает, а не как это обещание пронумеровано.
 */
function BlockRequirements({ design, node, update, t, readOnly }: Pick<Props, 'design' | 'update' | 't' | 'readOnly'> & { node: DesignNode }) {
  const linked = design.requirements.filter((item) => item.covers.includes(node.id));
  const rest = design.requirements.filter((item) => !item.covers.includes(node.id));
  const unlink = (item: Requirement) =>
    patchRequirement(update, item.id, { covers: item.covers.filter((id) => id !== node.id) });

  return (
    <section className="pg-field">
      <span className="pg-field__label">
        {t('inspect.reqs')} <span className="pg-count">{linked.length}</span>
      </span>
      {!linked.length && <p className="pg-hint pg-hint--empty">{t('inspect.noReqs')}</p>}
      <ul className="pg-linked">
        {linked.map((item) => (
          <li key={item.id} className={`pg-linked__item pg-linked__item--${item.kind}`}>
            <span className="pg-linked__id">{item.id}</span>
            <span className="pg-linked__text">
              {item.text || <em>{t('req.text')}</em>}
              {item.kind === 'nfr' && item.target && <span className="pg-linked__target">{item.target}</span>}
            </span>
            {!readOnly && (
              <button type="button" className="pg-icon-button" aria-label={t('inspect.unlink')} title={t('inspect.unlink')} onClick={() => unlink(item)}>
                <i className="codicon codicon-close" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && rest.length > 0 && (
        <div className="pg-chips">
          {rest.map((item) => (
            <button
              key={item.id}
              type="button"
              className="pg-chip"
              title={item.text}
              onClick={() => patchRequirement(update, item.id, { covers: [...item.covers, node.id] })}
            >
              + {item.id}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Таблица сравнения технологий во весь экран: в боковой панели четыре колонки не читаются. */
function CompareDialog({ group, chosen, onPick, onClose, t, lang, readOnly }: {
  group: CompetencyGroup;
  chosen?: string;
  onPick: (id: string) => void;
  onClose: () => void;
  t: T;
  lang: string;
  readOnly: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="pg-dialog" role="dialog" aria-modal="true" aria-label={t(`comp.${group.id}`)} onClick={onClose}>
      <div className="pg-dialog__box" onClick={(event) => event.stopPropagation()}>
        <header className="pg-dialog__head">
          <h3>{t('comp.title', { group: t(`comp.${group.id}`) })}</h3>
          <button type="button" className="pg-icon-button" aria-label={t('comp.close')} onClick={onClose}>
            <i className="codicon codicon-close" aria-hidden="true" />
          </button>
        </header>
        <div className="pg-compare__scroll">
          <table className="pg-compare">
            <thead>
              <tr>
                <th />
                {group.options.map((option) => (
                  <th key={option.id} className={option.id === chosen ? 'is-chosen' : ''}>
                    {option.name}
                    {!readOnly && (
                      <button
                        type="button"
                        className={`pg-button pg-button--small ${option.id === chosen ? 'is-on' : ''}`}
                        onClick={() => onPick(option.id)}
                      >
                        {option.id === chosen ? t('comp.chosen') : t('comp.choose')}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.dimensions.map((dimension) => (
                <tr key={dimension}>
                  <th scope="row">{t(`dim.${dimension}`)}</th>
                  {group.options.map((option) => (
                    <td key={option.id} className={option.id === chosen ? 'is-chosen' : ''}>
                      {option.values[dimension]}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="pg-compare__prose">
                <th scope="row">{t('comp.pick')}</th>
                {group.options.map((option) => (
                  <td key={option.id} className={option.id === chosen ? 'is-chosen' : ''}>
                    {localized(option.pick, lang)}
                  </td>
                ))}
              </tr>
              <tr className="pg-compare__prose">
                <th scope="row">{t('comp.avoid')}</th>
                {group.options.map((option) => (
                  <td key={option.id} className={option.id === chosen ? 'is-chosen' : ''}>
                    {localized(option.avoid, lang)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Competency({ node, patch, t, lang, readOnly, showProbes }: {
  node: DesignNode;
  patch: (value: Partial<DesignNode>) => void;
  t: T;
  lang: string;
  readOnly: boolean;
  showProbes: boolean;
}) {
  const [open, setOpen] = useState(false);
  const group = competencyFor(node.kind);
  if (!group) return null;
  const chosen = group.options.find((option) => option.id === node.tech);

  return (
    <section className="pg-competency">
      <header className="pg-competency__head">
        <span className="pg-field__label">{t('comp.heading')}</span>
        <button type="button" className="pg-button pg-button--small" onClick={() => setOpen(true)}>
          <i className="codicon codicon-table" aria-hidden="true" /> {t('comp.compare')}
        </button>
      </header>
      <select
        className="pg-input pg-select pg-competency__select"
        disabled={readOnly}
        value={node.tech ?? ''}
        onChange={(event) => patch({ tech: event.currentTarget.value || undefined })}
      >
        <option value="">{t('comp.none')}</option>
        {group.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      {chosen && (
        <dl className="pg-competency__why">
          <dt>{t('comp.pick')}</dt>
          <dd>{localized(chosen.pick, lang)}</dd>
          <dt>{t('comp.avoid')}</dt>
          <dd>{localized(chosen.avoid, lang)}</dd>
        </dl>
      )}
      {showProbes && (
        <>
          <span className="pg-field__label">{t('comp.probes')}</span>
          <ul className="pg-probes">
            {group.probes.map((probe, index) => (
              <li key={index}>{localized(probe, lang)}</li>
            ))}
          </ul>
        </>
      )}
      {open && (
        <CompareDialog
          group={group}
          chosen={node.tech}
          onPick={(tech) => patch({ tech: tech === node.tech ? undefined : tech })}
          onClose={() => setOpen(false)}
          t={t}
          lang={lang}
          readOnly={readOnly}
        />
      )}
    </section>
  );
}

export function InspectorPanel({ design, update, t, lang, selection, readOnly, showProbes }: Props) {
  const node = selection.node ? design.nodes.find((item) => item.id === selection.node) : undefined;
  const edge = selection.edge ? design.edges.find((item) => item.id === selection.edge) : undefined;
  const name = (id: string) => {
    const found = design.nodes.find((item) => item.id === id);
    return found ? found.label || t(`block.${found.kind}`) : '?';
  };

  if (node) {
    const patch = (value: Partial<DesignNode>) =>
      update((current) => ({
        ...current,
        nodes: current.nodes.map((item) => (item.id === node.id ? { ...item, ...value } : item)),
      }));
    return (
      <div className="pg-panel">
        <label className="pg-field">
          <span className="pg-field__label">{t('inspect.name')}</span>
          <input className="pg-input" readOnly={readOnly} value={node.label} onChange={(event) => patch({ label: event.currentTarget.value })} />
        </label>
        <label className="pg-field">
          <span className="pg-field__label">{t('inspect.type')}</span>
          <select
            className="pg-input pg-select"
            disabled={readOnly}
            value={node.kind}
            // Смена типа сбрасывает технологию: Kafka у SQL-базы смысла не имеет.
            onChange={(event) => patch({ kind: event.currentTarget.value, tech: undefined })}
          >
            {BLOCKS.map((block) => (
              <option key={block.kind} value={block.kind}>
                {t(`block.${block.kind}`)}
              </option>
            ))}
          </select>
        </label>

        <Competency node={node} patch={patch} t={t} lang={lang} readOnly={readOnly} showProbes={showProbes} />

        <BlockRequirements design={design} node={node} update={update} t={t} readOnly={readOnly} />

        <BlockRoutes design={design} nodeId={node.id} t={t} />

        <label className="pg-field">
          <span className="pg-field__label">{t('inspect.note')}</span>
          <textarea
            className="pg-input pg-textarea"
            rows={4}
            readOnly={readOnly}
            value={node.note}
            onChange={(event) => patch({ note: event.currentTarget.value })}
          />
        </label>
        {!readOnly && (
          <button
            type="button"
            className="pg-button pg-button--danger"
            onClick={() =>
              update((current) => ({
                ...current,
                nodes: current.nodes.filter((item) => item.id !== node.id),
                edges: current.edges.filter((item) => item.source !== node.id && item.target !== node.id),
                requirements: current.requirements.map((item) => ({
                  ...item,
                  covers: item.covers.filter((id) => id !== node.id),
                })),
                api: current.api.map((item) => (item.service === node.id ? { ...item, service: undefined } : item)),
              }))
            }
          >
            {t('inspect.delete')}
          </button>
        )}
      </div>
    );
  }

  if (edge) {
    const patch = (value: Partial<typeof edge>) =>
      update((current) => ({
        ...current,
        edges: current.edges.map((item) => (item.id === edge.id ? { ...item, ...value } : item)),
      }));
    return (
      <div className="pg-panel">
        <p className="pg-edge-route">
          {name(edge.source)} <i className="codicon codicon-arrow-right" aria-hidden="true" /> {name(edge.target)}
        </p>
        <fieldset className="pg-plain" disabled={readOnly}>
          <label className="pg-field">
            <span className="pg-field__label">{t('inspect.label')}</span>
            <input
              className="pg-input"
              list="pg-edge-presets"
              value={edge.label}
              onChange={(event) => patch({ label: event.currentTarget.value })}
            />
            <datalist id="pg-edge-presets">
              {EDGE_PRESETS.map((preset) => (
                <option key={preset} value={preset} />
              ))}
            </datalist>
          </label>
          <fieldset className="pg-field pg-segmented">
            <legend className="pg-field__label">{t('inspect.mode')}</legend>
            {(['sync', 'async'] as const).map((mode) => (
              <label key={mode} className={edge.mode === mode ? 'is-on' : ''}>
                <input type="radio" name="pg-edge-mode" checked={edge.mode === mode} onChange={() => patch({ mode })} />
                {t(`inspect.${mode}`)}
              </label>
            ))}
          </fieldset>
          {!readOnly && (
            <div className="pg-actions">
              <button type="button" className="pg-button" onClick={() => patch({ source: edge.target, target: edge.source })}>
                <i className="codicon codicon-arrow-swap" aria-hidden="true" /> {t('inspect.from')} ⇄ {t('inspect.to')}
              </button>
              <button
                type="button"
                className="pg-button pg-button--danger"
                onClick={() => update((current) => ({ ...current, edges: current.edges.filter((item) => item.id !== edge.id) }))}
              >
                {t('inspect.delete')}
              </button>
            </div>
          )}
        </fieldset>
      </div>
    );
  }

  return (
    <div className="pg-panel">
      <p className="pg-hint pg-hint--empty">{t('inspect.none')}</p>
    </div>
  );
}

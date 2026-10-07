import { useEffect, useState } from 'react';
import { BLOCKS, DOWNSTREAM_PATTERNS, EDGE_PRESETS, UPSTREAM_PATTERNS } from './catalog';
import { competencyFor, localized, type CompetencyGroup } from './competency';
import { patchRequirement } from './panels';
import { BlockRoutes } from './api-panel';
import { SchemaSummary } from './schema-editor';
import { ReqChip } from './req-chip';
import {
  TEXT_SIZES,
  criterionId,
  isContextEdge,
  isText,
  upstreamEnd,
  type Design,
  type DesignNode,
  type MatrixCell,
  type MatrixCriterion,
  type MatrixScore,
  type Requirement,
  type TechMatrix,
} from './model';
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
  /** Значения оценок для объёма таблиц; нет — объём не показывается (калькулятор кандидату закрыт). */
  sizeValues?: Record<string, number>;
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
            <ReqChip
              key={item.id}
              item={item}
              t={t}
              label={`+ ${item.id}`}
              onClick={() => patchRequirement(update, item.id, { covers: [...item.covers, node.id] })}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const MARK: Record<MatrixScore, string> = { yes: '✓', partial: '~', no: '✗' };

const emptyMatrix = (): TechMatrix => ({ options: [], cells: {} });

/**
 * Матрица выбора технологии во весь экран: в боковой панели колонки не
 * читаются.
 *
 * Строки — требования проекта, которые завёл сам пользователь: ФТ и НФТ, —
 * и его же критерии, которых в документе требований нет: технологию выбирают
 * не только по обещаниям системы, но и по тому, что команда умеет и во что
 * обойдётся эксплуатация.
 * Колонки — технологии, которые он решил сравнить. Готовых значений нет ни в
 * одной ячейке: отметку и «почему» пишет пользователь. На собеседовании это и
 * есть сигнал — умеет ли кандидат обосновать выбор своими требованиями, а не
 * пересказать справочник. Названия из каталога — только подсказки, чтобы не
 * печатать «PostgreSQL» руками.
 */
function MatrixDialog({ node, group, requirements, patch, onClose, t, readOnly }: {
  node: DesignNode;
  group?: CompetencyGroup;
  requirements: Requirement[];
  patch: (value: Partial<DesignNode>) => void;
  onClose: () => void;
  t: T;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [criterionDraft, setCriterionDraft] = useState('');
  const matrix = node.matrix ?? emptyMatrix();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = (next: TechMatrix) => patch({ matrix: next });

  const addOption = (name: string) => {
    const clean = name.trim();
    if (!clean || matrix.options.some((option) => option.toLowerCase() === clean.toLowerCase())) return;
    save({ ...matrix, options: [...matrix.options, clean] });
    setDraft('');
  };

  const removeOption = (name: string) => {
    const cells = Object.fromEntries(
      Object.entries(matrix.cells).map(([req, row]) => {
        const { [name]: _, ...rest } = row;
        return [req, rest];
      }),
    );
    // Строки остаются как были: убирают колонку, а не выбор требований и свои критерии.
    save({ ...matrix, options: matrix.options.filter((option) => option !== name), cells });
    if (node.tech === name) patch({ tech: undefined });
  };

  const cell = (req: string, option: string): MatrixCell => matrix.cells[req]?.[option] ?? { note: '' };

  const setCell = (req: string, option: string, value: Partial<MatrixCell>) =>
    save({
      ...matrix,
      cells: { ...matrix.cells, [req]: { ...matrix.cells[req], [option]: { ...cell(req, option), ...value } } },
    });

  // Строки выбирает пользователь: не каждое ФТ/НФТ касается базы или очереди.
  // Пока он не выбирал — требования, которые закрывает сам блок. Удалённые
  // из документа требования отсюда пропадают сами.
  const picked = matrix.rows ?? requirements.filter((item) => item.covers.includes(node.id)).map((item) => item.id);
  const setRows = (next: string[]) => save({ ...matrix, rows: next });

  // Сначала требования, которые закрывает этот блок: выбор технологии прежде
  // всего про них. Внутри — ФТ, потом НФТ, как в документе требований.
  const byRelevance = (a: Requirement, b: Requirement) => {
    const here = Number(b.covers.includes(node.id)) - Number(a.covers.includes(node.id));
    if (here) return here;
    if (a.kind !== b.kind) return a.kind === 'fr' ? -1 : 1;
    return 0;
  };
  const rows = requirements.filter((item) => picked.includes(item.id)).sort(byRelevance);
  const spare = requirements.filter((item) => !picked.includes(item.id)).sort(byRelevance);

  // Свои критерии — после требований: сначала то, что система обещает, потом
  // то, что важно только для этого выбора.
  const criteria = matrix.criteria ?? [];

  const addCriterion = (text: string) => {
    const clean = text.trim();
    if (!clean || criteria.some((item) => item.text.trim().toLowerCase() === clean.toLowerCase())) return;
    save({ ...matrix, criteria: [...criteria, { id: criterionId(), text: clean }] });
    setCriterionDraft('');
  };

  const renameCriterion = (id: string, text: string) =>
    save({ ...matrix, criteria: criteria.map((item) => (item.id === id ? { ...item, text } : item)) });

  // Требование из строк только скрывают — оценки ждут его возвращения. Свой
  // критерий удаляют насовсем, и его ячейки уходят вместе с ним.
  const removeCriterion = (id: string) => {
    const { [id]: _, ...cells } = matrix.cells;
    const left = criteria.filter((item) => item.id !== id);
    save({ ...matrix, criteria: left.length ? left : undefined, cells });
  };

  // Итог считает все строки: свой критерий весит столько же, сколько требование.
  const allRows: { id: string; req?: Requirement; own?: MatrixCriterion }[] = [
    ...rows.map((req) => ({ id: req.id, req })),
    ...criteria.map((own) => ({ id: own.id, own })),
  ];

  const fits = (option: string) => allRows.filter((row) => cell(row.id, option).score === 'yes').length;

  // Подсказки — названия из каталога, которых ещё нет в колонках.
  const suggestions = (group?.options ?? [])
    .map((option) => option.name)
    .filter((name) => !matrix.options.some((option) => option.toLowerCase() === name.toLowerCase()));

  return (
    <div className="pg-dialog" role="dialog" aria-modal="true" aria-label={t('comp.compare')} onClick={onClose}>
      <div className="pg-dialog__box" onClick={(event) => event.stopPropagation()}>
        <header className="pg-dialog__head">
          <h3>{group ? t('comp.title', { group: t(`comp.${group.id}`) }) : t('comp.compare')}</h3>
          <button type="button" className="pg-icon-button" aria-label={t('comp.close')} onClick={onClose}>
            <i className="codicon codicon-close" aria-hidden="true" />
          </button>
        </header>

        <p className="pg-matrix__hint">{t('comp.matrixHint')}</p>

        {!readOnly && (
          <div className="pg-matrix__add">
            <form
              className="pg-matrix__form"
              onSubmit={(event) => {
                event.preventDefault();
                addOption(draft);
              }}
            >
              <input
                className="pg-input"
                value={draft}
                placeholder={t('comp.optionPlaceholder')}
                onChange={(event) => setDraft(event.currentTarget.value)}
              />
              <button type="submit" className="pg-button pg-button--small">
                <i className="codicon codicon-add" aria-hidden="true" /> {t('comp.addOption')}
              </button>
            </form>
            {/* Свой критерий — такой же формой, что и технология: строку можно
                завести, даже когда документ требований пуст. */}
            <form
              className="pg-matrix__form"
              onSubmit={(event) => {
                event.preventDefault();
                addCriterion(criterionDraft);
              }}
            >
              <input
                className="pg-input"
                value={criterionDraft}
                placeholder={t('comp.criterionPlaceholder')}
                onChange={(event) => setCriterionDraft(event.currentTarget.value)}
              />
              <button type="submit" className="pg-button pg-button--small">
                <i className="codicon codicon-add" aria-hidden="true" /> {t('comp.addCriterion')}
              </button>
            </form>
            {spare.length > 0 && (
              <div className="pg-matrix__suggest">
                <span className="pg-field__label">{t('comp.addRow')}</span>
                {spare.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="pg-chip pg-matrix__pick"
                    title={item.target ? `${item.text} · ${item.target}` : item.text}
                    onClick={() => setRows([...picked, item.id])}
                  >
                    + <span className={`pg-matrix__req pg-matrix__req--${item.kind}`}>{item.id}</span>
                    <span className="pg-matrix__pick-text">{item.text}</span>
                  </button>
                ))}
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="pg-matrix__suggest">
                <span className="pg-field__label">{t('comp.suggest')}</span>
                {suggestions.map((name) => (
                  <button key={name} type="button" className="pg-chip" onClick={() => addOption(name)}>
                    + {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Таблица появляется с первой строкой любого рода: свой критерий
            заменяет требование, которого в документе ещё нет. */}
        {allRows.length === 0 ? (
          <p className="pg-matrix__empty">{t(requirements.length === 0 ? 'comp.noReqs' : 'comp.noRows')}</p>
        ) : (
          <div className="pg-compare__scroll">
            {/* Строки видны и без колонок: сначала решают, по каким требованиям и критериям сравнивать, потом — что. */}
            {matrix.options.length === 0 && <p className="pg-matrix__empty">{t('comp.noOptions')}</p>}
            <table className="pg-compare pg-matrix">
              <thead>
                <tr>
                  <th />
                  {matrix.options.map((option) => (
                    <th key={option} className={option === node.tech ? 'is-chosen' : ''}>
                      <span className="pg-matrix__option">
                        {option}
                        {!readOnly && (
                          <button
                            type="button"
                            className="pg-icon-button pg-matrix__remove"
                            aria-label={t('comp.removeOption')}
                            title={t('comp.removeOption')}
                            onClick={() => removeOption(option)}
                          >
                            <i className="codicon codicon-close" aria-hidden="true" />
                          </button>
                        )}
                      </span>
                      {readOnly ? (
                        option === node.tech && <span className="pg-matrix__badge">{t('comp.chosen')}</span>
                      ) : (
                        <button
                          type="button"
                          className={`pg-matrix__pick ${option === node.tech ? 'is-on' : ''}`}
                          onClick={() => patch({ tech: option === node.tech ? undefined : option })}
                        >
                          {option === node.tech ? `✓ ${t('comp.chosen')}` : t('comp.choose')}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.map(({ id, req, own }) => {
                  // Одна строка — либо требование, либо свой критерий: шапка
                  // разная, ячейки с оценками — одни и те же.
                  const row = { id, label: req ? req.id : own?.text || t('comp.ownBadge') };
                  return (
                  <tr key={row.id}>
                    <th scope="row">
                      {req && <span className={`pg-matrix__req pg-matrix__req--${req.kind}`}>{req.id}</span>}
                      {req?.covers.includes(node.id) && <span className="pg-matrix__here">{t('comp.coversHere')}</span>}
                      {own && <span className="pg-matrix__req pg-matrix__req--own">{t('comp.ownBadge')}</span>}
                      {!readOnly && (
                        <button
                          type="button"
                          className="pg-icon-button pg-matrix__remove pg-matrix__remove-row"
                          aria-label={t('comp.removeRow')}
                          title={t('comp.removeRow')}
                          onClick={() => (own ? removeCriterion(own.id) : setRows(picked.filter((item) => item !== row.id)))}
                        >
                          <i className="codicon codicon-close" aria-hidden="true" />
                        </button>
                      )}
                      {req && <span className="pg-matrix__text">{req.text}</span>}
                      {req?.kind === 'nfr' && req.target && <span className="pg-matrix__target">{req.target}</span>}
                      {/* Текст требования правят в документе требований, свой
                          критерий — прямо здесь: больше он нигде не живёт. */}
                      {own &&
                        (readOnly ? (
                          <span className="pg-matrix__text">{own.text}</span>
                        ) : (
                          <textarea
                            className="pg-matrix__criterion"
                            rows={1}
                            value={own.text}
                            placeholder={t('comp.criterionPlaceholder')}
                            aria-label={t('comp.criterionLabel')}
                            onChange={(event) => renameCriterion(own.id, event.currentTarget.value)}
                          />
                        ))}
                    </th>
                    {matrix.options.map((option) => {
                      const value = cell(row.id, option);
                      return (
                        <td key={option} className={option === node.tech ? 'is-chosen' : ''}>
                          <div className={`pg-matrix__cell pg-matrix__cell--${value.score ?? 'none'}`}>
                            {/* Три отметки рядом, а не одна по кругу: видно, из чего
                                выбирают, и нужная ставится одним щелчком. Повторный
                                щелчок по выбранной снимает её. */}
                            <div className="pg-matrix__marks" role="radiogroup" aria-label={row.label}>
                              {(['yes', 'partial', 'no'] as MatrixScore[]).map((score) => (
                                <button
                                  key={score}
                                  type="button"
                                  role="radio"
                                  aria-checked={value.score === score}
                                  className={`pg-matrix__mark pg-matrix__mark--${score} ${value.score === score ? 'is-on' : ''}`}
                                  disabled={readOnly}
                                  title={t(`comp.score.${score}`)}
                                  onClick={() => setCell(row.id, option, { score: value.score === score ? undefined : score })}
                                >
                                  {MARK[score]}
                                </button>
                              ))}
                            </div>
                            <textarea
                              className="pg-matrix__note"
                              rows={1}
                              value={value.note}
                              placeholder={t('comp.why')}
                              readOnly={readOnly}
                              onChange={(event) => setCell(row.id, option, { note: event.currentTarget.value })}
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
              {matrix.options.length > 0 && (
                <tfoot>
                  <tr>
                    <th scope="row">{t('comp.total')}</th>
                    {matrix.options.map((option) => (
                      <td key={option} className={option === node.tech ? 'is-chosen' : ''}>
                        <div className="pg-matrix__total">
                          <span className="pg-matrix__bar">
                            <span style={{ width: `${allRows.length ? (fits(option) / allRows.length) * 100 : 0}%` }} />
                          </span>
                          <b>
                            {fits(option)} / {allRows.length}
                          </b>
                        </div>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Competency({ node, requirements, patch, t, lang, readOnly, showProbes }: {
  node: DesignNode;
  requirements: Requirement[];
  patch: (value: Partial<DesignNode>) => void;
  t: T;
  lang: string;
  readOnly: boolean;
  showProbes: boolean;
}) {
  const [open, setOpen] = useState(false);
  const group = competencyFor(node.kind);
  if (!group) return null;
  const options = node.matrix?.options ?? [];

  return (
    <section className="pg-competency">
      <header className="pg-competency__head">
        <span className="pg-field__label">{t('comp.heading')}</span>
        <button type="button" className="pg-button pg-button--small" onClick={() => setOpen(true)}>
          <i className="codicon codicon-table" aria-hidden="true" /> {t('comp.compare')}
        </button>
      </header>
      {/* Выбор — из того, что пользователь сам сравнил, а не из каталога:
          технология без обоснования в матрице выбирается вслепую. */}
      <select
        className="pg-input pg-select pg-competency__select"
        disabled={readOnly || options.length === 0}
        value={node.tech ?? ''}
        onChange={(event) => patch({ tech: event.currentTarget.value || undefined })}
      >
        <option value="">{t('comp.none')}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {node.tech && !options.includes(node.tech) && <option value={node.tech}>{node.tech}</option>}
      </select>
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
        <MatrixDialog
          node={node}
          group={group}
          requirements={requirements}
          patch={patch}
          onClose={() => setOpen(false)}
          t={t}
          readOnly={readOnly}
        />
      )}
    </section>
  );
}

export function InspectorPanel({ design, update, t, lang, selection, readOnly, showProbes, sizeValues }: Props) {
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
    const remove = () =>
      update((current) => ({
        ...current,
        nodes: current.nodes.filter((item) => item.id !== node.id),
        edges: current.edges.filter((item) => item.source !== node.id && item.target !== node.id),
        requirements: current.requirements.map((item) => ({
          ...item,
          covers: item.covers.filter((id) => id !== node.id),
        })),
        api: current.api.map((item) => (item.service === node.id ? { ...item, service: undefined } : item)),
      }));

    if (isText(node))
      return (
        <div className="pg-panel">
          <label className="pg-field">
            <span className="pg-field__label">{t('inspect.text')}</span>
            <textarea
              className="pg-input pg-textarea"
              rows={5}
              readOnly={readOnly}
              value={node.label}
              placeholder={t('text.placeholder')}
              onChange={(event) => patch({ label: event.currentTarget.value })}
            />
          </label>
          <fieldset className="pg-field pg-segmented" disabled={readOnly}>
            <legend className="pg-field__label">{t('inspect.textSize')}</legend>
            {TEXT_SIZES.map((size) => (
              <label key={size} className={(node.textSize ?? 'm') === size ? 'is-on' : ''}>
                <input
                  type="radio"
                  name="pg-text-size"
                  checked={(node.textSize ?? 'm') === size}
                  onChange={() => patch({ textSize: size === 'm' ? undefined : size })}
                />
                {t(`text.size.${size}`)}
              </label>
            ))}
          </fieldset>
          {!readOnly && (
            <button type="button" className="pg-button pg-button--danger" onClick={remove}>
              {t('inspect.delete')}
            </button>
          )}
        </div>
      );

    return (
      <div className="pg-panel">
        <label className="pg-field">
          <span className="pg-field__label">{t('inspect.name')}</span>
          <input className="pg-input" readOnly={readOnly} value={node.label} onChange={(event) => patch({ label: event.currentTarget.value })} />
        </label>
        <label className="pg-field">
          <span className="pg-field__label">{t('inspect.caption')}</span>
          <input
            className="pg-input"
            readOnly={readOnly}
            value={node.caption ?? ''}
            placeholder={t('inspect.captionHint')}
            onChange={(event) => patch({ caption: event.currentTarget.value || undefined })}
          />
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

        <Competency
          node={node}
          requirements={design.requirements}
          patch={patch}
          t={t}
          lang={lang}
          readOnly={readOnly}
          showProbes={showProbes}
        />

        <SchemaSummary node={node} patch={patch} readOnly={readOnly} t={t} lang={lang} values={sizeValues} />

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
          <button type="button" className="pg-button pg-button--danger" onClick={remove}>
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
    const context = isContextEdge(edge);
    const upstream = upstreamEnd(edge);
    const downstream = upstream === 'source' ? 'target' : 'source';
    return (
      <div className="pg-panel">
        <p className="pg-edge-route">
          {name(edge.source)}{' '}
          <i className={`codicon codicon-${context ? 'dash' : 'arrow-right'}`} aria-hidden="true" /> {name(edge.target)}
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
          {/*
            Одна и та же линия читается двумя способами: кто кого вызывает или
            кто под чью модель подстраивается. Выбор — у связи, а не у схемы:
            на одной доске бывают и вызовы, и отношения контекстов.
          */}
          <fieldset className="pg-field pg-segmented">
            <legend className="pg-field__label">{t('inspect.notation')}</legend>
            {(['call', 'context'] as const).map((kind) => (
              <label key={kind} className={context === (kind === 'context') ? 'is-on' : ''}>
                <input
                  type="radio"
                  name="pg-edge-notation"
                  checked={context === (kind === 'context')}
                  onChange={() => patch({ notation: kind === 'context' ? 'context' : undefined })}
                />
                {t(`inspect.notation.${kind}`)}
              </label>
            ))}
          </fieldset>
          {context ? (
            <>
              <p className="pg-hint">{t('inspect.contextHint')}</p>
              {/* Паттерн — свободный текст с подсказками: на картах пишут и OHS/PL вместе, и своё. */}
              {(
                [
                  ['upstream', upstream, 'upstreamPattern', UPSTREAM_PATTERNS],
                  ['downstream', downstream, 'downstreamPattern', DOWNSTREAM_PATTERNS],
                ] as const
              ).map(([role, end, field, presets]) => (
                <label className="pg-field" key={role}>
                  <span className="pg-field__label">
                    <span className={`pg-edge-mark pg-edge-mark--${role === 'upstream' ? 'up' : 'down'} pg-edge-mark--inline`}>
                      {role === 'upstream' ? 'U' : 'D'}
                    </span>{' '}
                    {t(`inspect.${role}`)}: {name(edge[end])}
                  </span>
                  <input
                    className="pg-input"
                    list={`pg-edge-${role}`}
                    value={edge[field] ?? ''}
                    placeholder={t('inspect.pattern')}
                    onChange={(event) => patch({ [field]: event.currentTarget.value || undefined })}
                  />
                  <datalist id={`pg-edge-${role}`}>
                    {presets.map((preset) => (
                      <option key={preset} value={preset} />
                    ))}
                  </datalist>
                </label>
              ))}
            </>
          ) : (
            <fieldset className="pg-field pg-segmented">
              <legend className="pg-field__label">{t('inspect.mode')}</legend>
              {(['sync', 'async'] as const).map((mode) => (
                <label key={mode} className={edge.mode === mode ? 'is-on' : ''}>
                  <input type="radio" name="pg-edge-mode" checked={edge.mode === mode} onChange={() => patch({ mode })} />
                  {t(`inspect.${mode}`)}
                </label>
              ))}
            </fieldset>
          )}
          {!readOnly && (
            <div className="pg-actions">
              {context ? (
                // Меняются роли, а не концы линии: направление вызова, если к стрелке вернутся, останется прежним.
                <button type="button" className="pg-button" onClick={() => patch({ upstream: downstream })}>
                  <i className="codicon codicon-arrow-swap" aria-hidden="true" /> U ⇄ D
                </button>
              ) : (
                <button type="button" className="pg-button" onClick={() => patch({ source: edge.target, target: edge.source })}>
                  <i className="codicon codicon-arrow-swap" aria-hidden="true" /> {t('inspect.from')} ⇄ {t('inspect.to')}
                </button>
              )}
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

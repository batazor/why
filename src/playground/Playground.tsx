import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@vscode/codicons/dist/codicon.css';
import './playground.css';
import Canvas from './Canvas';
import Palette from './Palette';
import { CalcPanel, ChecksPanel, RequirementsPanel, TaskPanel, useFindings } from './panels';
import { InspectorPanel } from './inspector';
import { ApiPanel } from './api-panel';
import { ConductPanel, ScenarioPanel, ScorePanel, elapsed } from './scenario-panels';
import { BriefCard } from './brief';
import { RequirementsDoc } from './req-doc';
import { useIntegrity, isNotable } from './integrity';
import { useDesignHistory } from './history';
import { IntegrityPanel } from './integrity-panel';
import {
  compareToReference,
  emptyBoard,
  emptyDesign,
  emptySession,
  uid,
  type Design,
  type DesignSummary,
} from './model';
import { LocalRepository, exportFile, importFile, lastOpened, type DesignRepository } from './storage';
import { exampleDesign } from './example';
import { translator } from './i18n';
import { PERMISSIONS, ROLES, initialRole, rememberRole, type Role, type Tab } from './roles';

/**
 * Песочница системного дизайна для собеседований.
 *
 * Три роли над одним проектом: автор готовит сценарий и эталон, интервьюер
 * ведёт и оценивает, кандидат рисует. Что кому можно — в roles.ts; здесь
 * только раскладка по этим правам.
 *
 * Всё, что песочница знает о хранении, — `DesignRepository`. Сейчас это
 * браузерное хранилище; бэкенд встанет на его место через проп `repository`.
 */

interface Props {
  lang: string;
  repository?: DesignRepository;
}

type Selection = { node?: string; edge?: string };

export default function Playground({ lang, repository }: Props) {
  const repo = useMemo(() => repository ?? new LocalRepository(), [repository]);
  const t = useMemo(() => translator(lang), [lang]);

  const { design, load, update, undo, redo, forget, canUndo, canRedo } = useDesignHistory();
  const [projects, setProjects] = useState<DesignSummary[]>([]);
  const [role, setRole] = useState<Role>(initialRole);
  const [tab, setTab] = useState<Tab>(PERMISSIONS[role].tabs[0]);
  /** Интервьюер переключается между ответом кандидата и эталоном. */
  const [compareView, setCompareView] = useState<'answer' | 'reference'>('answer');
  const [selection, setSelection] = useState<Selection>({});
  const [status, setStatus] = useState<'saved' | 'saving'>('saved');
  const [canvasKey, setCanvasKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  /** Требования таблицей или списком на правку. Выбор — удобство смотрящего, живёт в браузере. */
  const [reqView, setReqView] = useState<'table' | 'edit'>(() => {
    try {
      return localStorage.getItem('why:playground:req-view') === 'table' ? 'table' : 'edit';
    } catch {
      return 'edit';
    }
  });
  const chooseReqView = (next: 'table' | 'edit') => {
    setReqView(next);
    try {
      localStorage.setItem('why:playground:req-view', next);
    } catch {
      /* не критично */
    }
  };

  const perms = PERMISSIONS[role];
  const board = role === 'interviewer' ? compareView : perms.board;
  const readOnly = !perms.editBoard;

  const refresh = useCallback(async () => setProjects(await repo.list()), [repo]);

  const open = useCallback((next: Design) => {
    load(next);
    setSelection({});
    // Новый проект — новое полотно: React Flow заново подгоняет вид под схему.
    setCanvasKey((key) => key + 1);
    lastOpened.set(next.id);
  }, [load]);

  /** Первый заход: последний открытый проект, иначе пример — пустое полотно ничего не объясняет. */
  useEffect(() => {
    (async () => {
      const list = await repo.list();
      setProjects(list);
      const id = lastOpened.get() ?? list[0]?.id;
      const found = id ? await repo.load(id) : null;
      if (found) return open(found);
      const example = exampleDesign(lang);
      await repo.save(example);
      await refresh();
      open(example);
    })();
  }, [repo, lang, open, refresh]);

  /**
   * Полотно, требования и калькулятор работают с «доской» — верхними полями
   * проекта. Когда на экране эталон, доска подменяется эталоном, и правки
   * уходят в него: панелям не нужно знать, чью доску они правят.
   */
  const view = useMemo(
    () => (design && board === 'reference' ? { ...design, ...design.scenario.reference } : design),
    [design, board],
  );
  const updateView = useCallback(
    (fn: (design: Design) => Design) => {
      if (board !== 'reference') return update(fn);
      update((current) => {
        const next = fn({ ...current, ...current.scenario.reference });
        return {
          ...next,
          nodes: current.nodes,
          edges: current.edges,
          requirements: current.requirements,
          api: current.api,
          scenario: {
            ...next.scenario,
            reference: { nodes: next.nodes, edges: next.edges, requirements: next.requirements, api: next.api },
          },
        };
      });
    },
    [board, update],
  );

  /**
   * Автосохранение с задержкой: ползунок калькулятора и перетаскивание блока
   * меняют проект десятки раз в секунду, писать на каждое изменение незачем.
   */
  const first = useRef(true);
  useEffect(() => {
    if (!design) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus('saving');
    const timer = setTimeout(async () => {
      await repo.save(design);
      await refresh();
      setStatus('saved');
    }, 400);
    return () => clearTimeout(timer);
  }, [design, repo, refresh]);

  const running = Boolean(design?.session.startedAt && !design.session.finishedAt);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const onSelect = useCallback((next: Selection) => {
    setSelection((current) => (current.node === next.node && current.edge === next.edge ? current : next));
    if (next.node || next.edge) setTab('inspect');
  }, []);

  const adder = useRef<(kind: string) => void>(() => {});
  const addRef = useCallback((add: (kind: string) => void) => {
    adder.current = add;
  }, []);

  const switchRole = (next: Role) => {
    setRole(next);
    rememberRole(next);
    setTab(PERMISSIONS[next].tabs[0]);
    setCompareView('answer');
    setSelection({});
    setCanvasKey((key) => key + 1);
    // Чужие шаги отменять нельзя: кандидат не должен откатить правки автора.
    forget();
  };

  /**
   * Ctrl+Z / ⌘Z — отмена, Ctrl+Shift+Z / Ctrl+Y — повтор. В полях ввода
   * сочетания остаются браузеру: там отменяется набранный текст, а не схема.
   */
  useEffect(() => {
    if (readOnly) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      // На русской раскладке Z — это «я»: латинская буква берётся по символу,
      // а если символ не латинский — по физической клавише. QWERTZ, где Z и Y
      // переставлены, при этом работает по символу, как человек и ждёт.
      const typed = event.key.toLowerCase();
      const key = /^[a-z]$/.test(typed) ? typed : event.code.replace(/^Key/, '').toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readOnly, undo, redo]);

  // Сигналы пишутся только пока на экране кандидат, и всегда в сам проект, а не в эталон.
  useIntegrity(role === 'candidate' && Boolean(design), update);

  const findings = useFindings(view ?? emptyDesign(''));
  const fileInput = useRef<HTMLInputElement>(null);

  if (!design || !view) return <div className="pg pg--loading" />;

  const create = async (next: Design) => {
    await repo.save(next);
    await refresh();
    open(next);
  };

  // Кандидату калькулятор и проверки — только если автор разрешил.
  const tabs = perms.tabs.filter((name) => {
    if (role === 'author') return true;
    if (name === 'calc') return design.calc.enabled;
    if (name === 'check') return role === 'interviewer' || design.scenario.allowChecks;
    return true;
  });
  const activeTab = tabs.includes(tab) ? tab : tabs[0];

  const extraFindings = role === 'interviewer' && board === 'answer' ? compareToReference(design, design.scenario.reference) : [];
  const warnings = [...extraFindings, ...findings].filter((finding) => finding.level === 'warn').length;

  const banner =
    role === 'author'
      ? t('role.authorBanner')
      : role === 'interviewer'
        ? board === 'reference'
          ? t('view.reference')
          : t('role.interviewerBanner')
        : undefined;

  const timer = elapsed(design.session, now);
  const notableSignals = design.session.signals.filter((signal) => isNotable(signal, now)).length;
  const panelProps = { design: view, update: updateView, t, lang };

  return (
    <div className={`pg pg--${role}`}>
      <div className="pg-toolbar">
        <label className="pg-role">
          <i className="codicon codicon-account" aria-hidden="true" />
          <span className="visually-hidden">{t('role.label')}</span>
          <select className="pg-input pg-select" value={role} onChange={(event) => switchRole(event.currentTarget.value as Role)}>
            {ROLES.map((name) => (
              <option key={name} value={name}>
                {t(`role.${name}`)}
              </option>
            ))}
          </select>
        </label>

        {role === 'candidate' ? (
          <>
            <strong className="pg-toolbar__title">{design.title || t('pg.untitled')}</strong>
            {/* Кандидат знает, что пишется: сбор без предупреждения — это уже слежка. */}
            <span className="pg-recording" title={t('sig.notice')}>
              <i className="codicon codicon-circle-filled" aria-hidden="true" /> {t('sig.recording')}
            </span>
          </>
        ) : (
          <label className="pg-toolbar__project">
            <span className="visually-hidden">{t('pg.projects')}</span>
            <select
              className="pg-input pg-select"
              value={design.id}
              onChange={async (event) => {
                const found = await repo.load(event.currentTarget.value);
                if (found) open(found);
              }}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.id === design.id ? design.title || t('pg.untitled') : project.title || t('pg.untitled')}
                </option>
              ))}
            </select>
          </label>
        )}

        {perms.manageProjects && (
          <>
            <button type="button" className="pg-button" onClick={() => create(emptyDesign(t('pg.untitled')))}>
              <i className="codicon codicon-add" aria-hidden="true" /> {t('pg.new')}
            </button>
            <button
              type="button"
              className="pg-button"
              onClick={() =>
                create({
                  ...structuredClone(design),
                  id: uid('d'),
                  title: `${design.title} (2)`,
                  createdAt: new Date().toISOString(),
                })
              }
            >
              <i className="codicon codicon-copy" aria-hidden="true" /> {t('pg.duplicate')}
            </button>
            <button type="button" className="pg-button" onClick={() => create(exampleDesign(lang))}>
              <i className="codicon codicon-lightbulb" aria-hidden="true" /> {t('pg.example')}
            </button>
          </>
        )}

        {perms.compare && (
          <div className="pg-switch" role="group">
            {(['answer', 'reference'] as const).map((name) => (
              <button
                key={name}
                type="button"
                className={compareView === name ? 'is-on' : ''}
                aria-pressed={compareView === name}
                onClick={() => {
                  setCompareView(name);
                  setSelection({});
                  setCanvasKey((key) => key + 1);
                }}
              >
                {t(`view.${name}`)}
              </button>
            ))}
          </div>
        )}

        <span className="pg-toolbar__spacer" />

        {(role === 'interviewer' || timer) && (
          <span className={`pg-timer ${running ? 'is-running' : ''}`}>
            <i className="codicon codicon-clock" aria-hidden="true" /> {timer || '00:00'}
          </span>
        )}

        {role === 'interviewer' && (
          <>
            <button
              type="button"
              className="pg-button"
              onClick={() =>
                update((current) => ({
                  ...current,
                  session: running
                    ? { ...current.session, finishedAt: new Date().toISOString() }
                    : { ...current.session, startedAt: new Date().toISOString(), finishedAt: undefined },
                }))
              }
            >
              <i className={`codicon codicon-${running ? 'debug-stop' : 'play'}`} aria-hidden="true" />{' '}
              {t(running ? 'session.stop' : 'session.start')}
            </button>
            <button
              type="button"
              className="pg-button pg-button--danger"
              onClick={() => {
                if (!confirm(t('session.resetConfirm'))) return;
                // Сценарий и эталон остаются: очищается только прохождение.
                update((current) => ({ ...current, ...emptyBoard(), session: emptySession() }));
                setSelection({});
                setCanvasKey((key) => key + 1);
              }}
            >
              <i className="codicon codicon-refresh" aria-hidden="true" /> {t('session.reset')}
            </button>
          </>
        )}

        {perms.manageProjects && (
          <>
            <button type="button" className="pg-button" onClick={() => exportFile(design)}>
              <i className="codicon codicon-cloud-download" aria-hidden="true" /> {t('pg.export')}
            </button>
            <button type="button" className="pg-button" onClick={() => fileInput.current?.click()}>
              <i className="codicon codicon-cloud-upload" aria-hidden="true" /> {t('pg.import')}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (!file) return;
                try {
                  // Импорт всегда новым проектом: чужой файл не должен затереть свой.
                  const imported = await importFile(file);
                  await create({ ...imported, id: uid('d') });
                } catch {
                  alert(t('pg.importFailed'));
                }
              }}
            />
            <button
              type="button"
              className="pg-button pg-button--danger"
              onClick={async () => {
                if (!confirm(t('pg.deleteConfirm', { name: design.title }))) return;
                await repo.remove(design.id);
                const list = await repo.list();
                setProjects(list);
                const next = list[0] ? await repo.load(list[0].id) : null;
                if (next) open(next);
                else create(emptyDesign(t('pg.untitled')));
              }}
            >
              <i className="codicon codicon-trash" aria-hidden="true" /> {t('pg.delete')}
            </button>
          </>
        )}

        {!readOnly && (
          <span className="pg-history">
            <button
              type="button"
              className="pg-icon-button"
              disabled={!canUndo}
              onClick={undo}
              aria-label={t('pg.undo')}
              title={t('pg.undo')}
            >
              <i className="codicon codicon-discard" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="pg-icon-button"
              disabled={!canRedo}
              onClick={redo}
              aria-label={t('pg.redo')}
              title={t('pg.redo')}
            >
              <i className="codicon codicon-redo" aria-hidden="true" />
            </button>
          </span>
        )}

        <span className="pg-status" title={t('pg.localNote')}>
          <i className={`codicon codicon-${status === 'saved' ? 'check' : 'sync'}`} aria-hidden="true" />{' '}
          {t(status === 'saved' ? 'pg.saved' : 'pg.saving')}
        </span>
      </div>

      <div className={`pg-body ${readOnly ? 'pg-body--no-palette' : ''}`}>
        {!readOnly && <Palette t={t} onAdd={(kind) => adder.current(kind)} />}

        <ReactFlowProvider key={canvasKey}>
          <Canvas
            design={view}
            update={updateView}
            onSelect={onSelect}
            t={t}
            addRef={addRef}
            readOnly={readOnly}
            banner={banner}
            overlay={<BriefCard design={design} t={t} />}
          />
        </ReactFlowProvider>

        <section className="pg-side">
          <div className="pg-tabs" role="tablist">
            {tabs.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={activeTab === name}
                className={`pg-tab ${activeTab === name ? 'is-on' : ''}`}
                onClick={() => setTab(name)}
              >
                {t(`tab.${name}`)}
                {name === 'req' && <span className="pg-count">{view.requirements.length}</span>}
                {name === 'api' && <span className="pg-count">{view.api.length}</span>}
                {name === 'check' && warnings > 0 && <span className="pg-count pg-count--warn">{warnings}</span>}
                {name === 'signals' && notableSignals > 0 && (
                  <span className="pg-count pg-count--warn">{notableSignals}</span>
                )}
              </button>
            ))}
          </div>
          <div className="pg-side__body" role="tabpanel">
            {activeTab === 'task' && <TaskPanel {...panelProps} />}
            {activeTab === 'scenario' && <ScenarioPanel design={design} update={update} t={t} />}
            {activeTab === 'conduct' && <ConductPanel design={design} update={update} t={t} />}
            {activeTab === 'score' && <ScorePanel design={design} update={update} t={t} />}
            {activeTab === 'signals' && <IntegrityPanel design={design} t={t} lang={lang} />}
            {activeTab === 'req' && (
              <>
                {/* Интервьюер только читает — ему сразу документ, без переключателя. */}
                {!readOnly && (
                  <div className="pg-switch pg-req-view" role="group">
                    {(['edit', 'table'] as const).map((name) => (
                      <button
                        key={name}
                        type="button"
                        className={reqView === name ? 'is-on' : ''}
                        aria-pressed={reqView === name}
                        onClick={() => chooseReqView(name)}
                      >
                        <i className={`codicon codicon-${name === 'edit' ? 'edit' : 'table'}`} aria-hidden="true" />{' '}
                        {t(`doc.view.${name}`)}
                      </button>
                    ))}
                  </div>
                )}
                {readOnly || reqView === 'table' ? (
                  <div className="pg-panel">
                    <RequirementsDoc design={view} t={t} draggable={!readOnly} />
                  </div>
                ) : (
                  <RequirementsPanel {...panelProps} />
                )}
              </>
            )}
            {activeTab === 'api' && <ApiPanel design={view} update={updateView} t={t} readOnly={readOnly} />}
            {activeTab === 'calc' && (
              <fieldset className="pg-plain" disabled={readOnly}>
                <CalcPanel {...panelProps} />
              </fieldset>
            )}
            {activeTab === 'inspect' && (
              <InspectorPanel
                {...panelProps}
                selection={selection}
                readOnly={readOnly}
                showProbes={role !== 'candidate'}
              />
            )}
            {activeTab === 'check' && <ChecksPanel {...panelProps} extra={extraFindings} />}
          </div>
        </section>
      </div>
    </div>
  );
}

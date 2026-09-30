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
import { TrainPanel } from './train-panel';
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
  pickBoard,
  candidateEstimates,
  uid,
  type Board,
  type Design,
  type DesignSummary,
} from './model';
import { LocalRepository, exportFile, importFile, lastOpened, type DesignRepository } from './storage';
import { exampleDesign, isUntouched } from './example';
import { ShareDialog } from './share-dialog';
import { clearPayload, decodeDesign, payloadFromUrl } from './share';
import { translator } from './i18n';
import { PERMISSIONS, ROLES, initialRole, rememberRole, type Role, type Tab } from './roles';
import { useAuth } from './live/auth';
import { useRoom } from './live/room';
import { Gate, LiveBar, RemoteCursors } from './live/live-ui';
import { useCloud } from './live/use-cloud';
import { InterviewRepository, isCloudId, openShare, paramFromUrl, setParams, type Timing } from './live/cloud';
import { InterviewsDialog } from './live/interviews-dialog';
import { TeamDialog } from './live/team-dialog';
import { CalibrationDialog } from './live/calibration-dialog';
import { formatSchedule } from './live/calendar';
import { ReportPanel } from './live/report-panel';
import { merge, signalsFrom, snapshotsFrom, type JournalEntry } from './live/journal';

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
  const local = useMemo(() => repository ?? new LocalRepository(), [repository]);
  const t = useMemo(() => translator(lang), [lang]);

  /**
   * Где работаем: в браузере, в пространстве на сервере или в собеседовании.
   * Хранилище подменяется целиком — панели песочницы разницы не замечают.
   */
  const auth = useAuth();
  const { cloud, openInterview, leave, switchWorkspace, reloadWorkspace } = useCloud(auth, local, t('ws.default'));
  const repo: DesignRepository = cloud.mode === 'workspace' || cloud.mode === 'interview' ? cloud.repo : local;
  const interview = cloud.mode === 'interview' ? cloud.repo : null;
  /** Пока не ясно, где работаем, открывать нечего: иначе мелькнёт чужой проект. */
  const settled = cloud.mode === 'local' || cloud.mode === 'workspace' || cloud.mode === 'interview';

  const { design, load, update, undo, redo, forget, canUndo, canRedo } = useDesignHistory();
  const [projects, setProjects] = useState<DesignSummary[]>([]);
  const [role, setRole] = useState<Role>(initialRole);
  const [tab, setTab] = useState<Tab>(PERMISSIONS[role].tabs[0]);
  /** Интервьюер переключается между ответом кандидата и эталоном. */
  const [compareView, setCompareView] = useState<'answer' | 'reference'>('answer');
  const [selection, setSelection] = useState<Selection>({});
  const [status, setStatus] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [canvasKey, setCanvasKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [sharing, setSharing] = useState(false);
  const [interviewsOpen, setInterviewsOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  /**
   * Журнал собеседования — у интервьюера. Из него сигналы честности (со
   * временем сервера) и снимки доски для записи; `replay` — какой снимок
   * сейчас на полотне, null — живая доска.
   */
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [replay, setReplay] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');
  /** Сообщение над полотном: например, что присланная ссылка отозвана. */
  const [notice, setNotice] = useState('');
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
  /** Собеседование закончено — доска кандидата заморожена и на сервере, и здесь. */
  const frozen = Boolean(interview && design?.session.finishedAt);
  const readOnly = !perms.editBoard || frozen;

  const refresh = useCallback(async () => setProjects(await repo.list()), [repo]);

  /**
   * Комната собеседования: интервьюер видит курсор кандидата и его доску
   * вживую, кандидат — ход собеседования. Комната — само собеседование.
   */
  const room = interview?.interviewId ?? null;
  const onTiming = useCallback(
    (next: Timing) => update((current) => ({ ...current, session: { ...current.session, ...next } })),
    [update],
  );
  const onBoard = useCallback(
    ({ designId, board: incoming }: { designId: string; board: Board }) =>
      // Доска чужого проекта сюда не относится: интервьюер открыл другой сценарий.
      update((current) => (current.id === designId ? { ...current, ...incoming } : current)),
    [update],
  );
  // Журнал и запись — про открытое собеседование; вне его их нет.
  useEffect(() => {
    if (!interview) {
      setJournal([]);
      setReplay(null);
    }
  }, [interview]);

  // Интервьюеру пространства роль автора недоступна: сценарии ему писать нельзя.
  const workspaceRole = cloud.mode === 'workspace' ? cloud.workspace.role : null;
  useEffect(() => {
    if (workspaceRole === 'interviewer' && role === 'author') {
      setRole('interviewer');
      setTab(PERMISSIONS.interviewer.tabs[0]);
    }
  }, [workspaceRole, role]);

  const onJournal = useCallback((entry: JournalEntry) => setJournal((current) => merge(current, [entry])), []);
  const live = useRoom({ room: auth.me ? room : null, me: auth.me, role, design, onBoard, onTiming, onJournal });
  const { sendCursor } = live;
  // Эталон у интервьюера — другая схема: курсор над ним кандидату ни о чём не скажет.
  useEffect(() => {
    if (board !== 'answer') sendCursor(null);
  }, [board, sendCursor]);

  /**
   * Хранилище, из которого открыт текущий проект. Когда хранилище меняется
   * (вошёл, вышел из собеседования), на экране ещё старый проект — и сохранять
   * его в новое место нельзя: собеседование стало бы сценарием пространства.
   */
  const owner = useRef<DesignRepository | null>(null);

  const open = useCallback((next: Design) => {
    owner.current = repo;
    load(next);
    setSelection({});
    // Новый проект — новое полотно: React Flow заново подгоняет вид под схему.
    setCanvasKey((key) => key + 1);
    // Собеседование открывается адресом, а не «последним проектом».
    if (!(repo instanceof InterviewRepository)) lastOpened.set(next.id);
  }, [load, repo]);

  /**
   * Первый заход: последний открытый проект, иначе пример — пустое полотно
   * ничего не объясняет.
   *
   * Пример, который не правили, заодно обновляется до текущей версии: иначе
   * сохранённый в браузере старый сценарий пережил бы любые правки песочницы,
   * и человек считал бы, что ничего не изменилось.
   */
  useEffect(() => {
    if (!settled) return;
    let alive = true;
    const show = (next: Design) => alive && open(next);
    (async () => {
      /**
       * Собеседование — один проект, и роль в нём не выбирают: кто принял
       * приглашение, тот кандидат, остальные — интервьюеры.
       */
      if (repo instanceof InterviewRepository) {
        try {
          const found = await repo.load(repo.interviewId);
          if (!alive) return;
          if (!found) return setLoadError(t('iv.notFound'));
          setLoadError('');
          setRole(repo.as);
          setTab(PERMISSIONS[repo.as].tabs[0]);
          setCompareView('answer');
          setReplay(null);
          setJournal(repo.as === 'interviewer' ? await repo.journal() : []);
          setProjects(await repo.list());
          return show(found);
        } catch (reason) {
          if (alive) setLoadError((reason as Error).message);
          return;
        }
      }

      /**
       * Присланная ссылка сильнее всего: её открыли, чтобы посмотреть именно
       * этот сценарий. Но если по нему уже есть работа, она важнее ссылки.
       *
       * Присланное — копия, и живёт она в этом браузере под своим id, даже
       * если прислали сценарий из пространства: с id оригинала копия у
       * коллеги из той же команды легла бы поверх самого сценария.
       */
      const receive = async (incoming: Design) => {
        const copy = isCloudId(incoming.id) ? { ...incoming, id: `d_${incoming.id.slice(0, 8)}` } : incoming;
        const mine = await repo.load(copy.id);
        if (!mine || isUntouched(mine)) await repo.save(copy);
        setProjects(await repo.list());
        return show(mine && !isUntouched(mine) ? mine : copy);
      };

      // Ссылка из базы: `?share=<токен>`. Роль — та, что выбрал отправивший.
      const shareToken = auth.enabled ? paramFromUrl('share') : null;
      if (shareToken) {
        setParams({ share: null });
        try {
          const opened = await openShare(shareToken);
          if (!alive) return;
          setRole(opened.role);
          rememberRole(opened.role);
          setTab(PERMISSIONS[opened.role].tabs[0]);
          return receive(opened.design);
        } catch (reason) {
          const message = (reason as Error).message;
          if (alive)
            setNotice(t(message.includes('revoked') ? 'link.revoked' : message.includes('expired') ? 'link.expired' : 'link.missing'));
        }
      }

      const payload = payloadFromUrl();
      if (payload) {
        try {
          const incoming = await decodeDesign(payload);
          clearPayload();
          return receive(incoming);
        } catch {
          // Ссылка битая или обрезанная — открываем песочницу как обычно.
          clearPayload();
        }
      }

      const fresh = exampleDesign(lang);
      const stored = await repo.load(fresh.id);
      if (!stored || isUntouched(stored)) await repo.save(fresh);

      const list = await repo.list();
      setProjects(list);
      const id = lastOpened.get() ?? list[0]?.id;
      const found = id ? await repo.load(id) : null;
      // Нетронутый проект терять нечего: если в нём не было ни одной правки
      // (например, это пример прошлой версии), открывается свежий пример.
      show(found && !isUntouched(found) ? found : fresh);
    })().catch((reason: Error) => alive && setLoadError(reason.message));
    return () => {
      alive = false;
    };
  }, [repo, settled, lang, open, t, auth.enabled]);

  /**
   * Полотно, требования и калькулятор работают с «доской» — верхними полями
   * проекта. Когда на экране эталон, доска подменяется эталоном, и правки
   * уходят в него: панелям не нужно знать, чью доску они правят.
   */
  const snapshots = useMemo(() => snapshotsFrom(journal), [journal]);
  const view = useMemo(() => {
    if (!design) return design;
    if (board === 'reference') return { ...design, ...design.scenario.reference };
    // Запись: на полотне снимок доски из журнала, а не живая доска.
    const frame = replay !== null ? snapshots[replay] : undefined;
    return frame ? { ...design, ...frame.board } : design;
  }, [design, board, replay, snapshots]);
  const updateView = useCallback(
    (fn: (design: Design) => Design) => {
      if (board !== 'reference') return update(fn);
      update((current) => {
        const next = fn({ ...current, ...current.scenario.reference });
        return {
          ...next,
          ...pickBoard(current),
          scenario: { ...next.scenario, reference: pickBoard(next) },
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
    if (!design || owner.current !== repo) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await repo.save(design);
        await refresh();
        setStatus('saved');
      } catch (reason) {
        // Сервер не принял правку: работа остаётся на экране, следующая правка попробует снова.
        console.warn('save failed:', (reason as Error).message);
        setStatus('failed');
      }
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
  // После конца собеседования писать нечего: журнал закрыт и на сервере.
  useIntegrity(role === 'candidate' && Boolean(design) && !frozen, update);

  /**
   * В собеседовании интервьюер смотрит сигналы из журнала на сервере, а не
   * из своего документа: там они с серверным временем и их нельзя стереть.
   */
  const journalSignals = useMemo(() => signalsFrom(journal), [journal]);
  const withSignals = useMemo(
    () =>
      design && interview && role === 'interviewer'
        ? { ...design, session: { ...design.session, signals: journalSignals } }
        : design,
    [design, interview, role, journalSignals],
  );

  const findings = useFindings(view ?? emptyDesign(''));
  const fileInput = useRef<HTMLInputElement>(null);

  if (cloud.mode === 'gate' || (loadError && !design))
    return (
      <Gate
        t={t}
        kind={cloud.mode === 'gate' ? cloud.kind : 'interview'}
        preview={cloud.mode === 'gate' ? cloud.preview : undefined}
        lang={lang}
        me={auth.me}
        error={cloud.mode === 'gate' ? cloud.error : loadError}
        onSignIn={auth.signIn}
        onGuest={auth.guestAllowed ? auth.signInAsGuest : undefined}
        onSignOut={auth.signOut}
        onLeave={() => {
          setLoadError('');
          leave();
        }}
      />
    );

  if (!design || !view) return <div className="pg pg--loading" />;

  /** Новый проект — туда, где сейчас работаем: в пространство, если вошли. */
  const newId = () => repo.newId?.() ?? uid('d');
  const inWorkspace = cloud.mode === 'workspace';
  /** Интервьюеру пространства сценарии писать нельзя — и выбирать роль автора незачем. */
  const canAuthor = cloud.mode !== 'workspace' || cloud.workspace.role !== 'interviewer';
  const localProjects = projects.filter((project) => !project.cloud);
  const cloudProjects = projects.filter((project) => project.cloud);

  const create = async (next: Design) => {
    try {
      await repo.save(next);
    } catch (reason) {
      console.warn('create failed:', (reason as Error).message);
      setStatus('failed');
      return;
    }
    await refresh();
    open(next);
  };

  // Кандидату калькулятор и проверки — только если автор разрешил.
  const tabs = perms.tabs.filter((name) => {
    if (role === 'author') return true;
    if (name === 'calc') return candidateEstimates(design) !== 'off';
    if (name === 'check') return role === 'interviewer' || design.scenario.allowChecks;
    // Отчёт — про собеседование на сервере: в локальной репетиции в нём нет ни журнала, ни людей.
    if (name === 'report') return Boolean(interview);
    return true;
  });
  const activeTab = tabs.includes(tab) ? tab : tabs[0];

  const extraFindings = role === 'interviewer' && board === 'answer' ? compareToReference(design, design.scenario.reference) : [];
  const warnings = [...extraFindings, ...findings].filter((finding) => finding.level === 'warn').length;

  const banner =
    role === 'author'
      ? t('role.authorBanner')
      : role === 'trainee'
        ? t('role.traineeBanner')
        : role === 'interviewer'
          ? board === 'reference'
            ? t('view.reference')
            : t('role.interviewerBanner')
          : undefined;

  const timer = elapsed(design.session, now);
  const notableSignals = (withSignals ?? design).session.signals.filter((signal) => isNotable(signal, now)).length;
  const panelProps = { design: view, update: updateView, t, lang };

  return (
    <div className={`pg pg--${role}`}>
      <div className="pg-toolbar">
        {interview ? (
          // В собеседовании роль задана приглашением, а не выбором.
          <span className="pg-role pg-role--fixed">
            <i className="codicon codicon-account" aria-hidden="true" /> {t(`role.${role}`)}
          </span>
        ) : (
          <label className="pg-role">
            <i className="codicon codicon-account" aria-hidden="true" />
            <span className="visually-hidden">{t('role.label')}</span>
            <select className="pg-input pg-select" value={role} onChange={(event) => switchRole(event.currentTarget.value as Role)}>
              {ROLES.filter((name) => name !== 'author' || canAuthor).map((name) => (
                <option key={name} value={name}>
                  {t(`role.${name}`)}
                </option>
              ))}
            </select>
          </label>
        )}

        {role === 'candidate' || interview ? (
          <>
            <strong className="pg-toolbar__title">{design.title || t('pg.untitled')}</strong>
            {/* Кандидат знает, что пишется: сбор без предупреждения — это уже слежка. */}
            {role === 'candidate' && (
              <span className="pg-recording" title={t('sig.notice')}>
                <i className="codicon codicon-circle-filled" aria-hidden="true" /> {t('sig.recording')}
              </span>
            )}
            {frozen && <span className="pg-live__alone">{t('iv.finished')}</span>}
            {/* До старта кандидат видит, на когда назначено: пришёл заранее — знает, что ждать. */}
            {interview && role === 'candidate' && !design.session.startedAt && interview.scheduledAt && (
              <span className="pg-live__alone">
                {t('when.startsAt', {
                  when: formatSchedule({ at: interview.scheduledAt, minutes: interview.durationMinutes }, lang, t),
                })}
              </span>
            )}
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
              {(cloudProjects.length
                ? [
                    [cloud.mode === 'workspace' ? cloud.workspace.name : '', cloudProjects],
                    [t('ws.browser'), localProjects],
                  ]
                : [['', localProjects]]
              ).map(([group, items]) => {
                const options = (items as DesignSummary[]).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.id === design.id ? design.title || t('pg.untitled') : project.title || t('pg.untitled')}
                  </option>
                ));
                return group ? (
                  <optgroup key={group as string} label={group as string}>
                    {options}
                  </optgroup>
                ) : (
                  options
                );
              })}
            </select>
          </label>
        )}

        {perms.manageProjects && (
          <>
            <button type="button" className="pg-button" onClick={() => create({ ...emptyDesign(t('pg.untitled')), id: newId() })}>
              <i className="codicon codicon-add" aria-hidden="true" /> {t('pg.new')}
            </button>
            <button
              type="button"
              className="pg-button"
              onClick={() =>
                create({
                  ...structuredClone(design),
                  id: newId(),
                  title: `${design.title} (2)`,
                  createdAt: new Date().toISOString(),
                })
              }
            >
              <i className="codicon codicon-copy" aria-hidden="true" /> {t('pg.duplicate')}
            </button>
            <button
              type="button"
              className="pg-button"
              // В браузере пример один и обновляется на месте; в пространстве — каждый раз новая копия.
              onClick={() => create(inWorkspace ? { ...exampleDesign(lang), id: newId() } : exampleDesign(lang))}
            >
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
            {/* Законченное собеседование не перезапускается: оценка — про доску на момент «Стопа».
                Что оно закончено, уже сказано у заголовка. */}
            {!frozen && (
              <button
                type="button"
                className="pg-button"
                onClick={() => {
                  if (running && interview && !confirm(t('iv.stopConfirm'))) return;
                  update((current) => ({
                    ...current,
                    session: running
                      ? { ...current.session, finishedAt: new Date().toISOString() }
                      : { ...current.session, startedAt: new Date().toISOString(), finishedAt: undefined },
                  }));
                }}
              >
                <i className={`codicon codicon-${running ? 'debug-stop' : 'play'}`} aria-hidden="true" />{' '}
                {t(running ? 'session.stop' : 'session.start')}
              </button>
            )}
            {!interview && (
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
            )}
          </>
        )}

        {inWorkspace && (
          <button type="button" className="pg-button" onClick={() => setTeamOpen(true)} title={t('team.hint')}>
            <i className="codicon codicon-organization" aria-hidden="true" /> {t('team.button')}
          </button>
        )}

        {(role === 'interviewer' || role === 'author') && inWorkspace && isCloudId(design.id) && (
          <button type="button" className="pg-button" onClick={() => setCalibrationOpen(true)} title={t('cal.hint')}>
            <i className="codicon codicon-graph" aria-hidden="true" /> {t('cal.button')}
          </button>
        )}

        {role === 'interviewer' && inWorkspace && isCloudId(design.id) && (
          <button type="button" className="pg-button" onClick={() => setInterviewsOpen(true)}>
            <i className="codicon codicon-broadcast" aria-hidden="true" /> {t('iv.button')}
          </button>
        )}

        {role === 'author' && inWorkspace && !isCloudId(design.id) && (
          <button
            type="button"
            className="pg-button"
            title={t('ws.copyHint')}
            // Копия, а не перенос: браузерный проект остаётся, если с сервером что-то пойдёт не так.
            onClick={() => create({ ...structuredClone(design), id: newId(), createdAt: new Date().toISOString() })}
          >
            <i className="codicon codicon-cloud-upload" aria-hidden="true" /> {t('ws.copy')}
          </button>
        )}

        {role !== 'candidate' && !interview && (
          <button type="button" className="pg-button" onClick={() => setSharing(true)}>
            <i className="codicon codicon-link" aria-hidden="true" /> {t('share.button')}
          </button>
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
                  await create({ ...imported, id: newId() });
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

        <span
          className={`pg-status ${status === 'failed' ? 'is-failed' : ''}`}
          title={t(isCloudId(design.id) ? 'pg.cloudNote' : 'pg.localNote')}
        >
          <i
            className={`codicon codicon-${status === 'saved' ? 'check' : status === 'failed' ? 'warning' : 'sync'}`}
            aria-hidden="true"
          />{' '}
          {t(
            status === 'failed'
              ? 'pg.saveFailed'
              : status === 'saving'
                ? 'pg.saving'
                : isCloudId(design.id)
                  ? 'pg.savedCloud'
                  : 'pg.saved',
          )}
        </span>

        {auth.enabled && (
          <LiveBar
            t={t}
            role={role}
            me={auth.me}
            ready={auth.ready}
            inRoom={Boolean(interview)}
            status={live.status}
            peers={live.peers}
            onSignIn={auth.signIn}
            onGuest={auth.guestAllowed ? auth.signInAsGuest : undefined}
            onSignOut={() => {
              if (confirm(t('live.signOutConfirm'))) auth.signOut();
            }}
            onLeave={
              role === 'interviewer'
                ? () => {
                    leave();
                    switchRole(initialRole());
                  }
                : undefined
            }
          />
        )}
      </div>

      {notice && (
        <p className="pg-notice" role="status">
          <i className="codicon codicon-warning" aria-hidden="true" /> {notice}
          <button type="button" className="pg-icon-button" aria-label={t('comp.close')} onClick={() => setNotice('')}>
            <i className="codicon codicon-close" aria-hidden="true" />
          </button>
        </p>
      )}

      {sharing && (
        <ShareDialog
          design={design}
          t={t}
          lang={lang}
          cloud={
            cloud.mode === 'workspace' && isCloudId(design.id)
              ? {
                  workspace: cloud.workspace,
                  onInterviews: () => {
                    setSharing(false);
                    setInterviewsOpen(true);
                  },
                }
              : undefined
          }
          onClose={() => setSharing(false)}
        />
      )}
      {teamOpen && cloud.mode === 'workspace' && auth.me && (
        <TeamDialog
          t={t}
          lang={lang}
          me={auth.me}
          workspace={cloud.workspace}
          onSwitch={(next) => {
            setTeamOpen(false);
            switchWorkspace(next);
          }}
          onChanged={reloadWorkspace}
          onClose={() => setTeamOpen(false)}
        />
      )}
      {calibrationOpen && cloud.mode === 'workspace' && (
        <CalibrationDialog
          t={t}
          lang={lang}
          scenarioId={design.id}
          title={design.title}
          onOpen={(id) => {
            setCalibrationOpen(false);
            openInterview(id);
          }}
          onClose={() => setCalibrationOpen(false)}
        />
      )}
      {interviewsOpen && cloud.mode === 'workspace' && (
        <InterviewsDialog
          t={t}
          lang={lang}
          workspace={cloud.workspace}
          scenarioId={design.id}
          title={design.title}
          onOpen={(id) => {
            setInterviewsOpen(false);
            openInterview(id);
          }}
          onClose={() => setInterviewsOpen(false)}
        />
      )}

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
            onPointer={room && board === 'answer' ? sendCursor : undefined}
            layer={room && board === 'answer' ? <RemoteCursors cursors={live.cursors} peers={live.peers} /> : undefined}
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
            {activeTab === 'signals' && <IntegrityPanel design={withSignals ?? design} t={t} lang={lang} />}
            {activeTab === 'report' && interview && (
              <ReportPanel
                design={design}
                signals={(withSignals ?? design).session.signals}
                snapshots={snapshots}
                replay={replay}
                onReplay={(next) => {
                  setReplay(next);
                  // Запись — про доску кандидата: эталон на полотне сейчас ни к чему.
                  setCompareView('answer');
                }}
                interviewId={interview.interviewId}
                candidate={interview.candidate}
                interviewer={interview.interviewer}
                createdAt={interview.createdAt}
                now={now}
                t={t}
                lang={lang}
              />
            )}
            {activeTab === 'train' && (
              <TrainPanel
                design={design}
                update={update}
                t={t}
                now={now}
                onReset={() => {
                  setSelection({});
                  setCanvasKey((key) => key + 1);
                }}
              />
            )}
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
                <CalcPanel
                  {...panelProps}
                  // Автор видит калькулятор всегда: ему по нему сверять эталон.
                  showCalc={role === 'author' || candidateEstimates(design) === 'calc'}
                  locked={role === 'candidate' && candidateEstimates(design) === 'text'}
                  snapshot={role !== 'candidate' && board === 'answer' ? design.session.estimateSnapshot : undefined}
                />
              </fieldset>
            )}
            {activeTab === 'inspect' && (
              <InspectorPanel
                {...panelProps}
                selection={selection}
                readOnly={readOnly}
                showProbes={role !== 'candidate'}
                sizeValues={role === 'author' || candidateEstimates(design) === 'calc' ? design.calc.values : undefined}
              />
            )}
            {activeTab === 'check' && <ChecksPanel {...panelProps} extra={extraFindings} />}
          </div>
        </section>
      </div>
    </div>
  );
}

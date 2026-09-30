import './playground.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './live/auth';
import { liveEnabled, supabase } from './live/client';
import { ensureWorkspace, listWorkspaces, preferredWorkspace, type Workspace } from './live/workspaces';
import { cabinet, type CalibrationRow } from './live/calibration';
import { listScenarios, type ScenarioSummary } from './live/scenarios';
import { createInterview, type Schedule } from './live/interviews';
import { interviewUrl, playgroundUrl, scenarioUrl } from './live/links';
import { InterviewItem } from './live/interviews-dialog';
import { ScheduleFields } from './live/calendar';
import { Avatar, WelcomeGate } from './live/live-ui';
import { TeamDialog } from './live/team-dialog';
import { CalibrationDialog } from './live/calibration-dialog';
import { Menu, MenuItem, MenuNote, MenuSeparator } from './menu';
import { duration, isNotable } from './integrity';
import { translator } from './i18n';

/**
 * Кабинет интервьюера — отдельная страница песочницы: все собеседования
 * пространства и всё, что с ними делают, без полотна.
 *
 * Сверху — новое собеседование: сценарий, почта, время — и сразу ссылка,
 * письмо, календарь. Ниже — что впереди (назначенные и идущие, ближайшие
 * первыми, с теми же действиями, что в списке по сценарию), что прошло
 * (кандидат, сценарий, когда и сколько, кто вёл, итог, сигналы) и сценарии
 * пространства — позвать, сравнить, открыть в песочнице.
 *
 * Открыть собеседование — значит уйти в песочницу: комната, доска и отчёт
 * живут там. Итог в кабинете один на строку, без критериев: сценарии разные,
 * а по критериям сравнимо только внутри одного — для этого есть «Сравнение».
 */
export default function Cabinet({ lang }: { lang: string }) {
  const t = useMemo(() => translator(lang), [lang]);
  const auth = useAuth();
  const me = auth.me;

  const [spaces, setSpaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [offline, setOffline] = useState('');
  /** Перечитать пространство: сменил роль, ушёл из команды, переименовал. */
  const [generation, setGeneration] = useState(0);

  const meId = me?.id;
  useEffect(() => {
    if (!meId) {
      setWorkspace(null);
      return;
    }
    let alive = true;
    setOffline('');
    ensureWorkspace(meId, t('ws.default'))
      .then(async (found) => {
        const all = await listWorkspaces(meId);
        if (!alive) return;
        setWorkspace((current) => (current && all.some((item) => item.id === current.id) ? all.find((item) => item.id === current.id)! : found));
        setSpaces(all.length ? all : [found]);
      })
      .catch((reason: Error) => alive && setOffline(reason.message));
    return () => {
      alive = false;
    };
  }, [meId, generation, t]);

  const [rows, setRows] = useState<CalibrationRow[] | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [error, setError] = useState('');
  const workspaceId = workspace?.id;
  const load = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [list, all] = await Promise.all([cabinet(workspaceId), listScenarios(workspaceId)]);
      setRows(list);
      setScenarios(all);
    } catch (reason) {
      setError((reason as Error).message);
      setRows([]);
    }
  }, [workspaceId]);

  useEffect(() => {
    setRows(null);
    setError('');
    load();
  }, [load]);

  /**
   * Живой список: изменения собеседований и оценок приходят через Realtime,
   * и список перечитывается. Перечитать целиком проще, чем сшивать строку
   * из события: строк немного, а событие несёт только свою таблицу.
   * Канал приватный, пускают в него людей пространства.
   */
  const [live, setLive] = useState(false);
  useEffect(() => {
    const client = supabase();
    if (!client || !workspaceId || !meId) return;
    let alive = true;
    let timer: number | undefined;
    // Сохранение пишет в две таблицы подряд — одно перечитывание на всплеск.
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => alive && load(), 400);
    };
    const ch = client
      .channel(`cabinet:${workspaceId}`, { config: { private: true } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interviews', filter: `workspace_id=eq.${workspaceId}` }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interview_reviews' }, bump);
    (async () => {
      await client.realtime.setAuth();
      if (!alive) return;
      ch.subscribe((state) => alive && setLive(state === 'SUBSCRIBED'));
    })();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      setLive(false);
      client.removeChannel(ch);
    };
  }, [workspaceId, meId, load]);

  // ─── Новое собеседование ──────────────────────────────────────────────────
  const [scenarioId, setScenarioId] = useState('');
  const [email, setEmail] = useState('');
  const [schedule, setSchedule] = useState<Schedule>({ at: null, minutes: 60 });
  const [busy, setBusy] = useState(false);
  /** Только что созданное — его ссылку раскрыть сразу. */
  const [shown, setShown] = useState<string | null>(null);
  const emailField = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLElement>(null);

  // Сценарий по умолчанию — самый свежий; выбранный руками не сбрасывается, пока он есть.
  useEffect(() => {
    if (scenarios.length && !scenarios.some((item) => item.id === scenarioId)) setScenarioId(scenarios[0].id);
  }, [scenarios, scenarioId]);

  const create = async () => {
    if (!workspace || !scenarioId) return;
    setBusy(true);
    setError('');
    try {
      const id = await createInterview(workspace, scenarioId, email, schedule);
      setEmail('');
      setSchedule({ at: null, minutes: 60 });
      setShown(id);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** «Позвать» у сценария: выбрать его в форме и подвести к ней. */
  const inviteTo = (id: string) => {
    setScenarioId(id);
    form.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    emailField.current?.focus();
  };

  // ─── Списки ───────────────────────────────────────────────────────────────
  const [onlyMine, setOnlyMine] = useState(false);
  const [withCancelled, setWithCancelled] = useState(false);
  const [dialog, setDialog] = useState<{ kind: 'team' } | { kind: 'compare'; scenario: ScenarioSummary } | null>(null);
  const closeDialog = useCallback(() => setDialog(null), []);

  const shownRows = useMemo(
    () =>
      (rows ?? []).filter(
        (row) => !onlyMine || row.scheduledBy.id === meId || row.reviews.some((review) => review.reviewer.id === meId),
      ),
    [rows, onlyMine, meId],
  );

  /** Впереди: идущие первыми, потом назначенные по времени, без времени — в конце. */
  const upcoming = useMemo(
    () =>
      shownRows
        .filter((row) => row.status === 'scheduled' || row.status === 'live')
        .sort((a, b) => {
          if ((a.status === 'live') !== (b.status === 'live')) return a.status === 'live' ? -1 : 1;
          const at = a.interview.scheduledAt;
          const bt = b.interview.scheduledAt;
          if (at && bt) return at.localeCompare(bt);
          if (at || bt) return at ? -1 : 1;
          return b.at.localeCompare(a.at);
        }),
    [shownRows],
  );

  /** Прошло: свежие сверху; отменённые — только по просьбе. */
  const past = useMemo(
    () =>
      shownRows
        .filter((row) => row.status === 'finished' || (withCancelled && row.status === 'cancelled'))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [shownRows, withCancelled],
  );

  const scored = past.filter((row) => row.total !== null);
  const average = scored.length ? Math.round(scored.reduce((sum, row) => sum + row.total!, 0) / scored.length) : null;
  const updatedAt = useMemo(() => new Map(scenarios.map((item) => [item.id, item.updatedAt])), [scenarios]);

  const openInterview = (id: string) => location.assign(interviewUrl(id));

  const now = Date.now();
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });
  const day = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' });
  const untitled = (title: string) => title || t('pg.untitled');

  // ─── Заставки ─────────────────────────────────────────────────────────────
  if (!liveEnabled() || offline)
    return (
      <div className="pg pg-cabinet">
        <div className="pg-gate">
          <div className="pg-gate__box">
            <i className="codicon codicon-dashboard pg-gate__icon" aria-hidden="true" />
            <h2>{t('cab.title')}</h2>
            <p>{offline ? t('cab.offline', { message: offline }) : t('cab.needServer')}</p>
            <a className="pg-button" href={playgroundUrl().toString()}>
              <i className="codicon codicon-arrow-left" aria-hidden="true" /> {t('cab.toPlayground')}
            </a>
          </div>
        </div>
      </div>
    );
  if (!auth.ready) return <div className="pg pg-cabinet pg--loading" />;
  if (!me) return <WelcomeGate t={t} onSignIn={auth.signIn} onGuest={auth.guestAllowed ? auth.signInAsGuest : undefined} />;
  if (!workspace) return <div className="pg pg-cabinet pg--loading" />;

  return (
    <div className="pg pg-cabinet">
      <header className="pg-toolbar">
        <h1 className="pg-cabinet__title">
          <i className="codicon codicon-dashboard" aria-hidden="true" /> {t('cab.title')}
        </h1>
        {spaces.length > 1 ? (
          <select
            className="pg-input pg-select"
            aria-label={t('team.workspace')}
            value={workspace.id}
            onChange={(event) => {
              const next = spaces.find((item) => item.id === event.currentTarget.value);
              if (!next) return;
              preferredWorkspace.set(next.id);
              setWorkspace(next);
            }}
          >
            {spaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="pg-hint pg-cabinet__space">{workspace.name}</span>
        )}
        {live && (
          <span className="pg-live__status is-live" title={t('cab.liveHint')}>
            <i className="codicon codicon-circle-filled" aria-hidden="true" /> {t('cab.live')}
          </span>
        )}
        <span className="pg-cabinet__spacer" />
        <a className="pg-button" href={playgroundUrl().toString()}>
          <i className="codicon codicon-arrow-left" aria-hidden="true" /> {t('cab.toPlayground')}
        </a>
        <span className="pg-live">
          <Menu label={me.name} align="right" trigger={<Avatar person={me} />}>
            <MenuNote>
              <strong>{me.name}</strong>
              <span>{workspace.name}</span>
            </MenuNote>
            <MenuItem icon="organization" onClick={() => setDialog({ kind: 'team' })}>
              {t('team.button')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon="sign-out"
              onClick={() => {
                if (confirm(t('live.signOutConfirm'))) auth.signOut();
              }}
            >
              {t('menu.signOut')}
            </MenuItem>
          </Menu>
        </span>
      </header>

      <main className="pg-cabinet__body">
        <section className="pg-cabinet__card" ref={form}>
          <h2>
            <i className="codicon codicon-add" aria-hidden="true" /> {t('cab.new')}
          </h2>
          {scenarios.length === 0 ? (
            <p className="pg-hint">
              {t('cab.noScenarios')}{' '}
              <a href={playgroundUrl().toString()}>{t('cab.toPlayground')}</a>
            </p>
          ) : (
            <form
              className="pg-cabinet__new"
              onSubmit={(event) => {
                event.preventDefault();
                create();
              }}
            >
              <label className="pg-field">
                <span className="pg-field__label">{t('cab.pickScenario')}</span>
                <select className="pg-input pg-select" value={scenarioId} onChange={(event) => setScenarioId(event.currentTarget.value)}>
                  {scenarios.map((item) => (
                    <option key={item.id} value={item.id}>
                      {untitled(item.title)}
                    </option>
                  ))}
                </select>
              </label>
              <ScheduleFields t={t} value={schedule} onChange={setSchedule} />
              <div className="pg-iv-new">
                <input
                  ref={emailField}
                  className="pg-input"
                  type="email"
                  placeholder={t('iv.email')}
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                />
                <button type="submit" className="pg-button pg-button--primary" disabled={busy || !scenarioId}>
                  <i className="codicon codicon-add" aria-hidden="true" /> {t('iv.create')}
                </button>
              </div>
              <p className="pg-hint">{t('iv.emailHint')}</p>
            </form>
          )}
        </section>

        {error && <p className="pg-note pg-note--warn">{error}</p>}

        <div className="pg-cal__bar">
          <label className="pg-toggle">
            <input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.currentTarget.checked)} />
            {t('cab.mine')}
          </label>
          <label className="pg-toggle">
            <input type="checkbox" checked={withCancelled} onChange={(event) => setWithCancelled(event.currentTarget.checked)} />
            {t('cab.cancelled')}
          </label>
          <span className="pg-hint pg-cabinet__summary">
            {t('cab.summary', {
              upcoming: String(upcoming.length),
              finished: String(past.filter((row) => row.status === 'finished').length),
              avg: average === null ? '—' : `${average}%`,
            })}
          </span>
        </div>

        <section className="pg-cabinet__card">
          <h2>
            <i className="codicon codicon-calendar" aria-hidden="true" /> {t('cab.upcoming')} <span className="pg-count">{upcoming.length}</span>
          </h2>
          {rows === null ? (
            <p className="pg-hint">{t('iv.loading')}</p>
          ) : upcoming.length ? (
            <ul className="pg-iv-list">
              {upcoming.map((row) => (
                <InterviewItem
                  key={row.id}
                  t={t}
                  lang={lang}
                  workspace={workspace}
                  item={row.interview}
                  title={untitled(row.scenarioTitle)}
                  scenarioUpdatedAt={updatedAt.get(row.scenarioId) ?? null}
                  showLink={shown === row.id}
                  subtitle={
                    <>
                      {untitled(row.scenarioTitle)} · {t('cab.by', { name: row.scheduledBy.name })}
                    </>
                  }
                  onOpen={openInterview}
                  onChanged={load}
                  onError={setError}
                />
              ))}
            </ul>
          ) : (
            <p className="pg-hint">{rows.length ? t('cab.emptyUpcoming') : t('cab.empty')}</p>
          )}
        </section>

        <section className="pg-cabinet__card">
          <h2>
            <i className="codicon codicon-history" aria-hidden="true" /> {t('cab.past')} <span className="pg-count">{past.length}</span>
          </h2>
          {rows === null ? (
            <p className="pg-hint">{t('iv.loading')}</p>
          ) : past.length ? (
            <div className="pg-cal__scroll">
              <table className="pg-cal__table pg-cabinet__table">
                <thead>
                  <tr>
                    <th>{t('report.date')}</th>
                    <th>{t('report.candidate')}</th>
                    <th>{t('cab.scenario')}</th>
                    <th>{t('report.interviewer')}</th>
                    <th>{t('score.total')}</th>
                    <th title={t('cal.signalsHint')}>{t('cal.signals')}</th>
                  </tr>
                </thead>
                <tbody>
                  {past.map((row) => {
                    const cancelled = row.status === 'cancelled';
                    const notable = row.signals.filter((signal) => isNotable(signal, now)).length;
                    return (
                      <tr
                        key={row.id}
                        className={cancelled ? 'is-static' : ''}
                        onClick={cancelled ? undefined : () => openInterview(row.id)}
                        title={cancelled ? undefined : t('cal.open')}
                      >
                        <td>
                          {date.format(new Date(row.at))}
                          {row.durationMs !== null && <span className="pg-hint"> · {duration(row.durationMs)}</span>}
                          {cancelled && <span className="pg-hint"> · {t('iv.status.cancelled')}</span>}
                        </td>
                        <td>
                          <strong>{row.candidate || t('iv.byLink')}</strong>
                        </td>
                        <td>{untitled(row.scenarioTitle)}</td>
                        <td title={row.reviews.map((review) => `${review.reviewer.name}: ${review.total ?? '—'}%`).join('\n')}>
                          {row.interviewers.map((person) => person.name).join(', ')}
                        </td>
                        <td className="pg-cal__total">
                          {row.total !== null ? `${row.total}%` : cancelled ? '—' : <span className="pg-hint">{t('cab.noScore')}</span>}
                        </td>
                        <td className={notable ? 'is-warn' : ''}>{cancelled ? '' : notable}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="pg-hint">{t('cab.emptyPast')}</p>
          )}
        </section>

        <section className="pg-cabinet__card">
          <h2>
            <i className="codicon codicon-notebook" aria-hidden="true" /> {t('cab.scenarios')} <span className="pg-count">{scenarios.length}</span>
          </h2>
          {scenarios.length ? (
            <ul className="pg-iv-list">
              {scenarios.map((item) => {
                const own = (rows ?? []).filter((row) => row.scenarioId === item.id);
                const ahead = own.filter((row) => row.status === 'scheduled' || row.status === 'live').length;
                const done = own.filter((row) => row.status === 'finished').length;
                return (
                  <li key={item.id} className="pg-iv">
                    <div className="pg-iv__row">
                      <span className="pg-iv__who">
                        <strong>{untitled(item.title)}</strong>
                        <span className="pg-hint">
                          {t('cab.updated', { date: day.format(new Date(item.updatedAt)) })} ·{' '}
                          {t('cab.stats', { upcoming: String(ahead), finished: String(done) })}
                        </span>
                      </span>
                      <button type="button" className="pg-button pg-button--small" onClick={() => inviteTo(item.id)}>
                        <i className="codicon codicon-add" aria-hidden="true" /> {t('cab.invite')}
                      </button>
                      {done > 0 && (
                        <button
                          type="button"
                          className="pg-button pg-button--small"
                          title={t('cal.hint')}
                          onClick={() => setDialog({ kind: 'compare', scenario: item })}
                        >
                          <i className="codicon codicon-graph" aria-hidden="true" /> {t('cal.button')}
                        </button>
                      )}
                      <a className="pg-button pg-button--small" href={scenarioUrl(item.id)}>
                        <i className="codicon codicon-edit" aria-hidden="true" /> {t('cab.openScenario')}
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="pg-hint">{t('cab.noScenarios')}</p>
          )}
        </section>
      </main>

      {dialog?.kind === 'team' && (
        <TeamDialog
          t={t}
          lang={lang}
          me={me}
          workspace={workspace}
          onSwitch={(next) => {
            closeDialog();
            preferredWorkspace.set(next.id);
            setWorkspace(next);
          }}
          onChanged={() => setGeneration((value) => value + 1)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'compare' && (
        <CalibrationDialog
          t={t}
          lang={lang}
          scenarioId={dialog.scenario.id}
          title={dialog.scenario.title}
          onOpen={openInterview}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

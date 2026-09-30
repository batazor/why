import type { Design, DesignSummary } from './model';
import { Menu, MenuItem, MenuSeparator } from './menu';
import type { Role } from './roles';
import type { T } from './i18n';

/**
 * Части строки инструментов песочницы.
 *
 * Строка одна, а частей в ней много и у каждой свои условия: что видит
 * кандидат, что интервьюер, что появляется только в пространстве. Каждая
 * часть получает ровно то, что ей нужно, — так в Playground остаётся
 * раскладка, а не сотни строк разметки.
 */

/** Список проектов: пространство и этот браузер — отдельными группами. */
export function ProjectPicker({
  t,
  design,
  projects,
  workspaceName,
  onPick,
}: {
  t: T;
  design: Design;
  projects: DesignSummary[];
  /** Название пространства, если вошли; без него группы не нужны. */
  workspaceName: string | null;
  onPick: (id: string) => void;
}) {
  const cloud = projects.filter((project) => project.cloud);
  const local = projects.filter((project) => !project.cloud);
  const groups: Array<[string, DesignSummary[]]> = cloud.length
    ? [
        [workspaceName ?? '', cloud],
        [t('ws.browser'), local],
      ]
    : [['', local]];
  const option = (project: DesignSummary) => (
    <option key={project.id} value={project.id}>
      {(project.id === design.id ? design.title : project.title) || t('pg.untitled')}
    </option>
  );
  return (
    <label className="pg-toolbar__project">
      <span className="visually-hidden">{t('pg.projects')}</span>
      <select className="pg-input pg-select" value={design.id} onChange={(event) => onPick(event.currentTarget.value)}>
        {groups.map(([group, items]) =>
          group ? (
            <optgroup key={group} label={group}>
              {items.map(option)}
            </optgroup>
          ) : (
            items.map(option)
          ),
        )}
      </select>
    </label>
  );
}

/**
 * Таймер и ход сессии у интервьюера: старт, стоп, сброс.
 *
 * Законченное собеседование на сервере не перезапускается — оценка про
 * доску на момент «Стопа», — поэтому после конца кнопки нет вовсе. Сброс
 * есть только в локальной репетиции: в собеседовании доска — кандидата.
 */
export function SessionControls({
  t,
  role,
  timer,
  running,
  frozen,
  inInterview,
  onToggle,
  onReset,
}: {
  t: T;
  role: Role;
  timer: string;
  running: boolean;
  frozen: boolean;
  inInterview: boolean;
  onToggle: () => void;
  onReset: () => void;
}) {
  return (
    <>
      {(role === 'interviewer' || timer) && (
        <span className={`pg-timer ${running ? 'is-running' : ''}`}>
          <i className="codicon codicon-clock" aria-hidden="true" /> {timer || '00:00'}
        </span>
      )}
      {role === 'interviewer' && !frozen && (
        <button
          type="button"
          className="pg-button"
          onClick={() => {
            if (running && inInterview && !confirm(t('iv.stopConfirm'))) return;
            onToggle();
          }}
        >
          <i className={`codicon codicon-${running ? 'debug-stop' : 'play'}`} aria-hidden="true" />{' '}
          {t(running ? 'session.stop' : 'session.start')}
        </button>
      )}
      {role === 'interviewer' && !inInterview && (
        <button
          type="button"
          className="pg-button pg-button--danger"
          onClick={() => {
            if (confirm(t('session.resetConfirm'))) onReset();
          }}
        >
          <i className="codicon codicon-refresh" aria-hidden="true" /> {t('session.reset')}
        </button>
      )}
    </>
  );
}

/**
 * Всё, что делают с проектом целиком, — одним меню: новый, копия, пример,
 * импорт и экспорт, перенос в пространство, удаление. Нужно это редко, а
 * кнопками занимало полстроки.
 */
export function ProjectMenu({
  t,
  onNew,
  onDuplicate,
  onExample,
  onImport,
  onExport,
  onCopyToWorkspace,
  onDelete,
}: {
  t: T;
  onNew: () => void;
  onDuplicate: () => void;
  onExample: () => void;
  onImport: () => void;
  onExport: () => void;
  /** Проект из браузера можно скопировать в пространство — только тогда пункт есть. */
  onCopyToWorkspace?: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu
      label={t('menu.project')}
      trigger={
        <>
          <i className="codicon codicon-folder" aria-hidden="true" /> {t('menu.project')}
          <i className="codicon codicon-chevron-down" aria-hidden="true" />
        </>
      }
    >
      <MenuItem icon="add" onClick={onNew}>
        {t('pg.new')}
      </MenuItem>
      <MenuItem icon="copy" onClick={onDuplicate}>
        {t('pg.duplicate')}
      </MenuItem>
      <MenuItem icon="lightbulb" onClick={onExample}>
        {t('pg.example')}
      </MenuItem>
      {onCopyToWorkspace && (
        <MenuItem icon="cloud-upload" onClick={onCopyToWorkspace} title={t('ws.copyHint')}>
          {t('ws.copy')}
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon="cloud-upload" onClick={onImport}>
        {t('pg.import')}
      </MenuItem>
      <MenuItem icon="cloud-download" onClick={onExport}>
        {t('pg.export')}
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon="trash" danger onClick={onDelete}>
        {t('pg.delete')}
      </MenuItem>
    </Menu>
  );
}

/** Сценарий пространства: сравнение кандидатов и собеседования по нему. */
export function WorkspaceButtons({
  t,
  role,
  onCompare,
  onInterviews,
}: {
  t: T;
  role: Role;
  onCompare: () => void;
  onInterviews: () => void;
}) {
  return (
    <>
      {(role === 'interviewer' || role === 'author') && (
        <button type="button" className="pg-button" onClick={onCompare} title={t('cal.hint')}>
          <i className="codicon codicon-graph" aria-hidden="true" /> {t('cal.button')}
        </button>
      )}
      {role === 'interviewer' && (
        <button type="button" className="pg-button pg-button--primary" onClick={onInterviews}>
          <i className="codicon codicon-broadcast" aria-hidden="true" /> {t('iv.button')}
        </button>
      )}
    </>
  );
}

export function HistoryButtons({
  t,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  t: T;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <span className="pg-history">
      <button type="button" className="pg-icon-button" disabled={!canUndo} onClick={onUndo} aria-label={t('pg.undo')} title={t('pg.undo')}>
        <i className="codicon codicon-discard" aria-hidden="true" />
      </button>
      <button type="button" className="pg-icon-button" disabled={!canRedo} onClick={onRedo} aria-label={t('pg.redo')} title={t('pg.redo')}>
        <i className="codicon codicon-redo" aria-hidden="true" />
      </button>
    </span>
  );
}

export type SaveState = 'saved' | 'saving' | 'failed';

/** Сохранено ли — и где: в браузере или на сервере. */
export function SaveStatus({ t, status, onServer }: { t: T; status: SaveState; onServer: boolean }) {
  const icon = status === 'saved' ? 'check' : status === 'failed' ? 'warning' : 'sync';
  const label =
    status === 'failed' ? 'pg.saveFailed' : status === 'saving' ? 'pg.saving' : onServer ? 'pg.savedCloud' : 'pg.saved';
  return (
    <span className={`pg-status ${status === 'failed' ? 'is-failed' : ''}`} title={t(onServer ? 'pg.cloudNote' : 'pg.localNote')}>
      <i className={`codicon codicon-${icon}`} aria-hidden="true" /> {t(label)}
    </span>
  );
}

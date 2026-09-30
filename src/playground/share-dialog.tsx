import { useEffect, useState } from 'react';
import { LINK_LIMIT, encodeDesign, shareUrl, shared, type ShareOptions } from './share';
import { exportFile } from './storage';
import { ROLES, type Role } from './roles';
import type { Design } from './model';
import type { T } from './i18n';
import { CloudShare, LinkBox } from './live/cloud-share';
import { interviewUrl, mailtoUrl } from './live/links';
import type { Workspace } from './live/workspaces';

/**
 * Поделиться: что именно уедет, зависит от того, откуда открыт проект.
 *
 * Есть база — в ссылке только адрес: id собеседования или токен записи из
 * базы. Проект целиком кодируется в адрес лишь там, где сервера нет.
 */
export type ShareSource =
  /** Сервера нет: проект едет в самой ссылке или файлом. */
  | { kind: 'link' }
  /** Сценарий из пространства: ссылки и приглашения — записями в базе. */
  | { kind: 'workspace'; workspace: Workspace; onInterviews: () => void }
  /** Проект из браузера при живом пространстве: сначала переезжает туда — там у него появится адрес. */
  | { kind: 'adopt'; workspace: Workspace; allowed: boolean; onAdopt: () => Promise<void> }
  /** Открытое собеседование: ссылка — его id, откроется коллегам по пространству. */
  | { kind: 'interview'; id: string };

export function ShareDialog({
  design,
  t,
  lang,
  source,
  onClose,
}: {
  design: Design;
  t: T;
  lang: string;
  source: ShareSource;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = t(source.kind === 'interview' ? 'share.interviewTitle' : 'share.title');

  return (
    <div className="pg-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="pg-dialog__box pg-share" onClick={(event) => event.stopPropagation()}>
        <header className="pg-dialog__head">
          <h3>{title}</h3>
          <button type="button" className="pg-icon-button" aria-label={t('comp.close')} onClick={onClose}>
            <i className="codicon codicon-close" aria-hidden="true" />
          </button>
        </header>

        {source.kind === 'workspace' && (
          <CloudShare design={design} workspace={source.workspace} t={t} lang={lang} onInterviews={source.onInterviews} />
        )}
        {source.kind === 'interview' && <InterviewShare design={design} t={t} id={source.id} />}
        {source.kind === 'adopt' && (
          <AdoptShare t={t} workspace={source.workspace} allowed={source.allowed} onAdopt={source.onAdopt} />
        )}
        {source.kind === 'link' && <LinkShare design={design} t={t} lang={lang} />}
      </div>
    </div>
  );
}

/**
 * Ссылка на собеседование — его id. Ничего из собеседования в адрес не
 * попадает: кто может его открыть, решает база, а не ссылка.
 */
function InterviewShare({ design, t, id }: { design: Design; t: T; id: string }) {
  const url = interviewUrl(id);
  const title = design.title || t('pg.untitled');
  return (
    <div className="pg-share__body">
      <p className="pg-hint">{t('report.linkHint')}</p>
      <LinkBox
        t={t}
        url={url}
        expires={t('link.forever')}
        mail={mailtoUrl('', t('link.mail.subject.interview', { title }), t('link.mail.body.interview', { title, url }))}
      />
    </div>
  );
}

/**
 * Проект из браузера при живом пространстве: делиться им ссылкой можно,
 * только когда он лежит в базе. Переезд — на кнопке, а не молча: человек
 * должен знать, что проект стал сценарием команды.
 */
function AdoptShare({
  t,
  workspace,
  allowed,
  onAdopt,
}: {
  t: T;
  workspace: Workspace;
  allowed: boolean;
  onAdopt: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const adopt = async () => {
    setBusy(true);
    setError('');
    try {
      await onAdopt();
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="pg-share__body">
      <p className="pg-note">{t('share.adopt', { workspace: workspace.name })}</p>
      {allowed ? (
        <div className="pg-actions">
          <button type="button" className="pg-button pg-button--primary" disabled={busy} onClick={adopt}>
            <i className="codicon codicon-cloud-upload" aria-hidden="true" /> {t('share.adoptButton')}
          </button>
        </div>
      ) : (
        <p className="pg-note pg-note--warn">{t('share.adoptDenied')}</p>
      )}
      {error && <p className="pg-note pg-note--warn">{error}</p>}
    </div>
  );
}

/**
 * Без сервера: роль, в которой откроется ссылка, и что в неё уедет.
 *
 * Переключатель роли меняет и умолчания вложений: кандидату эталон со
 * сценарием не отправляют, интервьюеру — наоборот, нужен целиком. Выбор
 * остаётся за человеком, но по умолчанию стоит безопасное.
 */
const DEFAULTS: Record<Role, Pick<ShareOptions, 'scenario' | 'board'>> = {
  candidate: { scenario: false, board: false },
  // Тренировке едут проверки и подсказки, но не эталон: их собирает `shared`.
  trainee: { scenario: false, board: false },
  interviewer: { scenario: true, board: true },
  author: { scenario: true, board: true },
};

function LinkShare({ design, t, lang }: { design: Design; t: T; lang: string }) {
  const [role, setRole] = useState<Role>('candidate');
  const [options, setOptions] = useState<ShareOptions>({ role: 'candidate', ...DEFAULTS.candidate });
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  // Ссылка пересобирается на каждое изменение: по её длине сразу видно,
  // пролезет ли она в мессенджер.
  useEffect(() => {
    let alive = true;
    encodeDesign(shared(design, options)).then((payload) => {
      if (alive) setLink(shareUrl(payload, options.role));
    });
    return () => {
      alive = false;
    };
  }, [design, options]);

  const pickRole = (next: Role) => {
    setRole(next);
    setOptions({ role: next, ...DEFAULTS[next] });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* буфер недоступен — ссылку можно выделить руками */
    }
  };

  const tooLong = link.length > LINK_LIMIT;
  const size = new Intl.NumberFormat(lang).format(Math.round(link.length / 102.4) / 10);
  const leaks = (role === 'candidate' || role === 'trainee') && options.scenario;

  return (
    <div className="pg-share__body">
      <div className="pg-field">
        <span className="pg-field__label">{t('share.openAs')}</span>
        <div className="pg-switch">
          {ROLES.map((name) => (
            <button
              key={name}
              type="button"
              className={role === name ? 'is-on' : ''}
              aria-pressed={role === name}
              onClick={() => pickRole(name)}
            >
              {t(`role.${name}`)}
            </button>
          ))}
        </div>
        <p className="pg-hint">{t(`share.role.${role}`)}</p>
      </div>

      <div className="pg-field">
        <span className="pg-field__label">{t('share.include')}</span>
        <label className="pg-toggle pg-toggle--block">
          <input
            type="checkbox"
            checked={options.scenario}
            onChange={(event) => setOptions({ ...options, scenario: event.currentTarget.checked })}
          />
          {t('share.scenario')}
        </label>
        <label className="pg-toggle pg-toggle--block">
          <input
            type="checkbox"
            checked={options.board}
            onChange={(event) => setOptions({ ...options, board: event.currentTarget.checked })}
          />
          {t('share.board')}
        </label>
        {leaks && <p className="pg-note pg-note--warn">{t('share.leak')}</p>}
      </div>

      <label className="pg-field">
        <span className="pg-field__label">
          {t('share.link')} <span className="pg-count">{size} KB</span>
        </span>
        <textarea className="pg-input pg-textarea pg-share__link" rows={3} readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
      </label>
      <p className="pg-hint">{t(tooLong ? 'share.tooLong' : 'share.fits')}</p>

      <div className="pg-actions">
        <button type="button" className="pg-button" disabled={!link} onClick={copy}>
          <i className={`codicon codicon-${copied ? 'check' : 'link'}`} aria-hidden="true" />{' '}
          {t(copied ? 'share.copied' : 'share.copy')}
        </button>
        <button type="button" className="pg-button" onClick={() => exportFile(shared(design, options))}>
          <i className="codicon codicon-cloud-download" aria-hidden="true" /> {t('share.file')}
        </button>
      </div>
      <p className="pg-hint">{t('share.note')}</p>
    </div>
  );
}

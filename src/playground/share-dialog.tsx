import { useCallback, useEffect, useState } from 'react';
import { LINK_LIMIT, encodeDesign, shareUrl, shared, type ShareOptions } from './share';
import { exportFile } from './storage';
import { ROLES, type Role } from './roles';
import type { Design } from './model';
import type { T } from './i18n';
import { CloudShare, LinkBox, mailBody } from './live/cloud-share';
import { interviewUrl, inviteUrl, mailtoUrl, tourUrl } from './live/links';
import { createInterview, listInterviews, type Interview } from './live/interviews';
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
  /**
   * Открытое собеседование: кандидату — приглашение, коллегам — id собеседования.
   * Сценарий и пространство — чтобы позвать следующего кандидата отсюда же.
   */
  | { kind: 'interview'; id: string; scenarioId: string; workspace: { id: string; name: string } | null };

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
        {source.kind === 'interview' && <InterviewShare design={design} t={t} lang={lang} source={source} />}
        {source.kind === 'adopt' && (
          <AdoptShare t={t} workspace={source.workspace} allowed={source.allowed} onAdopt={source.onAdopt} />
        )}
        {source.kind === 'link' && <LinkShare design={design} t={t} lang={lang} />}
      </div>
    </div>
  );
}

/**
 * Собеседование: кандидату — приглашение, коллегам — само собеседование.
 *
 * Это разные ссылки, и путать их нельзя. Ссылку на собеседование кандидат не
 * откроет: база пускает в него только того, кто принял приглашение. А
 * приглашение срабатывает один раз — принятое или закончившееся собеседование
 * новому кандидату не отдать, ему нужно новое по тому же сценарию. Его можно
 * завести прямо здесь, не уходя в кабинет.
 *
 * Приглашение перечитывается с сервера при открытии окна: кандидат мог принять
 * его уже после того, как собеседование открылось.
 */
function InterviewShare({
  design,
  t,
  lang,
  source,
}: {
  design: Design;
  t: T;
  lang: string;
  source: Extract<ShareSource, { kind: 'interview' }>;
}) {
  const [items, setItems] = useState<Interview[] | null>(null);
  /** Новое собеседование, заведённое из этого окна, — его приглашение и показываем. */
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await listInterviews(source.scenarioId));
    } catch (reason) {
      setError((reason as Error).message);
      setItems([]);
    }
  }, [source.scenarioId]);
  useEffect(() => {
    load();
  }, [load]);

  const title = design.title || t('pg.untitled');
  const workspaceName = source.workspace?.name ?? '';
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });
  const current = items?.find((item) => item.id === source.id);
  const usable = (item: Interview) =>
    !item.candidate &&
    (item.status === 'scheduled' || item.status === 'live') &&
    !(item.inviteExpiresAt && Date.parse(item.inviteExpiresAt) <= Date.now());
  const invitation = items?.find((item) => item.id === created) ?? (current && usable(current) ? current : undefined);

  /** Почему приглашения этого собеседования кандидату уже не отправить. */
  const why = !current
    ? 'share.iv.dead'
    : current.status === 'finished'
      ? 'share.iv.finished'
      : current.candidate
        ? 'share.iv.taken'
        : 'share.iv.dead';

  const next = async () => {
    if (!source.workspace) return;
    setBusy(true);
    setError('');
    try {
      setCreated(await createInterview(source.workspace, source.scenarioId, ''));
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const invite = invitation ? inviteUrl(invitation.inviteToken) : '';
  const colleagues = interviewUrl(source.id);

  return (
    <div className="pg-share__body">
      <div className="pg-field">
        <span className="pg-field__label">{t('share.iv.candidate')}</span>
        {items === null ? (
          <p className="pg-hint">{t('iv.loading')}</p>
        ) : invitation ? (
          <>
            {created && <p className="pg-note">{t('share.iv.created')}</p>}
            <LinkBox
              t={t}
              url={invite}
              expires={
                invitation.inviteExpiresAt
                  ? t('link.until', { date: date.format(new Date(invitation.inviteExpiresAt)) })
                  : t('link.forever')
              }
              mail={mailtoUrl(
                invitation.candidateEmail ?? '',
                t('link.mail.subject.candidate', { title, workspace: workspaceName }),
                mailBody(t, 'candidate', title, workspaceName, invite, ''),
              )}
            />
            <p className="pg-hint">{t('share.iv.once')}</p>
          </>
        ) : (
          <>
            <p className="pg-note">{t(why, { name: current?.candidate?.name ?? '' })}</p>
            {source.workspace && (
              <div className="pg-actions">
                <button type="button" className="pg-button pg-button--primary" disabled={busy} onClick={next}>
                  <i className="codicon codicon-add" aria-hidden="true" /> {t('share.iv.next')}
                </button>
              </div>
            )}
          </>
        )}
        {error && <p className="pg-note pg-note--warn">{error}</p>}
      </div>

      {/* Тур — до собеседования: чтобы на нём кандидат думал о задаче, а не искал кнопки. */}
      <div className="pg-field">
        <span className="pg-field__label">{t('tour.link')}</span>
        <p className="pg-hint">{t('tour.linkHint')}</p>
        <LinkBox t={t} url={tourUrl()} expires={t('link.forever')} mail={mailtoUrl('', t('tour.link'), tourUrl())} />
      </div>

      <div className="pg-field">
        <span className="pg-field__label">{t('share.iv.colleagues')}</span>
        <p className="pg-hint">{t('report.linkHint')}</p>
        <LinkBox
          t={t}
          url={colleagues}
          expires={t('link.forever')}
          mail={mailtoUrl('', t('link.mail.subject.interview', { title }), t('link.mail.body.interview', { title, url: colleagues }))}
        />
        <p className="pg-note pg-note--warn">{t('share.iv.notCandidate')}</p>
      </div>
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

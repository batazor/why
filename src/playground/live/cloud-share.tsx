import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CalendarButtons, ScheduleFields, formatSchedule } from './calendar';
import { shared } from '../share';
import type { Design } from '../model';
import type { T } from '../i18n';
import {
  createInterview,
  createShare,
  createTeamInvite,
  inviteUrl,
  listInterviews,
  listShares,
  listTeamInvites,
  mailtoUrl,
  revokeShare,
  type Schedule,
  type ShareLink,
  type Workspace,
  type WorkspaceRole,
} from './cloud';

/**
 * «Поделиться» для сценария из пространства: кому и зачем, а не «что
 * положить в ссылку».
 *
 * - кандидату — живое собеседование: приглашение, вход, доска у интервьюера
 *   на глазах;
 * - на тренировку — ссылка из базы: задание, проверки, подсказки, без
 *   эталона; открывается без входа;
 * - коллеге — в команду, с ролью: сценарий общий, а не копия;
 * - копией — ссылка из базы с эталоном, другому автору.
 *
 * Любая ссылка отсюда — запись в базе: у неё есть срок, её можно отозвать, и
 * видно, открывали ли её. Внизу — все живые ссылки на этот сценарий.
 */

type Target = 'candidate' | 'trainee' | 'colleague' | 'copy';
const TARGETS: Target[] = ['candidate', 'trainee', 'colleague', 'copy'];

/** Сроки ссылок из базы; null — бессрочно. */
const LIFETIMES: Array<number | null> = [1, 7, 30, null];

interface Issued {
  url: string;
  expiresAt: string | null;
  email: string;
  schedule: Schedule;
}

export function CloudShare({
  design,
  workspace,
  t,
  lang,
  onInterviews,
  onLegacy,
}: {
  design: Design;
  workspace: Workspace;
  t: T;
  lang: string;
  /** Открыть список собеседований по сценарию. */
  onInterviews: () => void;
  /** Старый способ: проект в самой ссылке или файлом. */
  onLegacy: () => void;
}) {
  const [target, setTarget] = useState<Target>('candidate');
  const [email, setEmail] = useState('');
  const [days, setDays] = useState<number | null>(7);
  const [role, setRole] = useState<WorkspaceRole>('interviewer');
  const [schedule, setSchedule] = useState<Schedule>({ at: null, minutes: 60 });
  const [issued, setIssued] = useState<Issued | null>(null);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const owner = workspace.role === 'owner';

  const refresh = useCallback(async () => {
    try {
      setLinks(await listShares(design.id));
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, [design.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pick = (next: Target) => {
    setTarget(next);
    setIssued(null);
    setError('');
  };

  /** Выпустить ссылку для выбранного адресата. */
  const issue = async () => {
    setBusy(true);
    setError('');
    try {
      if (target === 'candidate') {
        const id = await createInterview(workspace, design.id, email, schedule);
        const created = (await listInterviews(design.id)).find((item) => item.id === id);
        if (created) setIssued({ url: inviteUrl(created.inviteToken), expiresAt: created.inviteExpiresAt, email, schedule });
      } else if (target === 'colleague') {
        const id = await createTeamInvite(workspace.id, role, email);
        const created = (await listTeamInvites(workspace.id)).find((item) => item.id === id);
        if (created) setIssued({ url: inviteUrl(created.token, 'join'), expiresAt: created.expiresAt, email, schedule: { at: null, minutes: 60 } });
      } else {
        const shareRole = target === 'copy' ? 'author' : 'trainee';
        // Что уедет, решает shared(): тренировке — без эталона, копии — целиком.
        const payload = shared(design, { role: shareRole, scenario: target === 'copy', board: target === 'copy' });
        const link = await createShare(workspace, design.id, shareRole, payload, days);
        setIssued({ url: inviteUrl(link.token, 'share'), expiresAt: link.expiresAt, email, schedule: { at: null, minutes: 60 } });
        await refresh();
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' });
  const until = (at: string | null) => (at ? t('link.until', { date: date.format(new Date(at)) }) : t('link.forever'));
  const alive = links.filter((link) => !link.revokedAt && (!link.expiresAt || Date.parse(link.expiresAt) > Date.now()));
  const needsEmail = target === 'candidate' || target === 'colleague';
  const needsDays = target === 'trainee' || target === 'copy';

  return (
    <div className="pg-share__body">
      <div className="pg-field">
        <span className="pg-field__label">{t('link.to')}</span>
        <div className="pg-switch pg-switch--wrap">
          {TARGETS.map((name) => (
            <button
              key={name}
              type="button"
              className={target === name ? 'is-on' : ''}
              aria-pressed={target === name}
              onClick={() => pick(name)}
            >
              {t(`link.target.${name}`)}
            </button>
          ))}
        </div>
        <p className="pg-hint">{t(`link.about.${target}`)}</p>
        {target === 'copy' && <p className="pg-note pg-note--warn">{t('link.copyWarn')}</p>}
      </div>

      {target === 'colleague' && !owner ? (
        <p className="pg-note">{t('link.ownerOnly')}</p>
      ) : (
        <form
          className="pg-field"
          onSubmit={(event) => {
            event.preventDefault();
            issue();
          }}
        >
          {target === 'candidate' && <ScheduleFields t={t} value={schedule} onChange={setSchedule} />}
          <div className="pg-iv-new">
            {target === 'colleague' && (
              <select
                className="pg-input pg-select"
                value={role}
                aria-label={t('team.inviteRole')}
                onChange={(event) => setRole(event.currentTarget.value as WorkspaceRole)}
              >
                {(['owner', 'author', 'interviewer'] as const).map((item) => (
                  <option key={item} value={item}>
                    {t(`team.role.${item}`)}
                  </option>
                ))}
              </select>
            )}
            {needsEmail && (
              <input
                className="pg-input"
                type="email"
                placeholder={t(target === 'candidate' ? 'iv.email' : 'team.email')}
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            )}
            {needsDays && (
              <select
                className="pg-input pg-select"
                value={days ?? ''}
                aria-label={t('link.lifetime')}
                onChange={(event) => setDays(event.currentTarget.value ? Number(event.currentTarget.value) : null)}
              >
                {LIFETIMES.map((value) => (
                  <option key={value ?? 'never'} value={value ?? ''}>
                    {value ? t('link.days', { n: String(value) }) : t('link.forever')}
                  </option>
                ))}
              </select>
            )}
            <button type="submit" className="pg-button pg-button--primary" disabled={busy}>
              <i className="codicon codicon-link" aria-hidden="true" /> {t('link.create')}
            </button>
          </div>
          {target === 'candidate' && (
            <button type="button" className="pg-link-button" onClick={onInterviews}>
              {t('link.allInterviews')}
            </button>
          )}
        </form>
      )}

      {error && <p className="pg-note pg-note--warn">{error}</p>}

      {issued && (
        <LinkBox
          t={t}
          url={issued.url}
          expires={until(issued.expiresAt)}
          mail={mailtoUrl(
            issued.email,
            t(`link.mail.subject.${target}`, { title: design.title, workspace: workspace.name }),
            mailBody(t, target, design.title, workspace.name, issued.url, formatSchedule(issued.schedule, lang, t)),
          )}
          extra={
            issued.schedule.at && (
              <CalendarButtons
                t={t}
                event={{
                  title: t('when.eventTitle', { title: design.title }),
                  details: t('when.eventDetails'),
                  url: issued.url,
                  start: issued.schedule.at,
                  minutes: issued.schedule.minutes,
                  guest: issued.email.trim() || undefined,
                }}
              />
            )
          }
        />
      )}

      <div className="pg-field">
        <span className="pg-field__label">
          {t('link.active')} <span className="pg-count">{alive.length}</span>
        </span>
        {alive.length ? (
          <ul className="pg-iv-list">
            {alive.map((link) => (
              <li key={link.id} className="pg-iv">
                <div className="pg-iv__row">
                  <span className="pg-iv__who">
                    <strong>{t(`link.role.${link.role}`)}</strong>
                    <span className="pg-hint">
                      {date.format(new Date(link.createdAt))} · {until(link.expiresAt)} ·{' '}
                      {t('link.opens', { n: String(link.opens) })}
                    </span>
                  </span>
                  <CopyButton t={t} text={inviteUrl(link.token, 'share')} />
                  <button
                    type="button"
                    className="pg-icon-button"
                    title={t('link.revoke')}
                    aria-label={t('link.revoke')}
                    onClick={async () => {
                      if (!confirm(t('link.revokeConfirm'))) return;
                      try {
                        await revokeShare(link.id);
                      } catch (reason) {
                        setError((reason as Error).message);
                      }
                      await refresh();
                    }}
                  >
                    <i className="codicon codicon-close" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pg-hint">{t('link.none')}</p>
        )}
        <p className="pg-hint">{t('link.invitesElsewhere')}</p>
      </div>

      <button type="button" className="pg-link-button" onClick={onLegacy}>
        {t('link.legacy')}
      </button>
    </div>
  );
}

/** Текст письма; если время назначено — с ним. */
export function mailBody(t: T, target: string, title: string, workspace: string, url: string, when: string): string {
  const body = t(`link.mail.body.${target}`, { title, workspace, url });
  return when ? `${body}\n\n${t('link.mail.when', { when })}` : body;
}

/** Выпущенная ссылка: поле, копировать, письмом, срок; `extra` — например, календарь. */
export function LinkBox({
  t,
  url,
  expires,
  mail,
  extra,
}: {
  t: T;
  url: string;
  expires: string;
  mail: string;
  extra?: ReactNode;
}) {
  return (
    <div className="pg-linkbox">
      <input className="pg-input" readOnly value={url} aria-label={t('iv.link')} onFocus={(event) => event.currentTarget.select()} />
      <div className="pg-actions">
        <CopyButton t={t} text={url} primary />
        <a className="pg-button" href={mail}>
          <i className="codicon codicon-mail" aria-hidden="true" /> {t('link.mail')}
        </a>
        {extra}
        <span className="pg-hint">{expires}</span>
      </div>
    </div>
  );
}

function CopyButton({ t, text, primary = false }: { t: T; text: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`pg-button ${primary ? '' : 'pg-button--small'}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* буфер недоступен — ссылка видна полем */
        }
      }}
    >
      <i className={`codicon codicon-${copied ? 'check' : 'copy'}`} aria-hidden="true" /> {t(copied ? 'share.copied' : 'share.copy')}
    </button>
  );
}

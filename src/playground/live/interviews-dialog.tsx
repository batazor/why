import { useCallback, useEffect, useState } from 'react';
import { cancelInterview, createInterview, inviteUrl, listInterviews, type Interview, type Workspace } from './cloud';
import type { T } from '../i18n';

/**
 * Собеседования по сценарию: кого позвали, кто уже принял, что закончено.
 *
 * Приглашение — ссылка с секретом. Почта необязательна: без неё ссылку
 * примет первый вошедший, с ней — только владелец этой почты. Второй раз
 * принять ссылку нельзя, так что переслать её дальше кандидат не сможет.
 */
export function InterviewsDialog({
  t,
  lang,
  workspace,
  scenarioId,
  onOpen,
  onClose,
}: {
  t: T;
  lang: string;
  workspace: Workspace;
  scenarioId: string;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Interview[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await listInterviews(scenarioId));
    } catch (reason) {
      setError((reason as Error).message);
      setItems([]);
    }
  }, [scenarioId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      await createInterview(workspace, scenarioId, email);
      setEmail('');
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (item: Interview) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(item.inviteToken));
      setCopied(item.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* буфер недоступен */
    }
  };

  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="pg-dialog" role="dialog" aria-modal="true" aria-label={t('iv.title')} onClick={onClose}>
      <div className="pg-dialog__box pg-share" onClick={(event) => event.stopPropagation()}>
        <header className="pg-dialog__head">
          <h3>{t('iv.title')}</h3>
          <button type="button" className="pg-icon-button" aria-label={t('comp.close')} onClick={onClose}>
            <i className="codicon codicon-close" aria-hidden="true" />
          </button>
        </header>

        <div className="pg-share__body">
          <form
            className="pg-field"
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            <span className="pg-field__label">{t('iv.new')}</span>
            <div className="pg-iv-new">
              <input
                className="pg-input"
                type="email"
                placeholder={t('iv.email')}
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
              <button type="submit" className="pg-button" disabled={busy}>
                <i className="codicon codicon-add" aria-hidden="true" /> {t('iv.create')}
              </button>
            </div>
            <p className="pg-hint">{t('iv.emailHint')}</p>
          </form>

          {error && <p className="pg-note pg-note--warn">{error}</p>}

          {items === null ? (
            <p className="pg-hint">{t('iv.loading')}</p>
          ) : items.length === 0 ? (
            <p className="pg-hint">{t('iv.empty')}</p>
          ) : (
            <ul className="pg-iv-list">
              {items.map((item) => {
                const open = item.status === 'scheduled' || item.status === 'live';
                return (
                  <li key={item.id} className={`pg-iv is-${item.status}`}>
                    <span className="pg-iv__who">
                      <strong>{item.candidate?.name ?? item.candidateEmail ?? t('iv.byLink')}</strong>
                      <span className="pg-hint">
                        {t(`iv.status.${item.status}`)} · {date.format(new Date(item.createdAt))}
                        {!item.candidate && open ? ` · ${t('iv.notAccepted')}` : ''}
                      </span>
                    </span>
                    {!item.candidate && open && (
                      <button type="button" className="pg-button pg-button--small" onClick={() => copy(item)}>
                        <i className={`codicon codicon-${copied === item.id ? 'check' : 'link'}`} aria-hidden="true" />{' '}
                        {t(copied === item.id ? 'share.copied' : 'iv.copy')}
                      </button>
                    )}
                    {item.status !== 'cancelled' && (
                      <button type="button" className="pg-button pg-button--small" onClick={() => onOpen(item.id)}>
                        <i className="codicon codicon-play" aria-hidden="true" /> {t('iv.open')}
                      </button>
                    )}
                    {open && (
                      <button
                        type="button"
                        className="pg-icon-button"
                        title={t('iv.cancel')}
                        aria-label={t('iv.cancel')}
                        onClick={async () => {
                          if (!confirm(t('iv.cancelConfirm'))) return;
                          try {
                            await cancelInterview(item.id);
                            await refresh();
                          } catch (reason) {
                            setError((reason as Error).message);
                          }
                        }}
                      >
                        <i className="codicon codicon-close" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { LINK_LIMIT, encodeDesign, shareUrl, shared, type ShareOptions } from './share';
import { exportFile } from './storage';
import { ROLES, type Role } from './roles';
import type { Design } from './model';
import type { T } from './i18n';

/**
 * Поделиться сценарием: роль, в которой откроется ссылка, и что в неё уедет.
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

export function ShareDialog({ design, t, lang, onClose }: { design: Design; t: T; lang: string; onClose: () => void }) {
  const [role, setRole] = useState<Role>('candidate');
  const [options, setOptions] = useState<ShareOptions>({ role: 'candidate', ...DEFAULTS.candidate });
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    <div className="pg-dialog" role="dialog" aria-modal="true" aria-label={t('share.title')} onClick={onClose}>
      <div className="pg-dialog__box pg-share" onClick={(event) => event.stopPropagation()}>
        <header className="pg-dialog__head">
          <h3>{t('share.title')}</h3>
          <button type="button" className="pg-icon-button" aria-label={t('comp.close')} onClick={onClose}>
            <i className="codicon codicon-close" aria-hidden="true" />
          </button>
        </header>

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
      </div>
    </div>
  );
}

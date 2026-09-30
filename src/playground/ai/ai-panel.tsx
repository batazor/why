import { useEffect, useRef, useState } from 'react';
import type { Mode, Turn } from './interviewer';
import { explainAiError } from './errors';
import { CLAUDE_MODELS, DEFAULT_SETTINGS, forgetSettings, loadSettings, modelOf, ready, saveSettings, type AiSettings } from './settings';
import { AiSettingsForm } from './settings-form';
import type { Design } from '../model';
import type { T } from '../i18n';

/**
 * ИИ-интервьюер в тренировке: разговор о доске человека.
 *
 * Три действия: ответить на вопрос, попросить следующий вопрос по доске и
 * попросить разбор. Модель каждый раз видит доску заново, поэтому можно
 * рисовать и спрашивать вперемешку. Разговор лежит в сессии проекта: после
 * перезагрузки он на месте, а отмена правок доски его не трогает.
 */
export function AiPanel({
  design,
  update,
  t,
  lang,
}: {
  design: Design;
  update: (fn: (design: Design) => Design) => void;
  t: T;
  lang: string;
}) {
  const [settings, setSettings] = useState<AiSettings>(loadSettings);
  const [editing, setEditing] = useState(() => !ready(loadSettings()));
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const chat = design.session.aiChat ?? [];

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [chat.length, streaming]);

  // Ушёл с вкладки посреди ответа — ответ дописывать некому.
  useEffect(() => () => abort.current?.abort(), []);

  const setChat = (next: Turn[]) =>
    update((current) => ({ ...current, session: { ...current.session, aiChat: next } }));

  const run = async (mode: Mode, text = '') => {
    if (streaming !== null) return;
    const mine: Turn =
      mode === 'reply' ? { role: 'candidate', text } : { role: 'candidate', text: '', kind: mode === 'ask' ? 'ask' : 'review' };
    const history = chat;
    setChat([...history, mine]);
    setDraft('');
    setError('');
    setStreaming('');
    const controller = new AbortController();
    abort.current = controller;
    let collected = '';
    try {
      // AI SDK и провайдеры — только когда спросили: остальной песочнице они не нужны.
      const { interviewerTurn } = await import('./interviewer');
      const answer = await interviewerTurn({
        settings,
        design,
        lang,
        history,
        mode,
        text,
        signal: controller.signal,
        onText: (chunk) => {
          collected += chunk;
          setStreaming(collected);
        },
      });
      setChat([...history, mine, { role: 'interviewer', text: answer.trim() || t('ai.empty') }]);
    } catch (reason) {
      if ((reason as Error).name === 'AbortError') {
        // Остановил сам: что успело прийти — остаётся репликой.
        if (collected.trim()) setChat([...history, mine, { role: 'interviewer', text: collected.trim() }]);
      } else {
        setChat(history);
        setDraft(text);
        setError(explainAiError(reason, t));
      }
    } finally {
      abort.current = null;
      setStreaming(null);
    }
  };

  if (editing || !ready(settings))
    return (
      <AiSettingsForm
        t={t}
        value={settings}
        onSave={(next) => {
          saveSettings(next);
          setSettings(next);
          setEditing(false);
        }}
        onForget={() => {
          forgetSettings();
          setSettings(DEFAULT_SETTINGS);
        }}
        onCancel={ready(settings) ? () => setEditing(false) : undefined}
      />
    );

  const busy = streaming !== null;
  const model = CLAUDE_MODELS.find((item) => item.id === modelOf(settings))?.label ?? modelOf(settings);

  return (
    <div className="pg-panel pg-ai">
      <div className="pg-ai__bar">
        <span className="pg-hint">
          <i className="codicon codicon-sparkle" aria-hidden="true" /> {model}
        </span>
        <span className="pg-toolbar__spacer" />
        {chat.length > 0 && (
          <button
            type="button"
            className="pg-icon-button"
            title={t('ai.reset')}
            aria-label={t('ai.reset')}
            disabled={busy}
            onClick={() => confirm(t('ai.resetConfirm')) && setChat([])}
          >
            <i className="codicon codicon-trash" aria-hidden="true" />
          </button>
        )}
        <button type="button" className="pg-icon-button" title={t('ai.settings')} aria-label={t('ai.settings')} onClick={() => setEditing(true)}>
          <i className="codicon codicon-settings-gear" aria-hidden="true" />
        </button>
      </div>

      <div className="pg-ai__log">
        {!chat.length && <p className="pg-hint">{t('ai.intro')}</p>}
        {chat.map((turn, index) =>
          turn.kind ? (
            <p key={index} className="pg-ai__action">
              {t(turn.kind === 'ask' ? 'ai.askedQuestion' : 'ai.askedReview')}
            </p>
          ) : (
            <div key={index} className={`pg-ai__turn is-${turn.role}`}>
              {turn.text}
            </div>
          ),
        )}
        {streaming !== null && (
          <div className="pg-ai__turn is-interviewer is-streaming">{streaming || t('ai.thinking')}</div>
        )}
        <div ref={bottom} />
      </div>

      {error && <p className="pg-note pg-note--warn">{error}</p>}

      <form
        className="pg-ai__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) run('reply', draft.trim());
        }}
      >
        <textarea
          className="pg-input pg-textarea"
          rows={3}
          placeholder={t('ai.placeholder')}
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Enter — отправить, Shift+Enter — новая строка: как в любом чате.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (draft.trim()) run('reply', draft.trim());
            }
          }}
        />
        <div className="pg-actions">
          {busy ? (
            <button type="button" className="pg-button" onClick={() => abort.current?.abort()}>
              <i className="codicon codicon-debug-stop" aria-hidden="true" /> {t('ai.stop')}
            </button>
          ) : (
            <>
              <button type="submit" className="pg-button pg-button--primary" disabled={!draft.trim()}>
                <i className="codicon codicon-send" aria-hidden="true" /> {t('ai.send')}
              </button>
              <button type="button" className="pg-button" onClick={() => run('ask')}>
                <i className="codicon codicon-comment-discussion" aria-hidden="true" /> {t('ai.ask')}
              </button>
              <button type="button" className="pg-button" onClick={() => run('review')} disabled={!chat.length}>
                <i className="codicon codicon-checklist" aria-hidden="true" /> {t('ai.review')}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}


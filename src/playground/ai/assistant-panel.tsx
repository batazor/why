import { useEffect, useRef, useState } from 'react';
import { explainAiError } from './errors';
import { AiSettingsForm } from './settings-form';
import { CLAUDE_MODELS, DEFAULT_SETTINGS, forgetSettings, loadSettings, modelOf, ready, saveSettings, type AiSettings } from './settings';
import type { ScoreDraft } from './assistant';
import type { Design } from '../model';
import type { T } from '../i18n';

/**
 * Вкладка «ИИ-помощник» у интервьюера.
 *
 * Помощник ничего не решает сам: вопросы — подсказка, что спросить; баллы и
 * заметки — черновик, который интервьюер принимает целиком, по одному
 * критерию или не принимает вовсе. Свою оценку ставит человек.
 */
export function AssistantPanel({
  design,
  update,
  t,
  lang,
  now,
}: {
  design: Design;
  update: (fn: (design: Design) => Design) => void;
  t: T;
  lang: string;
  now: number;
}) {
  const [settings, setSettings] = useState<AiSettings>(loadSettings);
  const [editing, setEditing] = useState(() => !ready(loadSettings()));
  const [questions, setQuestions] = useState('');
  const [draft, setDraft] = useState<ScoreDraft | null>(null);
  const [busy, setBusy] = useState<'questions' | 'draft' | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const start = () => {
    setError('');
    const controller = new AbortController();
    abort.current = controller;
    return controller.signal;
  };

  const ask = async () => {
    const signal = start();
    setBusy('questions');
    setQuestions('');
    try {
      // AI SDK грузится, только когда помощника позвали.
      const { nextQuestions } = await import('./assistant');
      await nextQuestions({ settings, design, lang, now, signal, onText: (chunk) => setQuestions((current) => current + chunk) });
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError(explainAiError(reason, t));
    } finally {
      setBusy(null);
    }
  };

  const drafting = async () => {
    const signal = start();
    setBusy('draft');
    try {
      const { draftScores } = await import('./assistant');
      setDraft(await draftScores({ settings, design, lang, now, signal }));
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError(explainAiError(reason, t));
    } finally {
      setBusy(null);
    }
  };

  /** Принять балл черновика: один критерий или все, у которых балл есть. */
  const acceptScores = (ids: string[]) =>
    update((current) => {
      const scores = { ...current.session.scores };
      for (const item of draft?.criteria ?? [])
        if (ids.includes(item.id) && item.level !== null && item.level >= 0 && item.level <= 3) scores[item.id] = item.level;
      return { ...current, session: { ...current.session, scores } };
    });

  const acceptNotes = () =>
    update((current) => {
      const notes = current.session.notes.trim();
      const text = draft?.notes.trim() ?? '';
      return { ...current, session: { ...current.session, notes: notes ? `${notes}\n\n${text}` : text } };
    });

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

  const model = CLAUDE_MODELS.find((item) => item.id === modelOf(settings))?.label ?? modelOf(settings);
  const rubric = new Map(design.scenario.rubric.map((item) => [item.id, item]));
  const scorable = (draft?.criteria ?? []).filter((item) => item.level !== null && rubric.has(item.id));

  return (
    <div className="pg-panel pg-assist">
      <div className="pg-ai__bar">
        <span className="pg-hint">
          <i className="codicon codicon-sparkle" aria-hidden="true" /> {model}
        </span>
        <span className="pg-toolbar__spacer" />
        <button type="button" className="pg-icon-button" title={t('ai.settings')} aria-label={t('ai.settings')} onClick={() => setEditing(true)}>
          <i className="codicon codicon-settings-gear" aria-hidden="true" />
        </button>
      </div>
      <p className="pg-hint">{t('assist.intro')}</p>

      <section>
        <div className="pg-actions">
          <button type="button" className="pg-button pg-button--primary" disabled={busy !== null} onClick={ask}>
            <i className="codicon codicon-comment-discussion" aria-hidden="true" /> {t('assist.ask')}
          </button>
          <button type="button" className="pg-button" disabled={busy !== null || !design.scenario.rubric.length} onClick={drafting}>
            <i className="codicon codicon-checklist" aria-hidden="true" /> {t('assist.draft')}
          </button>
          {busy && (
            <button type="button" className="pg-button" onClick={() => abort.current?.abort()}>
              <i className="codicon codicon-debug-stop" aria-hidden="true" /> {t('ai.stop')}
            </button>
          )}
        </div>
        {error && <p className="pg-note pg-note--warn">{error}</p>}
      </section>

      {(questions || busy === 'questions') && (
        <section>
          <h4 className="pg-heading">{t('assist.questions')}</h4>
          <div className={`pg-ai__turn is-interviewer ${busy === 'questions' ? 'is-streaming' : ''}`}>{questions || t('ai.thinking')}</div>
        </section>
      )}

      {busy === 'draft' && <p className="pg-hint">{t('assist.drafting')}</p>}

      {draft && busy !== 'draft' && (
        <section>
          <h4 className="pg-heading">{t('assist.draftTitle')}</h4>
          <ul className="pg-assist__list">
            {draft.criteria
              .filter((item) => rubric.has(item.id))
              .map((item) => {
                const current = design.session.scores[item.id];
                return (
                  <li key={item.id} className="pg-assist__item">
                    <div className="pg-assist__row">
                      <span className="pg-assist__text">{rubric.get(item.id)!.text}</span>
                      <span className={`pg-assist__level ${item.level === null ? 'is-empty' : `pg-level--${item.level}`}`}>
                        {item.level === null ? '—' : item.level}
                      </span>
                      {item.level !== null && current !== item.level && (
                        <button type="button" className="pg-button pg-button--small" onClick={() => acceptScores([item.id])}>
                          {t('assist.accept')}
                        </button>
                      )}
                      {item.level !== null && current === item.level && <span className="pg-hint">{t('assist.accepted')}</span>}
                    </div>
                    <p className="pg-hint">{item.why}</p>
                  </li>
                );
              })}
          </ul>
          <div className="pg-actions">
            <button
              type="button"
              className="pg-button"
              disabled={!scorable.length}
              onClick={() => acceptScores(scorable.map((item) => item.id))}
            >
              <i className="codicon codicon-check-all" aria-hidden="true" /> {t('assist.acceptAll')}
            </button>
          </div>

          <h4 className="pg-heading">{t('assist.notes')}</h4>
          <p className="pg-report__notes">{draft.notes}</p>
          <div className="pg-actions">
            <button type="button" className="pg-button" disabled={!draft.notes.trim()} onClick={acceptNotes}>
              <i className="codicon codicon-note" aria-hidden="true" /> {t('assist.insertNotes')}
            </button>
          </div>
          <p className="pg-hint">{t('assist.yours')}</p>
        </section>
      )}

      <p className="pg-note">{t('assist.privacy')}</p>
    </div>
  );
}

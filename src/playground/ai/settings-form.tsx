import { useState } from 'react';
import { CLAUDE_MODELS, DEFAULT_SETTINGS, PROVIDERS, info, keyOf, modelOf, ready, type AiSettings, type Provider } from './settings';
import type { T } from '../i18n';

/**
 * Какую модель звать и с каким ключом — одна форма для ИИ-интервьюера в
 * тренировке и для помощника интервьюеру в собеседовании.
 */
export function AiSettingsForm({
  t,
  value,
  onSave,
  onForget,
  onCancel,
}: {
  t: T;
  value: AiSettings;
  onSave: (next: AiSettings) => void;
  onForget: () => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(value);
  const provider = info(form.provider);
  const setKey = (key: string) => setForm((current) => ({ ...current, keys: { ...current.keys, [current.provider]: key } }));
  const setModel = (model: string) => setForm((current) => ({ ...current, models: { ...current.models, [current.provider]: model } }));
  const anyKey = Object.values(value.keys).some((key) => key?.trim());

  return (
    <form
      className="pg-panel pg-ai-settings"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready(form)) onSave(form);
      }}
    >
      <h3 className="pg-heading">{t('ai.setupTitle')}</h3>
      <p className="pg-hint">{t('ai.setupIntro')}</p>

      <label className="pg-field">
        <span className="pg-field__label">{t('ai.provider')}</span>
        <select
          className="pg-input pg-select"
          value={form.provider}
          onChange={(event) => setForm((current) => ({ ...current, provider: event.currentTarget.value as Provider }))}
        >
          {PROVIDERS.map((item) => (
            <option key={item.id} value={item.id}>
              {t(`ai.provider.${item.id}`)}
            </option>
          ))}
        </select>
      </label>

      {form.provider === 'local' ? (
        <>
          <label className="pg-field">
            <span className="pg-field__label">{t('ai.baseUrl')}</span>
            <input
              className="pg-input"
              value={form.baseUrl}
              spellCheck={false}
              onChange={(event) => setForm({ ...form, baseUrl: event.currentTarget.value })}
            />
          </label>
          <p className="pg-hint">{t('ai.localHint', { origin: location.origin })}</p>
        </>
      ) : (
        <>
          <label className="pg-field">
            <span className="pg-field__label">{t('ai.key')}</span>
            <input
              className="pg-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={provider.keyPlaceholder}
              value={keyOf(form)}
              onChange={(event) => setKey(event.currentTarget.value)}
            />
          </label>
          <p className="pg-hint">
            {t('ai.keyHint')}{' '}
            <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer">
              {new URL(provider.keyUrl!).host}
            </a>
          </p>
        </>
      )}

      <label className="pg-field">
        <span className="pg-field__label">{t('ai.model')}</span>
        {form.provider === 'anthropic' ? (
          <select className="pg-input pg-select" value={modelOf(form)} onChange={(event) => setModel(event.currentTarget.value)}>
            {CLAUDE_MODELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="pg-input"
            spellCheck={false}
            placeholder={t('ai.modelExample', { model: provider.modelExample })}
            value={form.models[form.provider] ?? provider.defaultModel}
            onChange={(event) => setModel(event.currentTarget.value)}
          />
        )}
      </label>

      <p className="pg-note">{t('ai.privacy')}</p>

      <div className="pg-actions">
        <button type="submit" className="pg-button pg-button--primary" disabled={!ready(form)}>
          {t('ai.save')}
        </button>
        {onCancel && (
          <button type="button" className="pg-button" onClick={onCancel}>
            {t('ai.cancel')}
          </button>
        )}
        {anyKey && (
          <button
            type="button"
            className="pg-button pg-button--danger"
            onClick={() => {
              onForget();
              setForm(DEFAULT_SETTINGS);
            }}
          >
            {t('ai.forget')}
          </button>
        )}
      </div>
    </form>
  );
}

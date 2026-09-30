/**
 * Настройки ИИ-интервьюера: свой ключ или своя локальная модель.
 *
 * Песочница не платит за чужие разговоры: человек приносит ключ того
 * сервиса, которым пользуется, — Anthropic, OpenAI, Google, OpenRouter — или
 * поднимает модель у себя (Ollama, LM Studio). Ключ лежит только в этом
 * браузере и уходит только в API выбранного сервиса. Ни на наш сервер, ни в
 * Supabase он не попадает.
 *
 * Подписка claude.ai или ChatGPT сюда не подключается: у подписок нет входа
 * для сторонних сайтов, только ключи API.
 */

export type Provider = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'local';

export interface ProviderInfo {
  id: Provider;
  /** Где взять ключ; у локальной модели ключа нет. */
  keyUrl?: string;
  keyPlaceholder?: string;
  /** Модель по умолчанию; пусто — человек пишет сам. */
  defaultModel: string;
  /** Пример названия модели в пустом поле. */
  modelExample: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    defaultModel: 'claude-opus-5',
    modelExample: 'claude-opus-5',
  },
  {
    id: 'openai',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    defaultModel: '',
    modelExample: 'gpt-5-mini',
  },
  {
    id: 'google',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
    defaultModel: '',
    modelExample: 'gemini-2.5-flash',
  },
  {
    id: 'openrouter',
    keyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-…',
    defaultModel: '',
    modelExample: 'anthropic/claude-sonnet-5',
  },
  { id: 'local', defaultModel: 'llama3.1', modelExample: 'llama3.1' },
];

/** Модели Claude на выбор: у Anthropic список короткий и известный, остальным — своё поле. */
export const CLAUDE_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
];

export interface AiSettings {
  provider: Provider;
  /** Ключ у каждого сервиса свой — переключился и обратно, ключ на месте. */
  keys: Partial<Record<Provider, string>>;
  models: Partial<Record<Provider, string>>;
  /**
   * Локальный сервер с OpenAI-совместимым API: Ollama —
   * http://localhost:11434/v1, LM Studio — http://localhost:1234/v1.
   */
  baseUrl: string;
}

export const DEFAULT_SETTINGS: AiSettings = {
  provider: 'anthropic',
  keys: {},
  models: {},
  baseUrl: 'http://localhost:11434/v1',
};

export const info = (provider: Provider) => PROVIDERS.find((item) => item.id === provider) ?? PROVIDERS[0];

export const modelOf = (settings: AiSettings) =>
  (settings.models[settings.provider] ?? '').trim() || info(settings.provider).defaultModel;

export const keyOf = (settings: AiSettings) => (settings.keys[settings.provider] ?? '').trim();

const KEY = 'why:playground:ai';

export function loadSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AiSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* хранилище недоступно — настройки живут до перезагрузки */
  }
}

export function forgetSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* нечего стирать */
  }
}

/** Готово ли к разговору: есть модель и ключ — или адрес локального сервера. */
export function ready(settings: AiSettings): boolean {
  if (!modelOf(settings)) return false;
  return settings.provider === 'local' ? Boolean(settings.baseUrl.trim()) : Boolean(keyOf(settings));
}

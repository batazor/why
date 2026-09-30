import { APICallError, Output, generateText, jsonSchema, streamText, type LanguageModel, type ModelMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { keyOf, modelOf, type AiSettings } from './settings';
import { AiError } from './errors';

/**
 * Разговор с моделью — один на всех: ИИ-интервьюер в тренировке и помощник
 * интервьюеру в живом собеседовании зовут модель одинаково.
 *
 * Модель — какая угодно: запрос идёт через AI SDK (ai-sdk.dev), и у всех
 * сервисов один и тот же код. Вызов — прямо из браузера с ключом человека;
 * Claude для этого нужен заголовок anthropic-dangerous-direct-browser-access,
 * без него API браузеру не отвечает. Локальная модель — через
 * OpenAI-совместимый адрес Ollama или LM Studio на машине человека.
 */

/** Модели Claude, у которых на отказ есть резервная модель на стороне сервера. */
const FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5-1']);


/** Модель выбранного сервиса — с ключом человека, прямо из браузера. */
function languageModel(settings: AiSettings): LanguageModel {
  const apiKey = keyOf(settings);
  const model = modelOf(settings);
  switch (settings.provider) {
    case 'anthropic':
      return createAnthropic({ apiKey, headers: { 'anthropic-dangerous-direct-browser-access': 'true' } })(model);
    case 'openai':
      return createOpenAI({ apiKey })(model);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(model);
    case 'openrouter':
      return createOpenAICompatible({ name: 'openrouter', baseURL: 'https://openrouter.ai/api/v1', apiKey })(model);
    case 'local':
      // Ollama отвечает браузеру, только если сайт разрешён в OLLAMA_ORIGINS; LM Studio — если включён CORS.
      return createOpenAICompatible({ name: 'local', baseURL: settings.baseUrl.trim().replace(/\/+$/, '') })(model);
  }
}

/** Настройки Claude: разговор, а не задача на час — средней глубины размышлений хватает. */
function providerOptions(settings: AiSettings) {
  if (settings.provider !== 'anthropic') return undefined;
  return {
    anthropic: {
      thinking: { type: 'adaptive' as const },
      effort: 'medium' as const,
      // Неизменная системная подсказка и история кэшируются; меняется только последний ход.
      cacheControl: { type: 'ephemeral' as const },
      ...(FALLBACK_MODELS.has(modelOf(settings)) ? { fallbacks: 'default' as const } : {}),
    },
  };
}

interface Call {
  settings: AiSettings;
  system: string;
  messages: ModelMessage[];
  signal: AbortSignal;
}

/** Ответ по кусочкам через onText; возвращает полный текст. Остановка — AbortError. */
export async function streamReply({ settings, system, messages, signal, onText }: Call & { onText: (chunk: string) => void }): Promise<string> {
  const result = streamText({
    model: languageModel(settings),
    instructions: system,
    messages,
    abortSignal: signal,
    maxRetries: 1,
    ...(settings.provider === 'anthropic' ? { maxOutputTokens: 32000 } : {}),
    providerOptions: providerOptions(settings),
  });
  let text = '';
  try {
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        text += part.text;
        onText(part.text);
      } else if (part.type === 'error') {
        throw part.error;
      } else if (part.type === 'abort') {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      } else if (part.type === 'finish' && part.finishReason === 'content-filter') {
        throw new AiError('refusal', part.rawFinishReason ?? 'content-filter');
      }
    }
  } catch (error) {
    throw normalize(error);
  }
  return text;
}

/**
 * Ответ по JSON-схеме — когда нужен не текст, а данные: баллы по критериям,
 * черновик заметок. Схему соблюдает сама модель (structured outputs).
 */
export async function structured<T>({ settings, system, messages, signal, schema, name }: Call & { schema: object; name: string }): Promise<T> {
  try {
    const result = await generateText({
      model: languageModel(settings),
      instructions: system,
      messages,
      abortSignal: signal,
      maxRetries: 1,
      ...(settings.provider === 'anthropic' ? { maxOutputTokens: 32000 } : {}),
      providerOptions: providerOptions(settings),
      output: Output.object({ schema: jsonSchema<T>(schema as Parameters<typeof jsonSchema>[0]), name }),
    });
    if (result.finishReason === 'content-filter') throw new AiError('refusal', 'content-filter');
    return result.output as T;
  } catch (error) {
    throw normalize(error);
  }
}

/** Ошибки разных сервисов — к нескольким понятным причинам. Остановка остаётся AbortError. */
function normalize(error: unknown): Error {
  if (error instanceof AiError) return error;
  const err = error as Error;
  if (err?.name === 'AbortError') return err;
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) return new AiError('key', error.message);
    if (error.statusCode === 429) return new AiError('rate', error.message);
    if (error.statusCode === undefined) return new AiError('network', error.message);
    return new AiError('other', error.message);
  }
  // fetch не дотянулся: сервер не запущен или не пускает этот сайт (CORS).
  if (err instanceof TypeError) return new AiError('network', err.message);
  return new AiError('other', err?.message ?? String(error));
}

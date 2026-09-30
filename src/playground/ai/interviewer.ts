import { APICallError, streamText, type LanguageModel, type ModelMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { active } from '../checks';
import type { AiTurn, Design } from '../model';
import { keyOf, modelOf, type AiSettings } from './settings';
import { AiError } from './errors';

/**
 * ИИ-интервьюер для тренировки: смотрит на доску человека и ведёт разговор
 * так, как вёл бы живой интервьюер, — спрашивает по его схеме, а не по
 * шаблону, и в конце разбирает прохождение.
 *
 * Модель — какая угодно: запрос идёт через AI SDK (ai-sdk.dev), и у всех
 * сервисов один и тот же код разговора. Вызов — прямо из браузера с ключом
 * человека; Claude для этого нужен заголовок
 * anthropic-dangerous-direct-browser-access, без него API браузеру не
 * отвечает. Локальная модель — через OpenAI-совместимый адрес Ollama или
 * LM Studio на машине человека.
 *
 * Системная подсказка неизменна и кэшируется; доска меняется каждый ход и
 * едет только в последнем сообщении — так кэш не сбивается от хода к ходу.
 */

export type Turn = AiTurn;

export type Mode = 'reply' | 'ask' | 'review';

const SYSTEM = {
  ru: `Ты — опытный интервьюер на собеседовании по системному дизайну. Кандидат тренируется: рисует схему на доске, пишет требования, API и прикидку нагрузки. Каждый ход ты получаешь текущее состояние его доски.

Как ты ведёшь разговор:
- Задавай один вопрос за раз — короткий и по делу, как на живом собеседовании.
- Спрашивай про то, что нарисовано на его доске: называй его блоки и связи. Не задавай общих вопросов из учебника.
- Ищи слабые места: единые точки отказа, узкие горлышки, потерю данных при сбоях, неясные числа, требования без блоков, которые их закрывают.
- Не подсказывай ответ и не рисуй решение за кандидата. Если он застрял — наведи вопросом, а не готовым ответом.
- Если на доске ещё пусто — начни с требований: что система должна делать и под какой нагрузкой.
- Отвечай по-русски, без вступлений и похвалы по привычке. Без markdown-заголовков; короткие списки можно.

Когда просят разбор — оцени прохождение целиком: что сделано хорошо, чего не хватает, какие вопросы стоило бы задать себе самому. Если есть проверки тренировки — пройдись по ним: какие закрыты доской, какие нет. В конце — одна-две вещи, которые стоит отработать в первую очередь.`,
  en: `You are an experienced system design interviewer. The candidate is practising: they draw a diagram on the board and write requirements, an API and a load estimate. Each turn you receive the current state of their board.

How you run the conversation:
- Ask one question at a time, short and to the point, as in a live interview.
- Ask about what is on their board: name their blocks and links. Avoid generic textbook questions.
- Look for weak spots: single points of failure, bottlenecks, data loss on failures, vague numbers, requirements no block covers.
- Do not give the answer or draw the solution for them. If they are stuck, lead with a question, not a ready answer.
- If the board is still empty, start with requirements: what the system must do and under what load.
- Answer in English, without preambles or habitual praise. No markdown headings; short lists are fine.

When asked for a review, assess the whole run: what is done well, what is missing, which questions they should have asked themselves. If there are practice checks, go through them: which the board covers and which it does not. Finish with one or two things to practise first.`,
};

/** Доска человека словами: модель видит то же, что интервьюер на экране. */
export function describeBoard(design: Design, lang: string): string {
  const ru = lang === 'ru';
  const name = new Map(design.nodes.map((node) => [node.id, node.label || node.kind]));
  const lines: string[] = [];
  const section = (title: string, body: string[]) => {
    lines.push(`${title}:`);
    lines.push(...(body.length ? body : [ru ? '(пусто)' : '(empty)']));
    lines.push('');
  };

  section(ru ? 'ЗАДАНИЕ' : 'TASK', [design.task.trim()].filter(Boolean));
  section(
    ru ? 'ТРЕБОВАНИЯ' : 'REQUIREMENTS',
    design.requirements.map((item) => {
      const target = item.kind === 'nfr' && item.target ? ` — ${ru ? 'цель' : 'target'}: ${item.target}` : '';
      const covers = item.covers.length ? ` (${ru ? 'закрывают' : 'covered by'}: ${item.covers.map((id) => name.get(id) ?? id).join(', ')})` : '';
      return `- ${item.id}: ${item.text}${target}${covers}`;
    }),
  );
  section(
    'API',
    design.api.map((item) => {
      const service = item.service ? ` [${name.get(item.service) ?? item.service}]` : '';
      return `- ${item.method} ${item.path} → ${item.status}${service}${item.about ? ` — ${item.about}` : ''}`;
    }),
  );
  section(ru ? 'ПРИКИДКА НАГРУЗКИ' : 'LOAD ESTIMATE', [design.estimate.trim()].filter(Boolean));
  section(
    ru ? 'БЛОКИ СХЕМЫ' : 'DIAGRAM BLOCKS',
    design.nodes.map((node) => {
      const tech = node.tech ? `, ${node.tech}` : '';
      const note = node.note.trim() ? ` — ${node.note.trim()}` : '';
      const schema = node.schema?.length ? ` (${ru ? 'таблицы' : 'tables'}: ${node.schema.map((table) => table.name).join(', ')})` : '';
      return `- ${node.label || node.kind} [${node.kind}${tech}]${note}${schema}`;
    }),
  );
  section(
    ru ? 'СВЯЗИ' : 'LINKS',
    design.edges.map(
      (edge) =>
        `- ${name.get(edge.source) ?? edge.source} → ${name.get(edge.target) ?? edge.target} (${edge.mode})${edge.label ? ` — ${edge.label}` : ''}`,
    ),
  );
  const checks = active(design.scenario.checks ?? []);
  if (checks.length) section(ru ? 'ПРОВЕРКИ ТРЕНИРОВКИ' : 'PRACTICE CHECKS', checks.map((check) => `- ${check.text}`));
  return lines.join('\n').trim();
}

/** Что сказать модели в этом ходе, кроме доски. */
function instruction(mode: Mode, text: string, lang: string): string {
  const ru = lang === 'ru';
  if (mode === 'ask') return ru ? 'Посмотри на доску и задай следующий вопрос.' : 'Look at the board and ask the next question.';
  if (mode === 'review') return ru ? 'Собеседование закончено. Сделай разбор прохождения.' : 'The interview is over. Review the run.';
  return text;
}

/** Реплика истории, как её видит модель: действия — короткой пометкой, не целиком. */
function asText(turn: Turn, lang: string): string {
  if (turn.kind === 'ask') return lang === 'ru' ? '(Кандидат просит следующий вопрос.)' : '(The candidate asks for the next question.)';
  if (turn.kind === 'review') return lang === 'ru' ? '(Кандидат просит разбор.)' : '(The candidate asks for a review.)';
  return turn.text;
}

interface Request {
  settings: AiSettings;
  design: Design;
  lang: string;
  /** История без нового хода. */
  history: Turn[];
  mode: Mode;
  /** Реплика кандидата в режиме reply. */
  text: string;
  signal: AbortSignal;
  onText: (chunk: string) => void;
}

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

/** Один ход интервьюера: ответ приходит по кусочкам через onText. Возвращает полный текст. */
export async function interviewerTurn(request: Request): Promise<string> {
  const lang = request.lang === 'ru' ? 'ru' : 'en';
  const board = describeBoard(request.design, lang);
  const last = `${lang === 'ru' ? 'ДОСКА КАНДИДАТА СЕЙЧАС' : 'THE CANDIDATE’S BOARD NOW'}:\n\n${board}\n\n---\n\n${instruction(request.mode, request.text, lang)}`;
  const messages: ModelMessage[] = [
    ...request.history.map((turn): ModelMessage =>
      turn.role === 'interviewer' ? { role: 'assistant', content: asText(turn, lang) } : { role: 'user', content: asText(turn, lang) },
    ),
    { role: 'user', content: last },
  ];
  const { settings } = request;
  const claude = settings.provider === 'anthropic';

  const result = streamText({
    model: languageModel(settings),
    instructions: SYSTEM[lang],
    messages,
    abortSignal: request.signal,
    maxRetries: 1,
    ...(claude ? { maxOutputTokens: 32000 } : {}),
    providerOptions: claude
      ? {
          anthropic: {
            // Разговор, а не задача на час: средней глубины размышлений хватает и не тянет время.
            thinking: { type: 'adaptive' },
            effort: 'medium',
            // Неизменная системная подсказка и история кэшируются; меняется только последний ход.
            cacheControl: { type: 'ephemeral' },
            ...(FALLBACK_MODELS.has(modelOf(settings)) ? { fallbacks: 'default' } : {}),
          },
        }
      : undefined,
  });

  let text = '';
  try {
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        text += part.text;
        request.onText(part.text);
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

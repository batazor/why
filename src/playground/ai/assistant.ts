import type { ModelMessage } from 'ai';
import { streamReply, structured } from './llm';
import { describeBoard } from './interviewer';
import { elapsed } from '../scenario-panels';
import type { Design } from '../model';
import type { AiSettings } from './settings';

/**
 * Помощник интервьюеру в живом собеседовании.
 *
 * Видит то же, что интервьюер: доску кандидата, эталон автора, критерии,
 * заготовленные вопросы и подсказки, заметки для интервьюера. Кандидат его
 * ответов не видит — помощник говорит только с интервьюером.
 *
 * Два дела: подсказать, что спросить сейчас, — по расхождениям с эталоном и
 * незаданным вопросам; и набросать оценку по критериям с черновиком заметок,
 * который интервьюер правит, а не пишет с нуля.
 *
 * Уходит в модель только содержание собеседования: имени и почты кандидата
 * там нет.
 */

const SYSTEM = {
  ru: `Ты помогаешь интервьюеру на собеседовании по системному дизайну. Ты видишь доску кандидата, эталонное решение автора сценария, критерии оценки, заготовленные вопросы и подсказки. Кандидат твоих ответов не видит — ты говоришь только с интервьюером.

Всё, что нарисовал сам интервьюер (помечено на доске), — не заслуга кандидата. Открытые подсказки — тоже помощь кандидату, учитывай их.

Пиши по-русски, коротко, без markdown-заголовков.`,
  en: `You help an interviewer during a system design interview. You see the candidate's board, the scenario author's reference solution, the rubric, the prepared questions and hints. The candidate does not see your answers — you speak only to the interviewer.

Anything the interviewer drew themselves (marked on the board) is not the candidate's merit. Revealed hints are help to the candidate too — take them into account.

Write in English, briefly, without markdown headings.`,
};

/** Всё про собеседование словами — для модели. */
export function interviewContext(design: Design, lang: string, now: number): string {
  const ru = lang === 'ru';
  const { scenario, session } = design;
  const reference = describeBoard({ ...design, ...scenario.reference }, lang, { checks: false });
  const lines = [
    `${ru ? 'ДОСКА КАНДИДАТА' : 'THE CANDIDATE’S BOARD'}:`,
    describeBoard(design, lang, { checks: false }),
    '',
    `${ru ? 'ЭТАЛОН АВТОРА (кандидат его не видит)' : 'THE AUTHOR’S REFERENCE (hidden from the candidate)'}:`,
    reference,
    '',
    `${ru ? 'КРИТЕРИИ ОЦЕНКИ' : 'RUBRIC'}:`,
    ...(scenario.rubric.length
      ? scenario.rubric.map((item) => `- ${item.id}${item.weight > 1 ? ` (×${item.weight})` : ''}: ${item.text}`)
      : [ru ? '(нет)' : '(none)']),
    '',
    `${ru ? 'ЗАГОТОВЛЕННЫЕ ВОПРОСЫ' : 'PREPARED QUESTIONS'}:`,
    ...(scenario.questions.length
      ? scenario.questions.map(
          (item) => `- [${session.asked.includes(item.id) ? (ru ? 'задан' : 'asked') : ru ? 'не задан' : 'not asked'}] ${item.text}`,
        )
      : [ru ? '(нет)' : '(none)']),
    '',
    `${ru ? 'ПОДСКАЗКИ' : 'HINTS'}:`,
    ...(scenario.hints.length
      ? scenario.hints.map(
          (item) => `- [${session.revealed.includes(item.id) ? (ru ? 'открыта' : 'revealed') : ru ? 'закрыта' : 'hidden'}] ${item.text}`,
        )
      : [ru ? '(нет)' : '(none)']),
  ];
  if (scenario.guide.trim()) lines.push('', `${ru ? 'ЗАМЕТКИ АВТОРА ДЛЯ ИНТЕРВЬЮЕРА' : 'AUTHOR’S NOTES FOR THE INTERVIEWER'}:`, scenario.guide.trim());
  const time = elapsed(session, now);
  if (time) lines.push('', `${ru ? 'ИДЁТ' : 'ELAPSED'}: ${time}`);
  if (session.notes.trim()) lines.push('', `${ru ? 'ЗАМЕТКИ ИНТЕРВЬЮЕРА' : 'INTERVIEWER NOTES'}:`, session.notes.trim());
  return lines.join('\n');
}

interface Ask {
  settings: AiSettings;
  design: Design;
  lang: string;
  now: number;
  signal: AbortSignal;
}

/** Что спросить сейчас: три вопроса, каждый — с тем, зачем он. */
export function nextQuestions({ settings, design, lang, now, signal, onText }: Ask & { onText: (chunk: string) => void }) {
  const ru = lang === 'ru';
  const task = ru
    ? 'Предложи три вопроса, которые стоит задать кандидату прямо сейчас. Каждый — одной фразой, как интервьюер скажет вслух, и строкой ниже — зачем: какое расхождение с эталоном или какой критерий он проверяет. Не повторяй уже заданные вопросы; если кандидат тему уже закрыл — не трать на неё вопрос.'
    : 'Suggest three questions to ask the candidate right now. Each in one sentence, as the interviewer would say it, and on the next line why: which gap against the reference or which criterion it probes. Do not repeat questions already asked; if the candidate has covered a topic, do not spend a question on it.';
  const messages: ModelMessage[] = [{ role: 'user', content: `${interviewContext(design, lang, now)}\n\n---\n\n${task}` }];
  return streamReply({ settings, system: SYSTEM[ru ? 'ru' : 'en'], messages, signal, onText });
}

export interface ScoreDraft {
  criteria: { id: string; level: number | null; why: string }[];
  notes: string;
}

/** Черновик оценки: баллы по критериям с обоснованием и черновик заметок. */
export function draftScores({ settings, design, lang, now, signal }: Ask): Promise<ScoreDraft> {
  const ru = lang === 'ru';
  const task = ru
    ? 'Предложи балл по каждому критерию: 0 — не показал, 1 — слабо, 2 — хорошо, 3 — сильно; null — если по доске и заметкам судить нельзя. Для каждого — одно предложение обоснования по тому, что есть на доске. И черновик заметок интервьюера: 3–6 предложений — сильные стороны, пробелы, сигнал найма. Не выдумывай того, чего нет на доске и в заметках.'
    : 'Suggest a score for each criterion: 0 — not shown, 1 — weak, 2 — good, 3 — strong; null — if the board and notes do not allow judging. For each, one sentence of reasoning grounded in what is on the board. And a draft of the interviewer notes: 3–6 sentences — strengths, gaps, hiring signal. Do not invent what is not on the board or in the notes.';
  const messages: ModelMessage[] = [{ role: 'user', content: `${interviewContext(design, lang, now)}\n\n---\n\n${task}` }];
  return structured<ScoreDraft>({
    settings,
    system: SYSTEM[ru ? 'ru' : 'en'],
    messages,
    signal,
    name: 'score_draft',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['criteria', 'notes'],
      properties: {
        criteria: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'level', 'why'],
            properties: {
              id: { type: 'string', enum: design.scenario.rubric.map((item) => item.id) },
              level: { enum: [0, 1, 2, 3, null] },
              why: { type: 'string' },
            },
          },
        },
        notes: { type: 'string' },
      },
    },
  });
}

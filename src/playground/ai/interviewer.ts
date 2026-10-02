import type { ModelMessage } from 'ai';
import { streamReply } from './llm';
import { active, checkText } from '../checks';
import { translator } from '../i18n';
import { blocksOf, isText, type AiTurn, type Design } from '../model';
import type { AiSettings } from './settings';

/**
 * ИИ-интервьюер для тренировки: смотрит на доску человека и ведёт разговор
 * так, как вёл бы живой интервьюер, — спрашивает по его схеме, а не по
 * шаблону, и в конце разбирает прохождение.
 *
 * Как именно зовётся модель — в llm.ts: здесь только разговор.
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
export function describeBoard(design: Design, lang: string, { checks: withChecks = true } = {}): string {
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
    blocksOf(design.nodes).map((node) => {
      const tech = node.tech ? `, ${node.tech}` : '';
      const caption = node.caption?.trim() ? ` «${node.caption.trim()}»` : '';
      const note = node.note.trim() ? ` — ${node.note.trim()}` : '';
      const schema = node.schema?.length ? ` (${ru ? 'таблицы' : 'tables'}: ${node.schema.map((table) => table.name).join(', ')})` : '';
      // Нарисованное интервьюером — не заслуга кандидата: модель должна это видеть.
      const by = node.drawnBy ? (ru ? ' (нарисовал интервьюер)' : ' (drawn by the interviewer)') : '';
      return `- ${node.label || node.kind} [${node.kind}${tech}]${caption}${note}${schema}${by}`;
    }),
  );
  section(
    ru ? 'СВЯЗИ' : 'LINKS',
    design.edges.map(
      (edge) =>
        `- ${name.get(edge.source) ?? edge.source} → ${name.get(edge.target) ?? edge.target} (${edge.mode})${edge.label ? ` — ${edge.label}` : ''}${
          edge.drawnBy ? (ru ? ' (провёл интервьюер)' : ' (drawn by the interviewer)') : ''
        }`,
    ),
  );
  // Надписи пишутся только если они есть: пустой раздел модели ничего не говорит.
  const texts = design.nodes.filter((node) => isText(node) && node.label.trim());
  if (texts.length)
    section(ru ? 'НАДПИСИ НА СХЕМЕ' : 'TEXT ON THE DIAGRAM', texts.map((node) => `- ${node.label.trim().replace(/\s*\n\s*/g, ' / ')}`));
  const checks = withChecks ? active(design.scenario.checks ?? []) : [];
  const t = translator(lang);
  if (checks.length) section(ru ? 'ПРОВЕРКИ ТРЕНИРОВКИ' : 'PRACTICE CHECKS', checks.map((check) => `- ${checkText(check, t)}`));
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
  return streamReply({ settings: request.settings, system: SYSTEM[lang], messages, signal: request.signal, onText: request.onText });
}

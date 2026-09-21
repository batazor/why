/**
 * Проверки доски: по ним тренировка понимает, что шаг пройден.
 *
 * Правила описывают решение через типы блоков и связи между ними, а не через
 * конкретные блоки: названия у каждого свои и на своём языке, а «приём пишет в
 * очередь асинхронно» одинаково верно и с Kafka, и с SQS.
 *
 * Правила ничего не знают про требования по номерам. Номер FR-2 у автора и
 * FR-2 у того, кто решает, — разные требования: свои формулирует он сам.
 * Поэтому про требования правила говорят оптом: «все закрыты блоком», «у всех
 * НФТ есть числа», «сформулировано хотя бы столько-то».
 */

import type { Board, EdgeMode, RequirementKind, Scenario } from './model';
import { uid } from './model';
import { STATEFUL_KINDS } from './catalog';
import type { T } from './i18n';

export type Rule =
  /** На схеме есть блок такого типа. */
  | { is: 'kind'; kind: string; min?: number }
  /** Есть связь между блоками таких типов, при желании — нужного режима. */
  | { is: 'path'; from: string; to: string; mode?: EdgeMode }
  /** Сформулировано хотя бы столько требований этого вида. */
  | { is: 'reqs'; kind: RequirementKind; min: number }
  /** У каждого НФТ проставлено число. */
  | { is: 'numbers' }
  /** Каждое требование закрыто хотя бы одним блоком схемы. */
  | { is: 'covered' }
  /** У каждого FR есть маршрут в API. */
  | { is: 'routes' }
  /** У хранилища такого типа описаны данные. */
  | { is: 'schema'; kind: string }
  /** Есть прикидка, и в ней есть числа. */
  | { is: 'estimate' }
  /** Годится любое из: «или кэш, или реплика для чтения». */
  | { is: 'any'; rules: Rule[] }
  | { is: 'not'; rule: Rule };

export interface Check {
  id: string;
  /** Что проверяем — словами, как это увидит человек. */
  text: string;
  /** Во сколько раз проверка весомее обычной. */
  weight: number;
  rule: Rule;
  /** Автор снял проверку: она остаётся в проекте, но не считается. */
  off?: boolean;
}

/** Активные проверки: снятые автором не участвуют ни в воротах, ни в счёте. */
export const active = (checks: Check[]) => checks.filter((check) => !check.off);

export function holds(board: Board, rule: Rule): boolean {
  switch (rule.is) {
    case 'kind':
      return board.nodes.filter((node) => node.kind === rule.kind).length >= (rule.min ?? 1);

    case 'path': {
      const kinds = new Map(board.nodes.map((node) => [node.id, node.kind]));
      return board.edges.some(
        (edge) =>
          kinds.get(edge.source) === rule.from &&
          kinds.get(edge.target) === rule.to &&
          (!rule.mode || edge.mode === rule.mode),
      );
    }

    case 'reqs':
      return board.requirements.filter((item) => item.kind === rule.kind && item.text.trim()).length >= rule.min;

    case 'numbers': {
      const nfr = board.requirements.filter((item) => item.kind === 'nfr' && item.text.trim());
      return nfr.length > 0 && nfr.every((item) => item.target.trim());
    }

    case 'covered': {
      const ids = new Set(board.nodes.map((node) => node.id));
      const written = board.requirements.filter((item) => item.text.trim());
      return written.length > 0 && written.every((item) => item.covers.some((id) => ids.has(id)));
    }

    case 'routes': {
      const fr = board.requirements.filter((item) => item.kind === 'fr' && item.text.trim());
      const served = new Set(board.api.flatMap((item) => item.covers));
      return fr.length > 0 && fr.every((item) => served.has(item.id));
    }

    case 'schema':
      return board.nodes.some((node) => node.kind === rule.kind && (node.schema?.length ?? 0) > 0);

    /**
     * Прикидка без единой цифры — это не прикидка, а намерение посчитать.
     * Поэтому смотрим не на длину текста, а на то, есть ли в нём числа.
     */
    case 'estimate':
      return /\d/.test(board.estimate) && board.estimate.trim().length >= 40;

    case 'any':
      return rule.rules.some((item) => holds(board, item));

    case 'not':
      return !holds(board, rule.rule);
  }
}

export function evaluate(board: Board, checks: Check[]): Record<string, boolean> {
  const passed: Record<string, boolean> = {};
  for (const check of active(checks)) passed[check.id] = holds(board, check.rule);
  return passed;
}

/**
 * Правило и есть личность проверки: у одинаковых правил одинаковый смысл, как
 * бы автор ни переписал текст.
 */
const ruleKey = (rule: Rule): string => JSON.stringify(rule);

/**
 * Пересборка проверок из изменившегося эталона не должна стирать работу
 * автора: снятые галочки и поднятые веса переносятся на те правила, которые
 * никуда не делись.
 */
export function mergeChecks(previous: Check[], fresh: Check[]): Check[] {
  const before = new Map(previous.map((check) => [ruleKey(check.rule), check]));
  return fresh.map((check) => {
    const old = before.get(ruleKey(check.rule));
    return old ? { ...check, id: old.id, weight: old.weight, off: old.off } : check;
  });
}

/**
 * Типы блоков, наличие которых ничего не проверяет: клиент есть в любой схеме,
 * и требовать его — значит дарить очко ни за что.
 */
const OBVIOUS: ReadonlySet<string> = new Set(['user', 'mobile', 'external']);

/**
 * Сколько требований спросить, если в эталоне их столько.
 *
 * Эталон автора — исчерпывающий разбор, и требовать от прохождения столько же
 * формулировок значит поставить стену на первом же шаге. Берём меньше
 * половины и не больше пяти: дальше растёт не качество ответа, а объём
 * печати.
 */
const threshold = (count: number) => Math.max(2, Math.min(5, Math.round(count * 0.45)));

/**
 * Связь между блоками интересна, когда она про состояние или про асинхронность:
 * «сервис пишет в очередь», «воркер кладёт результат в хранилище». Связи вида
 * «клиент пришёл в шлюз» рисуют все, и проверять их незачем.
 */
function worthChecking(toKind: string, mode: EdgeMode): boolean {
  return mode === 'async' || STATEFUL_KINDS.has(toKind);
}

/**
 * Проверки из эталона автора.
 *
 * Автор ничего не пишет заново: он уже нарисовал решение, расставил требования
 * и заполнил прикидку — этого хватает, чтобы понять, что должно оказаться на
 * доске у того, кто решает. Список выводится один раз и кладётся в проект,
 * дальше автор снимает лишнее и правит веса.
 *
 * Требования пересчитываются с запасом вниз: эталон — не единственный верный
 * ответ, и требовать ровно столько же формулировок нечестно.
 */
export function deriveChecks(scenario: Scenario, t: T): Check[] {
  const { reference } = scenario;
  const checks: Check[] = [];
  const add = (rule: Rule, text: string, weight = 1) => checks.push({ id: uid('chk'), text, weight, rule });
  const block = (kind: string) => t(`block.${kind}`);

  const fr = reference.requirements.filter((item) => item.kind === 'fr' && item.text.trim()).length;
  const nfr = reference.requirements.filter((item) => item.kind === 'nfr' && item.text.trim()).length;
  if (fr) {
    const min = threshold(fr);
    add({ is: 'reqs', kind: 'fr', min }, t('check.reqsFr', { n: String(min) }), 2);
  }
  if (nfr) {
    const min = threshold(nfr);
    add({ is: 'reqs', kind: 'nfr', min }, t('check.reqsNfr', { n: String(min) }), 2);
    if (reference.requirements.some((item) => item.kind === 'nfr' && item.target.trim()))
      add({ is: 'numbers' }, t('check.numbers'), 3);
  }
  if (reference.requirements.some((item) => item.covers.length)) add({ is: 'covered' }, t('check.covered'), 2);
  if (reference.api.length) add({ is: 'routes' }, t('check.routes'), 1);

  /**
   * Связи выводятся раньше блоков: связь уже говорит, что оба её конца на
   * схеме есть, и отдельная проверка «на схеме есть очередь» после «сервис
   * пишет в очередь» — это одно и то же требование, посчитанное дважды.
   */
  const kindOf = new Map(reference.nodes.map((node) => [node.id, node.kind]));
  const paths: Check[] = [];
  const linked = new Set<string>();
  const seen = new Set<string>();
  for (const edge of reference.edges) {
    const from = kindOf.get(edge.source);
    const to = kindOf.get(edge.target);
    if (!from || !to || from === to) continue;
    if (!worthChecking(to, edge.mode)) continue;
    /**
     * Встречные связи одного режима — одна проверка на обе стороны: когда в
     * эталоне очередь и воркер ходят друг к другу, направление стрелки у
     * того, кто решает, — дело вкуса, а не ошибка.
     */
    const back = reference.edges.some(
      (other) => kindOf.get(other.source) === to && kindOf.get(other.target) === from && other.mode === edge.mode,
    );
    const key = back ? [from, to].sort().join('~') + `:${edge.mode}` : `${from}>${to}:${edge.mode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    linked.add(from).add(to);
    const names = { from: block(from), to: block(to) };
    paths.push(
      back
        ? {
            id: uid('chk'),
            text: t('check.pathBoth', names),
            weight: 2,
            rule: {
              is: 'any',
              rules: [
                { is: 'path', from, to, mode: edge.mode },
                { is: 'path', from: to, to: from, mode: edge.mode },
              ],
            },
          }
        : {
            id: uid('chk'),
            text: t(edge.mode === 'async' ? 'check.pathAsync' : 'check.path', names),
            weight: 2,
            rule: { is: 'path', from, to, mode: edge.mode },
          },
    );
  }

  const kinds = new Set(reference.nodes.map((node) => node.kind));
  for (const kind of kinds)
    if (!OBVIOUS.has(kind) && !linked.has(kind)) add({ is: 'kind', kind }, t('check.kind', { kind: block(kind) }));
  checks.push(...paths);

  for (const kind of kinds)
    if (STATEFUL_KINDS.has(kind) && reference.nodes.some((node) => node.kind === kind && node.schema?.length))
      add({ is: 'schema', kind }, t('check.schema', { kind: block(kind) }));

  if (reference.estimate.trim()) add({ is: 'estimate' }, t('check.estimate'), 3);

  return checks;
}

/**
 * Тренировка: прохождение сценария без интервьюера.
 *
 * Здесь живёт всё, что в собеседовании делает человек: ведёт по шагам, решает,
 * когда шаг закрыт, подкидывает вводную и считает итог. Модуль чистый — ни
 * React, ни хранилища: те же функции потом посчитают прохождение на сервере.
 */

import { active, type Check, type Rule } from './checks';
import {
  TRAIN_STEPS,
  nextRequirementId,
  type Design,
  type NfrCategory,
  type Requirement,
  type TrainStep,
} from './model';
import type { T } from './i18n';

/** К какому шагу относится проверка — по тому, что она проверяет. */
export function stepOf(rule: Rule): TrainStep {
  switch (rule.is) {
    case 'reqs':
    case 'numbers':
    case 'covered':
      return 'req';
    case 'routes':
      return 'api';
    case 'kind':
    case 'path':
    case 'schema':
      return 'design';
    case 'estimate':
      return 'estimate';
    /** Своё правило автора и любое отрицание — это уже разбор слабых мест. */
    default:
      return 'harden';
  }
}

export function checksOf(step: TrainStep, checks: Check[]): Check[] {
  return active(checks).filter((check) => stepOf(check.rule) === step);
}

/**
 * Пересчитана ли прикидка после вводной.
 *
 * Вводная меняет числа задачи, и старая прикидка перестаёт быть верной. Сам
 * текст правило проверить не может — сравниваем с тем, что было в момент
 * вводной: любая правка считается пересчётом, спорить с человеком о качестве
 * его арифметики песочница не будет.
 */
function recounted(design: Design): boolean {
  const mark = design.training.estimateMark;
  return mark === undefined || design.estimate.trim() !== mark.trim();
}

/**
 * Шаг закрыт, когда зелены его проверки. Последний шаг — исключение: вводная
 * ломает то, что было сделано раньше, и закрыть её, не починив остальное,
 * нельзя. Поэтому на «слабых местах» сходится вся доска целиком.
 */
export function stepDone(step: TrainStep, checks: Check[], passed: Record<string, boolean>, design: Design): boolean {
  if (step === 'harden')
    return active(checks).every((check) => passed[check.id]) && recounted(design);
  return checksOf(step, checks).every((check) => passed[check.id]);
}

export function nextStep(step: TrainStep): TrainStep | undefined {
  return TRAIN_STEPS[TRAIN_STEPS.indexOf(step) + 1];
}

/**
 * Итог, 0…100.
 *
 * Считается по весам проверок, а подсказка стоит очков: без цены её открывают
 * сразу все, и тренировка превращается в чтение ответов. Десятая часть за
 * подсказку, но не больше половины итога — человек, которому подсказали всё,
 * всё же что-то нарисовал сам.
 */
export function trainingScore(checks: Check[], passed: Record<string, boolean>, revealed: number): number {
  const list = active(checks);
  const total = list.reduce((sum, check) => sum + check.weight, 0);
  if (!total) return 0;
  const got = list.reduce((sum, check) => sum + (passed[check.id] ? check.weight : 0), 0);
  return Math.round((got / total) * 100 * (1 - Math.min(0.5, 0.1 * revealed)));
}

/**
 * Вводные — то, ради чего тренировка не чек-лист.
 *
 * Первая схема — не то, что проверяет собеседование; проверяет «а если
 * трафик вырастет в десять раз». Вводные общие, а не авторские: они цепляются
 * за категорию НФТ, а категории одни и те же во всех задачах.
 */
export interface Twist {
  id: NfrCategory;
}

export const TWISTS: Twist[] = [
  { id: 'throughput' },
  { id: 'availability' },
  { id: 'latency' },
  { id: 'consistency' },
  { id: 'cost' },
  { id: 'security' },
];

/**
 * Какая вводная прилетит: та, что бьёт по свойству, заявленному в сценарии.
 * Если категорий не проставили — про поток: он есть у любой системы.
 */
export function pickTwist(design: Design): Twist {
  const wanted = new Set(
    design.scenario.reference.requirements
      .concat(design.requirements)
      .map((item) => item.category)
      .filter(Boolean) as NfrCategory[],
  );
  const fresh = TWISTS.filter((twist) => !design.training.twists.includes(twist.id));
  return fresh.find((twist) => wanted.has(twist.id)) ?? fresh[0] ?? TWISTS[0];
}

/**
 * Вводная дописывает новое НФТ в доску и запоминает прикидку, какой она была.
 * Дальше всё случается само: требование не закрыто ни одним блоком — краснеет
 * проверка покрытия, а прикидка считается устаревшей, пока её не тронут.
 */
export function applyTwist(design: Design, twist: Twist, t: T): Design {
  const requirement: Requirement = {
    id: nextRequirementId(design, 'nfr'),
    kind: 'nfr',
    text: t(`twist.${twist.id}.req`),
    target: t(`twist.${twist.id}.target`),
    category: twist.id,
    covers: [],
  };
  return {
    ...design,
    requirements: [...design.requirements, requirement],
    training: {
      ...design.training,
      twists: [...design.training.twists, twist.id],
      estimateMark: design.estimate,
    },
  };
}

/**
 * Проверки, которые сценарий даёт тренировке. Пусто — выводим из эталона на
 * входе: сценарий мог быть написан до того, как тренировка появилась.
 */
export function runningChecks(design: Design): Check[] {
  return design.scenario.checks ?? [];
}

/** Одно попадание в отчёт: что проверяли, взято или нет. */
export interface ReportRow {
  check: Check;
  step: TrainStep;
  passed: boolean;
}

export function report(checks: Check[], passed: Record<string, boolean>): ReportRow[] {
  return active(checks)
    .map((check) => ({ check, step: stepOf(check.rule), passed: Boolean(passed[check.id]) }))
    .sort((a, b) => TRAIN_STEPS.indexOf(a.step) - TRAIN_STEPS.indexOf(b.step));
}

import { useEffect, useState } from 'react';
import { checkText, deriveChecks, evaluate } from './checks';
import {
  TRAIN_STEPS,
  compareToReference,
  emptyBoard,
  emptySession,
  emptyTraining,
  type Design,
  type TrainStep,
} from './model';
import {
  applyTwist,
  checksOf,
  nextStep,
  pickTwist,
  recounted,
  report,
  runningChecks,
  stepDone,
  trainingScore,
} from './train';
import { elapsed } from './scenario-panels';
import type { Tab } from './roles';
import type { T } from './i18n';

/**
 * Тренировка: собеседование без интервьюера.
 *
 * Ход прохождения — полоса над вкладками боковой панели, а не своя вкладка.
 * Вкладкой оно не работало: посмотреть, что проверяется на шаге, — уйти в
 * требования — вернуться посмотреть, зазеленело ли, — и так на каждом шаге.
 * Теперь шаги, проверки текущего шага и кнопка «дальше» видны всегда, а
 * вкладка под ними открывается сама на инструмент шага.
 *
 * Человек по-прежнему видит только проверки своего шага: весь список сразу
 * превратил бы прохождение в чек-лист. Эталон не показывается вовсе — до
 * отчёта, который после финиша занимает вкладку «Итог».
 */

/** Инструмент шага: вкладка, которая открывается сама при переходе на шаг. */
export const TOOL_OF_STEP: Record<TrainStep, Tab> = {
  req: 'req',
  api: 'api',
  /** Схему рисуют на полотне, а связывают с требованиями и описывают данные — в «Выбранном». */
  design: 'inspect',
  estimate: 'calc',
  /** Вводная дописала требование — его и надо увидеть первым. */
  harden: 'req',
};

const KEY = 'why:playground:train-folded';

function readFolded(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

type Update = (fn: (design: Design) => Design) => void;

interface Props {
  design: Design;
  update: Update;
  t: T;
  now: number;
  /** Прохождение перешло на шаг: открыть его инструмент. */
  onStep: (step: TrainStep) => void;
  /** Прохождение закончено: показать отчёт. */
  onFinish: () => void;
  /** Доска очищена и прохождение началось заново: сбросить выделение и полотно. */
  onReset: () => void;
}

/** Заново: доска и прохождение очищаются, задача остаётся. */
function restart(update: Update, t: T, onReset: () => void) {
  if (!confirm(t('train.againConfirm'))) return;
  update((current) => ({
    ...current,
    ...emptyBoard(),
    session: { ...emptySession(), startedAt: new Date().toISOString() },
    training: emptyTraining(),
  }));
  onReset();
}

export function TrainDock({ design, update, t, now, onStep, onFinish, onReset }: Props) {
  const { scenario, session, training } = design;
  const checks = runningChecks(design);
  const hasReference = scenario.reference.nodes.length > 0;
  const [folded, setFolded] = useState(readFolded);

  /**
   * Сценарий мог быть написан до того, как тренировка появилась, — тогда
   * проверок в нём нет. Выводим их из эталона один раз и кладём в проект:
   * дальше это обычные данные сценария, которые автор правит у себя.
   */
  useEffect(() => {
    if (!hasReference || scenario.checks?.length) return;
    update((current) => ({
      ...current,
      scenario: { ...current.scenario, checks: deriveChecks(current.scenario, t) },
    }));
  }, [hasReference, scenario.checks?.length, update, t]);

  if (!hasReference) {
    return (
      <div className="pg-dock pg-dock--idle">
        <p className="pg-hint pg-hint--empty">{t('train.noScenario')}</p>
      </div>
    );
  }

  const passed = evaluate(design, checks);
  const step = training.step;
  const done = stepDone(step, checks, passed, design);
  const running = Boolean(session.startedAt && !session.finishedAt);

  const start = () => {
    update((current) => ({
      ...current,
      session: { ...emptySession(), startedAt: new Date().toISOString() },
      training: emptyTraining(),
    }));
    onStep('req');
  };

  if (!session.startedAt) {
    return (
      <div className="pg-dock pg-dock--idle">
        <p className="pg-hint">{t('train.intro')}</p>
        <button type="button" className="pg-button pg-button--primary" onClick={start}>
          <i className="codicon codicon-play" aria-hidden="true" /> {t('train.start')}
        </button>
      </div>
    );
  }

  if (session.finishedAt) {
    return (
      <div className="pg-dock pg-dock--done">
        <span className="pg-dock__score">
          <strong>{training.score ?? 0}%</strong> {t('train.score').toLowerCase()}
        </span>
        <span className="pg-hint">{t('train.took', { time: elapsed(session, now) || '—' })}</span>
        <button type="button" className="pg-button" onClick={() => restart(update, t, onReset)}>
          <i className="codicon codicon-refresh" aria-hidden="true" /> {t('train.again')}
        </button>
      </div>
    );
  }

  /**
   * Переход на «слабые места» — момент вводной: первая схема почти всегда
   * выглядит хорошо, и проверяет собеседование как раз то, что будет дальше.
   */
  const advance = (skipping: boolean) => {
    const next = nextStep(step);
    if (!next) return;
    update((current) => {
      const moved: Design = {
        ...current,
        training: {
          ...current.training,
          step: next,
          skipped: skipping ? [...current.training.skipped, step] : current.training.skipped,
        },
      };
      return next === 'harden' && !moved.training.twists.length ? applyTwist(moved, pickTwist(moved), t) : moved;
    });
    onStep(next);
  };

  const finish = () => {
    update((current) => ({
      ...current,
      session: { ...current.session, finishedAt: new Date().toISOString() },
      training: {
        ...current.training,
        passed,
        score: trainingScore(checks, passed, current.session.revealed.length),
      },
    }));
    onFinish();
  };

  const reveal = () => {
    const next = scenario.hints.find((hint) => !session.revealed.includes(hint.id));
    if (!next) return;
    update((current) => ({
      ...current,
      session: { ...current.session, revealed: [...current.session.revealed, next.id] },
    }));
  };

  const toggle = () =>
    setFolded((value) => {
      try {
        localStorage.setItem(KEY, value ? '0' : '1');
      } catch {
        /* свёрнутость — удобство, не данные */
      }
      return !value;
    });

  const shown = step === 'harden' ? checks.filter((check) => !check.off) : checksOf(step, checks);
  const taken = shown.filter((check) => passed[check.id]).length;
  const twist = training.twists[training.twists.length - 1];
  const opened = scenario.hints.filter((hint) => session.revealed.includes(hint.id));
  const hintsLeft = scenario.hints.length - opened.length;
  /* Все открытые подсказки — в карточке задания над полотном; здесь только последняя. */
  const lastHint = opened[opened.length - 1];
  const index = TRAIN_STEPS.indexOf(step);
  const stepOf = t('train.stepOf', { n: String(index + 1), m: String(TRAIN_STEPS.length) });

  return (
    <section className="pg-dock" aria-label={t('role.trainee')}>
      <header className="pg-dock__head">
        <ol className="pg-stepper" aria-label={stepOf}>
          {TRAIN_STEPS.map((name, at) => {
            const state = training.skipped.includes(name)
              ? 'is-skipped'
              : at < index
                ? 'is-done'
                : at === index
                  ? 'is-on'
                  : '';
            return (
              <li
                key={name}
                className={`pg-stepper__step ${state}`}
                title={`${at + 1}. ${t(`train.step.${name}`)}`}
                aria-current={at === index ? 'step' : undefined}
              >
                {state === 'is-done' ? <i className="codicon codicon-check" aria-hidden="true" /> : at + 1}
              </li>
            );
          })}
        </ol>
        <span className="pg-dock__title" title={stepOf}>
          {t(`train.step.${step}`)}{' '}
          <span className={`pg-count ${done ? 'pg-count--good' : ''}`}>
            {taken}/{shown.length}
          </span>
        </span>
        <button
          type="button"
          className="pg-icon-button"
          aria-expanded={!folded}
          aria-label={t(folded ? 'train.unfold' : 'train.fold')}
          title={t(folded ? 'train.unfold' : 'train.fold')}
          onClick={toggle}
        >
          <i className={`codicon codicon-chevron-${folded ? 'down' : 'up'}`} aria-hidden="true" />
        </button>
      </header>

      {!folded && (
        <div className="pg-dock__body">
          {twist && (
            <div className="pg-twist">
              <strong>
                <i className="codicon codicon-flame" aria-hidden="true" /> {t('train.twist')}
              </strong>
              <p>{t(`twist.${twist}.note`)}</p>
            </div>
          )}

          <ul className="pg-checks pg-checks--dock">
            {shown.map((check) => (
              <li key={check.id} className={passed[check.id] ? 'is-done' : ''}>
                <i
                  className={`codicon codicon-${passed[check.id] ? 'pass-filled' : 'circle-large-outline'}`}
                  aria-hidden="true"
                />
                <span>{checkText(check, t)}</span>
                {check.weight > 1 && <span className="pg-count">×{check.weight}</span>}
              </li>
            ))}
          </ul>

          {step === 'harden' && !recounted(design) && <p className="pg-hint pg-hint--warn">{t('train.recount')}</p>}
          {!done && <p className="pg-hint">{t(step === 'harden' ? 'train.lockedLast' : 'train.locked')}</p>}
          {lastHint && (
            <p className="pg-dock__hint">
              <i className="codicon codicon-lightbulb" aria-hidden="true" /> {lastHint.text}
            </p>
          )}
        </div>
      )}

      <div className="pg-dock__actions">
        {step === 'harden' ? (
          /**
           * Завершить можно всегда: ворота последнего шага говорят, насколько
           * хорош ответ, а не разрешают ли выйти. Иначе пропущенный шаг
           * запирает человека в прохождении, которое нельзя закончить.
           */
          <button type="button" className="pg-button pg-button--primary" disabled={!running} onClick={finish}>
            <i className="codicon codicon-check-all" aria-hidden="true" /> {t('train.finish')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="pg-button pg-button--primary"
              disabled={!done}
              title={done ? undefined : t('train.locked')}
              onClick={() => advance(false)}
            >
              <i className="codicon codicon-arrow-right" aria-hidden="true" /> {t('train.next')}
            </button>
            <button
              type="button"
              className="pg-button"
              onClick={() => {
                if (confirm(t('train.skipConfirm'))) advance(true);
              }}
            >
              {t('train.skip')}
            </button>
          </>
        )}
        <button
          type="button"
          className="pg-button pg-dock__hint-button"
          disabled={!hintsLeft}
          title={t(hintsLeft ? 'train.hintCost' : scenario.hints.length ? 'train.hintsOut' : 'train.hintsNone')}
          onClick={reveal}
        >
          <i className="codicon codicon-lightbulb" aria-hidden="true" /> {t('train.hint')}
          {hintsLeft > 0 && <span className="pg-count">{hintsLeft}</span>}
        </button>
      </div>
    </section>
  );
}

/**
 * Отчёт: что взято, что нет и куда смотреть дальше. После финиша живёт во
 * вкладке «Итог» рядом с обычными вкладками доски.
 *
 * Счёт и снимок проверок берутся из прохождения, а не считаются заново: после
 * финиша доску можно трогать, и итог не должен меняться задним числом.
 */
export function TrainReport({
  design,
  update,
  t,
  now,
  onReset,
}: {
  design: Design;
  update: Update;
  t: T;
  now: number;
  onReset: () => void;
}) {
  const { scenario, session, training } = design;
  const passed = training.passed ?? {};
  const rows = report(runningChecks(design), passed);
  const missed = rows.filter((row) => !row.passed);
  const diff = compareToReference(design, scenario.reference);
  const unexplained = design.nodes.filter((node) => node.tech && !node.matrix?.options.length);

  return (
    <div className="pg-panel pg-report">
      <div className="pg-total">
        <span>{t('train.score')}</span>
        <strong>{training.score ?? 0}%</strong>
      </div>
      <p className="pg-hint">
        {t('train.took', { time: elapsed(session, now) || '—' })} · {t('train.tookHints', { n: String(session.revealed.length) })} ·{' '}
        {t('train.skippedSteps', { n: String(training.skipped.length) })}
      </p>

      {missed.length > 0 && (
        <section className="pg-req">
          <h3 className="pg-heading">
            {t('train.missed')} <span className="pg-count">{missed.length}</span>
          </h3>
          <ul className="pg-checks">
            {missed.map((row) => (
              <li key={row.check.id}>
                <i className="codicon codicon-circle-large-outline" aria-hidden="true" />
                <span>{checkText(row.check, t)}</span>
                <span className="pg-count">{t(`train.step.${row.step}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {diff.length > 0 && (
        <section className="pg-req">
          <h3 className="pg-heading">{t('train.refDiff')}</h3>
          <ul className="pg-findings">
            {diff.map((finding, index) => (
              <li key={index} className={`pg-finding pg-finding--${finding.level}`}>
                <i
                  className={`codicon codicon-${finding.level === 'warn' ? 'warning' : 'info'}`}
                  aria-hidden="true"
                />
                {t(finding.key, finding.params?.kind ? { ...finding.params, kind: t(`block.${finding.params.kind}`) } : finding.params)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {unexplained.length > 0 && (
        <p className="pg-hint pg-hint--warn">
          {t('train.tech', { blocks: unexplained.map((node) => node.label).join(', ') })}
        </p>
      )}

      {scenario.questions.length > 0 && (
        <section className="pg-req">
          <h3 className="pg-heading">{t('train.questions')}</h3>
          <ol className="pg-checklist">
            {scenario.questions.map((question) => (
              <li key={question.id}>
                <span>{question.text}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <button type="button" className="pg-button pg-button--wide" onClick={() => restart(update, t, onReset)}>
        <i className="codicon codicon-refresh" aria-hidden="true" /> {t('train.again')}
      </button>
    </div>
  );
}

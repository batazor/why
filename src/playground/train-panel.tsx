import { useEffect } from 'react';
import { deriveChecks, evaluate } from './checks';
import {
  TRAIN_STEPS,
  compareToReference,
  emptyBoard,
  emptySession,
  emptyTraining,
  type Design,
} from './model';
import {
  applyTwist,
  checksOf,
  nextStep,
  pickTwist,
  report,
  runningChecks,
  stepDone,
  trainingScore,
} from './train';
import { elapsed } from './scenario-panels';
import type { T } from './i18n';

/**
 * Вкладка «Тренировка»: собеседование без интервьюера.
 *
 * Человек видит только то, что происходит на его шаге: весь список проверок
 * сразу превратил бы прохождение в чек-лист, где задачу решают не думая, а
 * сверяясь. Эталон не показывается вовсе — до отчёта.
 */
interface Props {
  design: Design;
  update: (fn: (design: Design) => Design) => void;
  t: T;
  now: number;
  onReset: () => void;
}

export function TrainPanel({ design, update, t, now, onReset }: Props) {
  const { scenario, session, training } = design;
  const checks = runningChecks(design);
  const hasReference = scenario.reference.nodes.length > 0;

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
      <div className="pg-panel">
        <p className="pg-hint pg-hint--empty">{t('train.noScenario')}</p>
      </div>
    );
  }

  const passed = evaluate(design, checks);
  const step = training.step;
  const done = stepDone(step, checks, passed, design);
  const running = Boolean(session.startedAt && !session.finishedAt);
  const finished = Boolean(session.finishedAt);

  const start = () =>
    update((current) => ({
      ...current,
      session: { ...emptySession(), startedAt: new Date().toISOString() },
      training: emptyTraining(),
    }));

  const restart = () => {
    if (!confirm(t('train.againConfirm'))) return;
    update((current) => ({
      ...current,
      ...emptyBoard(),
      session: { ...emptySession(), startedAt: new Date().toISOString() },
      training: emptyTraining(),
    }));
    onReset();
  };

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
  };

  const finish = () =>
    update((current) => ({
      ...current,
      session: { ...current.session, finishedAt: new Date().toISOString() },
      training: {
        ...current.training,
        passed,
        score: trainingScore(checks, passed, current.session.revealed.length),
      },
    }));

  const reveal = () => {
    const next = scenario.hints.find((hint) => !session.revealed.includes(hint.id));
    if (!next) return;
    update((current) => ({
      ...current,
      session: { ...current.session, revealed: [...current.session.revealed, next.id] },
    }));
  };

  if (!session.startedAt) {
    return (
      <div className="pg-panel">
        <p className="pg-hint">{t('train.intro')}</p>
        <button type="button" className="pg-button pg-button--wide" onClick={start}>
          <i className="codicon codicon-play" aria-hidden="true" /> {t('train.start')}
        </button>
      </div>
    );
  }

  if (finished) return <Report design={design} t={t} now={now} onRestart={restart} />;

  const shown = step === 'harden' ? checks.filter((check) => !check.off) : checksOf(step, checks);
  const twist = training.twists[training.twists.length - 1];
  const hintsLeft = scenario.hints.filter((hint) => !session.revealed.includes(hint.id)).length;
  const opened = scenario.hints.filter((hint) => session.revealed.includes(hint.id));

  return (
    <div className="pg-panel pg-train">
      <Steps training={training} t={t} />

      {twist && (
        <section className="pg-twist">
          <h3 className="pg-heading">
            <i className="codicon codicon-flame" aria-hidden="true" /> {t('train.twist')}
          </h3>
          <p>{t(`twist.${twist}.note`)}</p>
        </section>
      )}

      <section className="pg-req">
        <h3 className="pg-heading">
          {t(step === 'harden' ? 'train.checksAll' : 'train.checks')}{' '}
          <span className="pg-count">
            {shown.filter((check) => passed[check.id]).length}/{shown.length}
          </span>
        </h3>
        <ul className="pg-checks">
          {shown.map((check) => (
            <li key={check.id} className={passed[check.id] ? 'is-done' : ''}>
              <i
                className={`codicon codicon-${passed[check.id] ? 'pass-filled' : 'circle-large-outline'}`}
                aria-hidden="true"
              />
              <span>{check.text}</span>
              {check.weight > 1 && <span className="pg-count">×{check.weight}</span>}
            </li>
          ))}
        </ul>
        {step === 'harden' && training.estimateMark !== undefined && design.estimate.trim() === training.estimateMark.trim() && (
          <p className="pg-hint pg-hint--warn">{t('train.recount')}</p>
        )}
      </section>

      <section className="pg-req">
        <h3 className="pg-heading">{t('scenario.hints')}</h3>
        <p className="pg-hint">{t('train.hintCost')}</p>
        <ol className="pg-checklist">
          {opened.map((hint) => (
            <li key={hint.id} className="is-done">
              <span>{hint.text}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="pg-button" disabled={!hintsLeft} onClick={reveal}>
          <i className="codicon codicon-lightbulb" aria-hidden="true" /> {t('train.hint')}
        </button>
        {!hintsLeft && (
          <p className="pg-hint pg-hint--empty">{t(scenario.hints.length ? 'train.hintsOut' : 'train.hintsNone')}</p>
        )}
      </section>

      <div className="pg-train__actions">
        {step === 'harden' ? (
          /**
           * Завершить можно всегда: ворота последнего шага говорят, насколько
           * хорош ответ, а не разрешают ли выйти. Иначе пропущенный шаг
           * запирает человека в прохождении, которое нельзя закончить.
           */
          <button type="button" className="pg-button pg-button--wide" disabled={!running} onClick={finish}>
            <i className="codicon codicon-check-all" aria-hidden="true" /> {t('train.finish')}
          </button>
        ) : (
          <>
            <button type="button" className="pg-button pg-button--wide" disabled={!done} onClick={() => advance(false)}>
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
      </div>
      {!done && <p className="pg-hint">{t(step === 'harden' ? 'train.lockedLast' : 'train.locked')}</p>}
    </div>
  );
}

function Steps({ training, t }: { training: Design['training']; t: T }) {
  const index = TRAIN_STEPS.indexOf(training.step);
  return (
    <ol className="pg-steps">
      {TRAIN_STEPS.map((step, at) => {
        const state = training.skipped.includes(step)
          ? 'is-skipped'
          : at < index
            ? 'is-done'
            : at === index
              ? 'is-on'
              : '';
        return (
          <li key={step} className={`pg-step ${state}`}>
            <span className="pg-step__num">{at + 1}</span>
            {t(`train.step.${step}`)}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Отчёт: что взято, что нет и куда смотреть дальше.
 *
 * Счёт и снимок проверок берутся из прохождения, а не считаются заново: после
 * финиша доску можно трогать, и итог не должен меняться задним числом.
 */
function Report({ design, t, now, onRestart }: { design: Design; t: T; now: number; onRestart: () => void }) {
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
                <span>{row.check.text}</span>
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

      <button type="button" className="pg-button pg-button--wide" onClick={onRestart}>
        <i className="codicon codicon-refresh" aria-hidden="true" /> {t('train.again')}
      </button>
    </div>
  );
}

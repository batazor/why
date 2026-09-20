import { ESTIMATE_MODES, uid, totalScore, type Design, type EstimateMode, type Scenario, type ScenarioItem, type Session } from './model';
import { deriveChecks, mergeChecks, type Check } from './checks';
import type { T } from './i18n';

type Update = (fn: (design: Design) => Design) => void;

interface Props {
  design: Design;
  update: Update;
  t: T;
}

const patchScenario = (update: Update, patch: Partial<Scenario>) =>
  update((design) => ({ ...design, scenario: { ...design.scenario, ...patch } }));

const patchSession = (update: Update, fn: (session: Session) => Partial<Session>) =>
  update((design) => ({ ...design, session: { ...design.session, ...fn(design.session) } }));

type ListKey = 'hints' | 'rubric' | 'questions';

/** Редактируемый список сценария: подсказки, критерии, вопросы устроены одинаково. */
function ItemList({ design, update, t, list }: Props & { list: ListKey }) {
  const items = design.scenario[list] as Array<ScenarioItem & { weight?: number }>;
  const set = (next: typeof items) => patchScenario(update, { [list]: next } as Partial<Scenario>);

  return (
    <section className="pg-req">
      <header className="pg-req__head">
        <h3 className="pg-heading">
          {t(`scenario.${list}`)} <span className="pg-count">{items.length}</span>
        </h3>
        <button
          type="button"
          className="pg-button pg-button--small"
          onClick={() => set([...items, { id: uid(list[0]), text: '', ...(list === 'rubric' ? { weight: 1 } : {}) }])}
        >
          + {t('req.add')}
        </button>
      </header>
      <p className="pg-hint">{t(`scenario.${list}Hint`)}</p>
      <ol className="pg-req__list">
        {items.map((item, index) => (
          <li className="pg-req__item" key={item.id}>
            <div className="pg-req__row">
              <span className="pg-req__id">{index + 1}</span>
              <textarea
                className="pg-input pg-textarea pg-req__text"
                rows={2}
                value={item.text}
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  set(items.map((other) => (other.id === item.id ? { ...other, text } : other)));
                }}
              />
              <button
                type="button"
                className="pg-icon-button"
                aria-label={t('req.remove')}
                title={t('req.remove')}
                onClick={() => set(items.filter((other) => other.id !== item.id))}
              >
                <i className="codicon codicon-trash" aria-hidden="true" />
              </button>
            </div>
            {list === 'rubric' && (
              <label className="pg-req__row pg-req__row--nfr pg-weight">
                {t('scenario.weight')}
                <select
                  className="pg-input pg-select"
                  value={item.weight ?? 1}
                  onChange={(event) => {
                    const weight = Number(event.currentTarget.value);
                    set(items.map((other) => (other.id === item.id ? { ...other, weight } : other)));
                  }}
                >
                  {[1, 2, 3].map((weight) => (
                    <option key={weight} value={weight}>
                      ×{weight}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Проверки тренировки: список, выведенный из эталона.
 *
 * Редактора правил здесь нет намеренно. Автор уже нарисовал решение — из него
 * всё и выводится; его дело — снять то, что в этой задаче не принципиально, и
 * поднять вес тому, без чего ответ не считается ответом.
 */
function ChecksEditor({ design, update, t }: Props) {
  const checks = design.scenario.checks ?? [];
  const set = (next: Check[]) => patchScenario(update, { checks: next });
  const on = checks.filter((check) => !check.off).length;

  return (
    <section className="pg-req">
      <header className="pg-req__head">
        <h3 className="pg-heading">
          {t('scenario.checks')}{' '}
          <span className="pg-count">{t('scenario.checksCount', { on: String(on), all: String(checks.length) })}</span>
        </h3>
        <button
          type="button"
          className="pg-button pg-button--small"
          disabled={!design.scenario.reference.nodes.length}
          onClick={() => set(mergeChecks(checks, deriveChecks(design.scenario, t)))}
        >
          <i className="codicon codicon-refresh" aria-hidden="true" /> {t('scenario.checksDerive')}
        </button>
      </header>
      <p className="pg-hint">{t('scenario.checksHint')}</p>
      {!checks.length && <p className="pg-hint pg-hint--empty">{t('scenario.checksEmpty')}</p>}
      <ol className="pg-checklist">
        {checks.map((check) => (
          <li key={check.id} className={check.off ? 'is-off' : ''}>
            <label className="pg-checklist__check">
              <input
                type="checkbox"
                checked={!check.off}
                onChange={(event) => {
                  const off = !event.currentTarget.checked;
                  set(checks.map((other) => (other.id === check.id ? { ...other, off } : other)));
                }}
              />
              <span>{check.text}</span>
            </label>
            <select
              className="pg-input pg-select pg-weight"
              aria-label={t('scenario.weight')}
              value={check.weight}
              disabled={check.off}
              onChange={(event) => {
                const weight = Number(event.currentTarget.value);
                set(checks.map((other) => (other.id === check.id ? { ...other, weight } : other)));
              }}
            >
              {[1, 2, 3].map((weight) => (
                <option key={weight} value={weight}>
                  ×{weight}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------------------------------------------------- Автор */

export function ScenarioPanel({ design, update, t }: Props) {
  return (
    <div className="pg-panel">
      <p className="pg-note">{t('scenario.intro')}</p>
      <div className="pg-field">
        <span className="pg-field__label">{t('scenario.candidateSees')}</span>
        <label className="pg-api__field">
          <span>{t('scenario.estimates')}</span>
          <select
            className="pg-input pg-select"
            value={design.calc.mode}
            onChange={(event) => {
              const mode = event.currentTarget.value as EstimateMode;
              update((current) => ({ ...current, calc: { ...current.calc, mode } }));
            }}
          >
            {ESTIMATE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`estimate.mode.${mode}`)}
              </option>
            ))}
          </select>
        </label>
        <p className="pg-hint">{t(`estimate.mode.${design.calc.mode}.hint`)}</p>
        <label className="pg-toggle pg-toggle--block">
          <input
            type="checkbox"
            checked={design.scenario.allowChecks}
            onChange={(event) => patchScenario(update, { allowChecks: event.currentTarget.checked })}
          />
          {t('scenario.allowChecks')}
        </label>
      </div>
      <label className="pg-field">
        <span className="pg-field__label">{t('scenario.guide')}</span>
        <textarea
          className="pg-input pg-textarea"
          rows={4}
          placeholder={t('scenario.guidePlaceholder')}
          value={design.scenario.guide}
          onChange={(event) => patchScenario(update, { guide: event.currentTarget.value })}
        />
      </label>
      <ItemList design={design} update={update} t={t} list="hints" />
      <ItemList design={design} update={update} t={t} list="rubric" />
      <ChecksEditor design={design} update={update} t={t} />
      <ItemList design={design} update={update} t={t} list="questions" />
    </div>
  );
}

/* ------------------------------------------------------ Интервьюер */

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((other) => other !== id) : [...list, id];
}

/**
 * Оценки в режиме «сначала текст»: интервьюер видит прикидку кандидата и
 * может открыть ему калькулятор. В момент открытия прикидка фиксируется —
 * потом видно, что человек сказал сам, а что посчитал.
 */
function EstimateControl({ design, update, t }: Props) {
  if (design.calc.mode !== 'text') return null;
  const unlocked = Boolean(design.session.calcUnlockedAt);
  return (
    <section className="pg-req">
      <h3 className="pg-heading">{t('tab.calc')}</h3>
      <p className="pg-hint">{t(unlocked ? 'conduct.calcOpen' : 'conduct.calcHint')}</p>
      <div className="pg-guide">
        <p>{design.estimate.trim() || t('estimate.beforeEmpty')}</p>
      </div>
      <button
        type="button"
        className={`pg-button pg-button--small ${unlocked ? 'is-on' : ''}`}
        onClick={() =>
          patchSession(update, () =>
            unlocked
              ? { calcUnlockedAt: undefined }
              : {
                  calcUnlockedAt: new Date().toISOString(),
                  // Снимок — только при первом открытии: закрыть и открыть
                  // снова не должно подменить сказанное до калькулятора.
                  estimateSnapshot: design.session.estimateSnapshot ?? design.estimate,
                },
          )
        }
      >
        <i className={`codicon codicon-${unlocked ? 'lock' : 'unlock'}`} aria-hidden="true" />{' '}
        {t(unlocked ? 'conduct.calcClose' : 'conduct.calcUnlock')}
      </button>
    </section>
  );
}

export function ConductPanel({ design, update, t }: Props) {
  const { scenario, session } = design;
  return (
    <div className="pg-panel">
      <EstimateControl design={design} update={update} t={t} />
      {scenario.guide.trim() && (
        <section className="pg-guide">
          <h3 className="pg-heading">{t('scenario.guide')}</h3>
          <p>{scenario.guide}</p>
        </section>
      )}

      <section className="pg-req">
        <h3 className="pg-heading">
          {t('scenario.hints')}{' '}
          <span className="pg-count">
            {session.revealed.length}/{scenario.hints.length}
          </span>
        </h3>
        <p className="pg-hint">{t('conduct.hintsHint')}</p>
        {!scenario.hints.length && <p className="pg-hint pg-hint--empty">{t('conduct.none')}</p>}
        <ol className="pg-checklist">
          {scenario.hints.map((hint) => {
            const open = session.revealed.includes(hint.id);
            return (
              <li key={hint.id} className={open ? 'is-done' : ''}>
                <span>{hint.text}</span>
                <button
                  type="button"
                  className={`pg-button pg-button--small ${open ? 'is-on' : ''}`}
                  onClick={() => patchSession(update, (current) => ({ revealed: toggle(current.revealed, hint.id) }))}
                >
                  <i className={`codicon codicon-${open ? 'eye' : 'eye-closed'}`} aria-hidden="true" />
                  {t(open ? 'conduct.hide' : 'conduct.reveal')}
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="pg-req">
        <h3 className="pg-heading">
          {t('scenario.questions')}{' '}
          <span className="pg-count">
            {session.asked.length}/{scenario.questions.length}
          </span>
        </h3>
        {!scenario.questions.length && <p className="pg-hint pg-hint--empty">{t('conduct.none')}</p>}
        <ol className="pg-checklist">
          {scenario.questions.map((question) => {
            const asked = session.asked.includes(question.id);
            return (
              <li key={question.id} className={asked ? 'is-done' : ''}>
                <label className="pg-checklist__check">
                  <input
                    type="checkbox"
                    checked={asked}
                    onChange={() => patchSession(update, (current) => ({ asked: toggle(current.asked, question.id) }))}
                  />
                  <span>{question.text}</span>
                </label>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

const LEVELS = [0, 1, 2, 3];

export function ScorePanel({ design, update, t }: Props) {
  const { scenario, session } = design;
  const total = totalScore(scenario.rubric, session.scores);
  return (
    <div className="pg-panel">
      <div className="pg-total">
        <span>{t('score.total')}</span>
        <strong>{total === null ? '—' : `${total}%`}</strong>
      </div>
      {!scenario.rubric.length && <p className="pg-hint pg-hint--empty">{t('conduct.none')}</p>}
      <ol className="pg-rubric">
        {scenario.rubric.map((item) => (
          <li key={item.id}>
            <span className="pg-rubric__text">
              {item.text}
              {item.weight > 1 && <span className="pg-count">×{item.weight}</span>}
            </span>
            <span className="pg-rubric__levels" role="radiogroup" aria-label={item.text}>
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={session.scores[item.id] === level}
                  title={t(`score.level${level}`)}
                  className={`pg-level pg-level--${level} ${session.scores[item.id] === level ? 'is-on' : ''}`}
                  onClick={() =>
                    patchSession(update, (current) => {
                      const scores = { ...current.scores };
                      // Повторный щелчок снимает оценку: «не оценено» ≠ «ноль».
                      if (scores[item.id] === level) delete scores[item.id];
                      else scores[item.id] = level;
                      return { scores };
                    })
                  }
                >
                  {level}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ol>
      <p className="pg-hint">{t('score.legend')}</p>
      <label className="pg-field pg-field--grow">
        <span className="pg-field__label">{t('score.notes')}</span>
        <textarea
          className="pg-input pg-textarea pg-textarea--task"
          placeholder={t('score.notesPlaceholder')}
          value={session.notes}
          onChange={(event) => {
            const notes = event.currentTarget.value;
            patchSession(update, () => ({ notes }));
          }}
        />
      </label>
    </div>
  );
}

/** Таймер сессии: сколько идёт собеседование. Тикает раз в секунду, пока не остановлен. */
export function elapsed(session: Session, now: number): string {
  if (!session.startedAt) return '';
  const end = session.finishedAt ? Date.parse(session.finishedAt) : now;
  const seconds = Math.max(0, Math.floor((end - Date.parse(session.startedAt)) / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

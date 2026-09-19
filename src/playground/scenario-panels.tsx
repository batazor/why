import { uid, totalScore, type Design, type Scenario, type ScenarioItem, type Session } from './model';
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

/* ---------------------------------------------------------- Автор */

export function ScenarioPanel({ design, update, t }: Props) {
  return (
    <div className="pg-panel">
      <p className="pg-note">{t('scenario.intro')}</p>
      <div className="pg-field">
        <span className="pg-field__label">{t('scenario.candidateSees')}</span>
        <label className="pg-toggle pg-toggle--block">
          <input
            type="checkbox"
            checked={design.calc.enabled}
            onChange={(event) => {
              const enabled = event.currentTarget.checked;
              update((current) => ({ ...current, calc: { ...current.calc, enabled } }));
            }}
          />
          {t('scenario.allowCalc')}
        </label>
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
      <ItemList design={design} update={update} t={t} list="questions" />
    </div>
  );
}

/* ------------------------------------------------------ Интервьюер */

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((other) => other !== id) : [...list, id];
}

export function ConductPanel({ design, update, t }: Props) {
  const { scenario, session } = design;
  return (
    <div className="pg-panel">
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

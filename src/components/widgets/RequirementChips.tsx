import { requirementsAt, type RequirementsData } from '../../code/widgets';
import { place, useRequirements } from './requirements-store';

/**
 * Требования шага — карточками под его текстом.
 *
 * Их тащат в таблицу справа или добавляют щелчком: мышью наглядно, но без неё
 * разбор не должен закрываться. Положенная карточка остаётся на месте с
 * пометкой — по ней видно, что из шага уже в документе, а что нет.
 */

/** Тип данных при перетаскивании: чужой перенос таблица не примет. */
export const DRAG_TYPE = 'text/x-why-requirement';

interface Props {
  step: string;
  data: RequirementsData;
  labels: Record<string, string>;
}

export default function RequirementChips({ step, data, labels }: Props) {
  const { placed } = useRequirements(data.name);
  const text = (key: string) => labels[key] ?? key;

  const items = requirementsAt(data, step);
  if (!items.length) return null;

  const done = (keys: string[]) => keys.every((key) => placed.has(key));
  const left = items.filter((item) => !done(item.keys));

  return (
    <div className="req-chips">
      <span className="req-chips__label">{text('req.chips')}</span>

      <ul className="req-chips__list">
        {items.map((item) => {
          const inTable = done(item.keys);
          const body = item.goalOnly
            ? `${text('req.goal')}: ${text(`req.goal.${item.row.id}`)}`
            : text(`req.text.${item.row.id}`);

          return (
            <li key={item.row.id}>
              <button
                className={`req-chip req-chip--${item.row.kind} ${inTable ? 'is-placed' : ''}`}
                type="button"
                draggable={!inTable}
                disabled={inTable}
                onDragStart={(event) => {
                  event.dataTransfer.setData(DRAG_TYPE, item.keys.join(' '));
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => place(data.name, item.keys)}
              >
                {!inTable && (
                  <span className="req-chip__grip" aria-hidden="true">
                    ⠿
                  </span>
                )}
                <span className="req-chip__id">{item.row.id}</span>
                <span className="req-chip__text">{body}</span>
                {inTable && <span className="req-chip__done">✓ {text('req.placed')}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {left.length > 1 && (
        <button
          className="req-chips__all"
          type="button"
          onClick={() => place(data.name, left.flatMap((item) => item.keys))}
        >
          {text('req.addAll')}
        </button>
      )}
    </div>
  );
}

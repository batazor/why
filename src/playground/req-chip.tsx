import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Requirement } from './model';
import type { T } from './i18n';

/**
 * Чип требования с подсказкой.
 *
 * Номер сам по себе ничего не говорит: «FR-2» — это что? Нативный title
 * приходит через секунду, и его не замечают. Поэтому текст требования
 * всплывает сразу — при наведении и при фокусе с клавиатуры.
 *
 * Подсказка рисуется через портал поверх всего: боковая панель
 * прокручивается, и подсказка внутри неё упиралась бы в её край.
 */
export function ReqChip({
  item,
  t,
  on,
  label,
  onClick,
}: {
  item: Requirement;
  t: T;
  /** Переключатель: чип «включён». Без этого — просто кнопка. */
  on?: boolean;
  label?: ReactNode;
  onClick: () => void;
}) {
  const [at, setAt] = useState<{ x: number; y: number; below: boolean } | null>(null);

  const show = (event: SyntheticEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // У верхнего края окна места сверху нет — тогда под чипом.
    const below = rect.top < 96;
    // Подсказка до 18rem шириной: у края окна её центр сдвигается внутрь.
    const half = 9 * 16 + 8;
    const x = Math.min(Math.max(rect.left + rect.width / 2, half), window.innerWidth - half);
    setAt({ x, y: below ? rect.bottom + 6 : rect.top - 6, below });
  };
  const hide = () => setAt(null);

  return (
    <>
      <button
        type="button"
        className={`pg-chip ${on ? 'is-on' : ''}`}
        aria-pressed={on === undefined ? undefined : on}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        // Прокрутка под курсором уводит чип, а подсказка осталась бы висеть на старом месте.
        onWheel={hide}
        onClick={onClick}
      >
        {label ?? item.id}
      </button>
      {at &&
        createPortal(
          <span role="tooltip" className={`pg-tip ${at.below ? 'pg-tip--below' : ''}`} style={{ left: at.x, top: at.y }}>
            <span className="pg-tip__id">{item.id}</span>
            {item.text ? <span>{item.text}</span> : <em>{t('req.text')}</em>}
            {item.kind === 'nfr' && item.target && <span className="pg-tip__target">{item.target}</span>}
          </span>,
          document.body,
        )}
    </>
  );
}

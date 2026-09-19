/**
 * Рукописная стрелка стикера-пометки. Общая для схем React Flow и кадров
 * LikeC4: стикер на обеих схемах один и тот же, и рисоваться он обязан
 * одинаково.
 */
export default function NoteArrow() {
  return (
    <svg className="fnote__arrow-svg" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M 37 33 C 18 33 7 26 7 9" />
      <path d="M 2 15 L 7 6 L 12 15" />
    </svg>
  );
}

import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getSmoothStepPath,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
  type Node,
} from '@xyflow/react';

/**
 * Связь, которая сама выбирает, к какой грани блока цепляться.
 *
 * Блоки в песочнице разного размера и растут по ходу работы: у блока
 * появляются номера требований, таблицы схемы, название технологии. Связь,
 * прибитая к ручке, после этого упирается в середину карточки или петляет
 * вокруг неё. Поэтому точка входа считается на лету: берётся прямая между
 * центрами блоков, и связь входит там, где эта прямая пересекает рамку.
 *
 * Линия ортогональная со скруглениями — так схема читается как схема, а не
 * как клубок кривых: в архитектуре важно «откуда куда», а не красота дуги.
 */

/** Где прямая между центрами пересекает рамку блока. */
function borderPoint(node: InternalNode<Node>, towards: { x: number; y: number }) {
  const width = node.measured?.width ?? 180;
  const height = node.measured?.height ?? 60;
  const cx = node.internals.positionAbsolute.x + width / 2;
  const cy = node.internals.positionAbsolute.y + height / 2;

  const dx = towards.x - cx;
  const dy = towards.y - cy;
  if (!dx && !dy) return { x: cx, y: cy, side: Position.Right };

  // Сравнение наклонов: по какой грани выйдет прямая — по боковой или по
  // верхней/нижней. Вертикальная прямая (dx = 0) уходит в бесконечность,
  // поэтому её случай решается отдельно.
  const byVertical = dx === 0 || Math.abs(dy / dx) > height / width;
  if (byVertical) {
    const y = dy > 0 ? cy + height / 2 : cy - height / 2;
    return { x: cx + (dx * (height / 2)) / Math.abs(dy), y, side: dy > 0 ? Position.Bottom : Position.Top };
  }
  const x = dx > 0 ? cx + width / 2 : cx - width / 2;
  return { x, y: cy + (dy * (width / 2)) / Math.abs(dx), side: dx > 0 ? Position.Right : Position.Left };
}

function center(node: InternalNode<Node>) {
  return {
    x: node.internals.positionAbsolute.x + (node.measured?.width ?? 180) / 2,
    y: node.internals.positionAbsolute.y + (node.measured?.height ?? 60) / 2,
  };
}

export default function FloatingEdge({ id, source, target, markerEnd, style, label, selected }: EdgeProps) {
  const from = useInternalNode(source);
  const to = useInternalNode(target);
  if (!from || !to) return null;

  const start = borderPoint(from, center(to));
  const end = borderPoint(to, center(from));

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: start.x,
    sourceY: start.y,
    sourcePosition: start.side,
    targetX: end.x,
    targetY: end.y,
    targetPosition: end.side,
    borderRadius: 14,
    // Короткий отвод от блока: линия отходит перпендикулярно грани, и сразу
    // видно, из какого блока она вышла.
    offset: 18,
  });

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label && (
        // Подпись рисуется отдельным слоем поверх схемы: в SVG она пряталась
        // под соседними блоками.
        <EdgeLabelRenderer>
          <div
            className={`pg-edge-label ${selected ? 'is-selected' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

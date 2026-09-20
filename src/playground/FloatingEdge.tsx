import { useMemo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getSmoothStepPath,
  useEdges,
  useNodes,
  type Edge,
  type EdgeProps,
  type Node,
  type XYPosition,
} from '@xyflow/react';
import {
  getFloatingEdgeParams,
  getSmartEdge,
  pathfindingJumpPointNoDiagonal,
  svgDrawSmoothStepLinePath,
} from '@tisoap/react-flow-smart-edge';

/**
 * Связь, которая сама выбирает грань, разводит соседей по ней и обходит
 * блоки — но только когда есть что обходить.
 *
 * Три решения, каждое из-за своей беды:
 *
 * 1. Грань выбирается по взаимному положению блоков, а не по ручке: блоки
 *    двигают и растят номерами требований, и прибитая ручка уводит линию в
 *    середину чужой карточки.
 * 2. Точка входа — не середина грани, а своя у каждой связи: две линии,
 *    входящие в один блок с одной стороны, иначе сливаются в одну.
 * 3. Поиск пути включается, только если прямая ступенька перекрыта. A* ходит
 *    по сетке и на ровном месте добавляет изломы, которых глаз не ждёт.
 */

const DRAW = {
  drawEdge: svgDrawSmoothStepLinePath({ borderRadius: 12 }),
  generatePath: pathfindingJumpPointNoDiagonal,
};

/**
 * Две попытки обхода. Сначала просторная: крупная сетка даёт меньше ступенек,
 * широкий зазор — воздух вокруг блоков. Если прохода с такими требованиями
 * нет (коридор между блоками уже зазора), вторая попытка идёт впритирку:
 * тесный обход всё равно лучше прямой сквозь чужую карточку.
 */
const ATTEMPTS = [
  { ...DRAW, nodePadding: 26, gridRatio: 40 },
  { ...DRAW, nodePadding: 10, gridRatio: 16 },
];

/** Отступ от угла блока: в самый угол линию заводить некрасиво. */
const SIDE_MARGIN = 16;

const horizontal = (side: Position) => side === Position.Left || side === Position.Right;

function box(node: Node) {
  const width = node.measured?.width ?? 200;
  const height = node.measured?.height ?? 90;
  return { x: node.position.x, y: node.position.y, width, height };
}

/**
 * Точка входа на грани: связи, приходящие в одну сторону блока, делят её
 * между собой поровну. Порядок — по положению собеседника вдоль грани, чтобы
 * линии не перехлёстывались у самого блока.
 */
function pointOnSide(node: Node, side: Position, index: number, total: number): XYPosition {
  const { x, y, width, height } = box(node);
  const along = horizontal(side) ? height : width;
  const free = Math.max(0, along - SIDE_MARGIN * 2);
  const shift = SIDE_MARGIN + (free * (index + 1)) / (total + 1);
  if (side === Position.Left) return { x, y: y + shift };
  if (side === Position.Right) return { x: x + width, y: y + shift };
  if (side === Position.Top) return { x: x + shift, y };
  return { x: x + shift, y: y + height };
}

interface Attachment {
  start: XYPosition;
  end: XYPosition;
  sourceSide: Position;
  targetSide: Position;
}

/**
 * Куда какая связь цепляется — считается разом для всей схемы: чтобы развести
 * связи по грани, надо знать всех её соседей.
 */
function attachments(nodes: Node[], edges: Edge[]): Map<string, Attachment> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sides = new Map<string, { edgeId: string; end: 'source' | 'target'; side: Position; node: Node }>();
  const groups = new Map<string, Array<{ key: string; order: number }>>();

  // Порядок связей фиксирован: иначе одна и та же схема разложилась бы
  // по-разному от перерисовки к перерисовке.
  for (const edge of [...edges].sort((a, b) => a.id.localeCompare(b.id))) {
    const from = byId.get(edge.source);
    const to = byId.get(edge.target);
    if (!from || !to || !from.measured?.width || !to.measured?.width) continue;

    const { sourcePos, targetPos } = getFloatingEdgeParams(from, to);
    const ends = [
      { end: 'source' as const, node: from, other: to, side: sourcePos },
      { end: 'target' as const, node: to, other: from, side: targetPos },
    ];
    for (const item of ends) {
      const key = `${edge.id}:${item.end}`;
      sides.set(key, { edgeId: edge.id, end: item.end, side: item.side, node: item.node });
      const other = box(item.other);
      const group = `${item.node.id}:${item.side}`;
      groups.set(group, [
        ...(groups.get(group) ?? []),
        // Вдоль боковой грани соседей упорядочивает высота собеседника,
        // вдоль верхней и нижней — его горизонталь.
        { key, order: horizontal(item.side) ? other.y + other.height / 2 : other.x + other.width / 2 },
      ]);
    }
  }

  const spot = new Map<string, XYPosition>();
  for (const [group, items] of groups) {
    const sorted = [...items].sort((a, b) => a.order - b.order);
    sorted.forEach((item, index) => {
      const info = sides.get(item.key)!;
      spot.set(item.key, pointOnSide(info.node, info.side, index, sorted.length));
    });
    void group;
  }

  const result = new Map<string, Attachment>();
  for (const edge of edges) {
    const start = spot.get(`${edge.id}:source`);
    const end = spot.get(`${edge.id}:target`);
    const sourceSide = sides.get(`${edge.id}:source`)?.side;
    const targetSide = sides.get(`${edge.id}:target`)?.side;
    if (start && end && sourceSide && targetSide) result.set(edge.id, { start, end, sourceSide, targetSide });
  }
  return result;
}

/** Пересекает ли отрезок прямоугольник — грубо, по выборке точек вдоль него. */
function segmentHitsBox(a: XYPosition, b: XYPosition, rect: { x: number; y: number; width: number; height: number }, pad: number) {
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    if (x > rect.x - pad && x < rect.x + rect.width + pad && y > rect.y - pad && y < rect.y + rect.height + pad) return true;
  }
  return false;
}

/** Точка в стороне от грани: линия отходит от блока перпендикулярно. */
function stepOut(point: XYPosition, side: Position, distance: number): XYPosition {
  if (side === Position.Left) return { x: point.x - distance, y: point.y };
  if (side === Position.Right) return { x: point.x + distance, y: point.y };
  if (side === Position.Top) return { x: point.x, y: point.y - distance };
  return { x: point.x, y: point.y + distance };
}

/**
 * Объезд поверху или понизу — запасной путь, когда поиск по сетке сдался.
 * Сетка строится между концами связи, и обход, которому нужно выйти за эту
 * рамку, ей не даётся; а прямая линия при этом идёт сквозь чужие карточки.
 * Тогда линия просто уходит в свободную полосу над мешающими блоками или под
 * ними и возвращается к цели.
 */
function detour(start: XYPosition, end: XYPosition, sourceSide: Position, targetSide: Position, blockers: Array<{ x: number; y: number; width: number; height: number }>): XYPosition[] {
  const exit = stepOut(start, sourceSide, 30);
  const entry = stepOut(end, targetSide, 30);
  const above = Math.min(...blockers.map((rect) => rect.y)) - 45;
  const below = Math.max(...blockers.map((rect) => rect.y + rect.height)) + 45;
  // Полоса выбирается та, до которой линии ближе идти.
  const up = Math.abs(above - exit.y) + Math.abs(above - entry.y);
  const down = Math.abs(below - exit.y) + Math.abs(below - entry.y);
  const lane = up <= down ? above : below;
  return [start, exit, { x: exit.x, y: lane }, { x: entry.x, y: lane }, entry, end];
}

/** Ломаная со скруглёнными углами: те же скругления, что у остальных связей. */
function roundedPath(points: XYPosition[], radius = 12): string {
  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const before = Math.min(radius, Math.hypot(corner.x - previous.x, corner.y - previous.y) / 2);
    const after = Math.min(radius, Math.hypot(next.x - corner.x, next.y - corner.y) / 2);
    const from = {
      x: corner.x + Math.sign(previous.x - corner.x) * before,
      y: corner.y + Math.sign(previous.y - corner.y) * before,
    };
    const to = { x: corner.x + Math.sign(next.x - corner.x) * after, y: corner.y + Math.sign(next.y - corner.y) * after };
    parts.push(`L ${from.x} ${from.y}`, `Q ${corner.x} ${corner.y} ${to.x} ${to.y}`);
  }
  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(' ');
}

/**
 * Точки пути из его же строки SVG.
 *
 * Проверять на препятствия надо именно нарисованную линию. Моделировать её
 * по сторонам бесполезно: React Flow ставит колено не посередине, а рядом с
 * целью, и модель разошлась с картинкой — линия шла сквозь два блока, а
 * проверка считала путь свободным.
 */
function pathPoints(path: string): XYPosition[] {
  const points: XYPosition[] = [];
  for (const [, command, body] of path.matchAll(/([MLQ])([^MLQ]*)/g)) {
    const numbers = (body.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    // У дуги Q первая пара — угол, к которому линия и прижимается.
    for (let i = 0; i + 1 < (command === 'Q' ? 2 : numbers.length); i += 2) {
      points.push({ x: numbers[i], y: numbers[i + 1] });
    }
  }
  return points;
}

export default function FloatingEdge({ id, markerEnd, style, label, selected }: EdgeProps) {
  const nodes = useNodes();
  const edges = useEdges();

  const route = useMemo(() => {
    const attachment = attachments(nodes as Node[], edges).get(id);
    if (!attachment) return null;
    const { start, end, sourceSide, targetSide } = attachment;

    const straight = () => {
      const [path, x, y] = getSmoothStepPath({
        sourceX: start.x,
        sourceY: start.y,
        sourcePosition: sourceSide,
        targetX: end.x,
        targetY: end.y,
        targetPosition: targetSide,
        borderRadius: 12,
      });
      return { path, x, y };
    };

    const edge = edges.find((item) => item.id === id);
    const others = (nodes as Node[])
      .filter((node) => node.id !== edge?.source && node.id !== edge?.target)
      .map(box);

    /** Какие блоки задевает нарисованный путь. */
    const crossed = (path: string) => {
      const corners = pathPoints(path);
      return others.filter((rect) =>
        corners.some((point, index) => corners[index + 1] && segmentHitsBox(point, corners[index + 1], rect, 12)),
      );
    };

    const plain = straight();
    const blockers = crossed(plain.path);
    if (!blockers.length) return plain;

    for (const options of ATTEMPTS) {
      const smart = getSmartEdge({
        sourceX: start.x,
        sourceY: start.y,
        targetX: end.x,
        targetY: end.y,
        sourcePosition: sourceSide,
        targetPosition: targetSide,
        nodes: nodes as Node[],
        options,
      });
      // Найденный путь тоже проверяется: поиск иногда возвращает маршрут
      // прямо сквозь карточку, и верить ему на слово нельзя.
      if (!(smart instanceof Error) && !crossed(smart.svgPathString).length) {
        return { path: smart.svgPathString, x: smart.edgeCenterX, y: smart.edgeCenterY };
      }
    }
    const points = detour(start, end, sourceSide, targetSide, blockers);
    const middle = points[Math.floor(points.length / 2)];
    return { path: roundedPath(points), x: middle.x, y: middle.y };
    return plain;
  }, [nodes, edges, id]);

  if (!route) return null;

  return (
    <>
      <BaseEdge id={id} path={route.path} markerEnd={markerEnd} style={style} />
      {label && (
        // Подпись рисуется отдельным слоем поверх схемы: в SVG она пряталась
        // под соседними блоками.
        <EdgeLabelRenderer>
          <div
            className={`pg-edge-label ${selected ? 'is-selected' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${route.x}px, ${route.y}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

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

/**
 * Связь в нотации карты контекстов (DDD): вместо стрелки — метки U и D на
 * концах. Кладётся в `data` связи; у обычной стрелки вызова `data` пуст.
 */
export interface ContextEnds {
  /** Какой конец связи — upstream. */
  upstream: 'source' | 'target';
  /** Паттерны отношений на концах: OHS, PL, ACL, CF. */
  upstreamPattern?: string;
  downstreamPattern?: string;
}

/** Зазор между рамкой блока и меткой: метка не должна липнуть к рамке. */
const MARK_GAP = 5;
/** Высота метки — как задано в .pg-edge-mark. */
const MARK_HEIGHT = 18;
const LABEL_HEIGHT = 20;

interface Mark {
  letter: 'U' | 'D';
  pattern: string;
}

const contextOf = (data: unknown) => (data as { context?: ContextEnds } | undefined)?.context;

function markFor(context: ContextEnds, end: 'source' | 'target'): Mark {
  const up = context.upstream === end;
  return { letter: up ? 'U' : 'D', pattern: (up ? context.upstreamPattern : context.downstreamPattern)?.trim() ?? '' };
}

/**
 * Ширина метки и подписи — прикидкой по числу знаков. Замерять DOM ради того,
 * чтобы развести плашки, незачем: нужна не точность, а порядок величины.
 */
const markWidth = (mark: Mark) => MARK_HEIGHT + (mark.pattern ? 4 + mark.pattern.length * 6.4 : 0);
const labelWidth = (text: string) => 14 + text.length * 6.2;

/** Метка растёт от блока наружу: какой бы ширины ни была, на рамку не наедет. */
const MARK_ANCHOR: Record<Position, string> = {
  [Position.Left]: 'translate(-100%, -50%)',
  [Position.Right]: 'translate(0, -50%)',
  [Position.Top]: 'translate(-50%, -100%)',
  [Position.Bottom]: 'translate(-50%, 0)',
};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Прямоугольник метки на схеме — тот же, что получится из MARK_ANCHOR. */
function markRect(point: XYPosition, side: Position, mark: Mark): Rect {
  const width = markWidth(mark);
  const x = side === Position.Left ? point.x - width : side === Position.Right ? point.x : point.x - width / 2;
  const y = side === Position.Top ? point.y - MARK_HEIGHT : side === Position.Bottom ? point.y : point.y - MARK_HEIGHT / 2;
  return { x, y, width, height: MARK_HEIGHT };
}

const overlap = (a: Rect, b: Rect, pad = 2) =>
  a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;

/** Точка на ломаной на заданном расстоянии от её начала. */
function pointAlong(points: XYPosition[], distance: number): XYPosition {
  let left = distance;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > 0 && left <= length) return { x: a.x + ((b.x - a.x) * left) / length, y: a.y + ((b.y - a.y) * left) / length };
    left -= length;
  }
  return points[points.length - 1];
}

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
  /** На сколько метку карты контекстов отодвинуть от рамки вдоль линии. */
  sourceShift: number;
  targetShift: number;
}

/**
 * Куда какая связь цепляется — считается разом для всей схемы: чтобы развести
 * связи по грани, надо знать всех её соседей.
 */
function attachments(nodes: Node[], edges: Edge[]): Map<string, Attachment> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sides = new Map<string, { edgeId: string; end: 'source' | 'target'; side: Position; node: Node }>();
  const groups = new Map<string, Array<{ key: string; order: number; mark: Mark | null }>>();

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
        { key, order: horizontal(item.side) ? other.y + other.height / 2 : other.x + other.width / 2, mark: contextOf(edge.data) ? markFor(contextOf(edge.data)!, item.end) : null },
      ]);
    }
  }

  const spot = new Map<string, XYPosition>();
  const shifts = new Map<string, number>();
  for (const [group, items] of groups) {
    const sorted = [...items].sort((a, b) => a.order - b.order);
    sorted.forEach((item, index) => {
      const info = sides.get(item.key)!;
      spot.set(item.key, pointOnSide(info.node, info.side, index, sorted.length));
    });
    void group;

    /**
     * Метки соседних связей на тесной грани слиплись бы в пятно: у блока в
     * 56 px три линии входят через 6 px, а метка — 18. Тогда метки встают
     * лесенкой: каждая следующая — дальше от рамки на длину предыдущей.
     */
    const marked = sorted.filter((item) => item.mark);
    if (marked.length < 2) continue;
    const { node, side } = sides.get(marked[0].key)!;
    const size = box(node);
    const along = horizontal(side) ? size.height : size.width;
    const spacing = Math.max(0, along - SIDE_MARGIN * 2) / (sorted.length + 1);
    // Поперёк линии метка занимает высоту на боковой грани и ширину на верхней и нижней.
    const across = horizontal(side) ? MARK_HEIGHT : Math.max(...marked.map((item) => markWidth(item.mark!)));
    if (spacing >= across + 2) continue;
    let shift = 0;
    for (const item of marked) {
      shifts.set(item.key, shift);
      shift += (horizontal(side) ? markWidth(item.mark!) : MARK_HEIGHT) + 3;
    }
  }

  const result = new Map<string, Attachment>();
  for (const edge of edges) {
    const start = spot.get(`${edge.id}:source`);
    const end = spot.get(`${edge.id}:target`);
    const sourceSide = sides.get(`${edge.id}:source`)?.side;
    const targetSide = sides.get(`${edge.id}:target`)?.side;
    if (start && end && sourceSide && targetSide)
      result.set(edge.id, {
        start,
        end,
        sourceSide,
        targetSide,
        sourceShift: shifts.get(`${edge.id}:source`) ?? 0,
        targetShift: shifts.get(`${edge.id}:target`) ?? 0,
      });
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

export default function FloatingEdge({ id, markerEnd, style, label, selected, data }: EdgeProps) {
  const nodes = useNodes();
  const edges = useEdges();

  const route = useMemo(() => {
    const attachment = attachments(nodes as Node[], edges).get(id);
    if (!attachment) return null;
    const { start, end, sourceSide, targetSide } = attachment;
    /** Концы едут вместе с путём: по ним ставятся метки карты контекстов. */
    const done = (line: { path: string; x: number; y: number }) => ({ ...line, attachment });

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
    if (!blockers.length) return done(plain);

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
        return done({ path: smart.svgPathString, x: smart.edgeCenterX, y: smart.edgeCenterY });
      }
    }
    const points = detour(start, end, sourceSide, targetSide, blockers);
    const middle = points[Math.floor(points.length / 2)];
    return done({ path: roundedPath(points), x: middle.x, y: middle.y });
  }, [nodes, edges, id]);

  const context = contextOf(data);

  /**
   * Метки U и D и место подписи. Метка стоит на самой линии у рамки блока —
   * точка берётся с нарисованного пути, а не по стороне: отодвинутая лесенкой
   * метка иначе повисла бы в стороне от линии, ушедшей за поворот.
   */
  const marks = useMemo(() => {
    if (!route || !context) return null;
    const { sourceSide, targetSide, sourceShift, targetShift } = route.attachment;
    const corners = pathPoints(route.path);
    const ends = [
      { end: 'source' as const, side: sourceSide, point: pointAlong(corners, MARK_GAP + sourceShift) },
      { end: 'target' as const, side: targetSide, point: pointAlong([...corners].reverse(), MARK_GAP + targetShift) },
    ].map((item) => {
      const mark = markFor(context, item.end);
      return { ...item, mark, rect: markRect(item.point, item.side, mark) };
    });

    /**
     * На короткой связи подпись посередине налезла бы на метки. Тогда она
     * уходит с линии вбок: над горизонтальным концом — вверх, у вертикального
     * — вправо, ровно настолько, чтобы разойтись с меткой.
     */
    let shift = { x: 0, y: 0 };
    if (typeof label === 'string' && label) {
      const width = labelWidth(label);
      const rect = { x: route.x - width / 2, y: route.y - LABEL_HEIGHT / 2, width, height: LABEL_HEIGHT };
      const hit = ends.find((item) => overlap(item.rect, rect));
      if (hit)
        shift = horizontal(hit.side)
          ? { x: 0, y: hit.rect.y - 3 - LABEL_HEIGHT / 2 - route.y }
          : { x: hit.rect.x + hit.rect.width + 3 + width / 2 - route.x, y: 0 };
    }
    return { ends, shift };
  }, [route, context, label]);

  if (!route) return null;

  return (
    <>
      <BaseEdge id={id} path={route.path} markerEnd={markerEnd} style={style} />
      {(label || marks) && (
        // Подпись рисуется отдельным слоем поверх схемы: в SVG она пряталась
        // под соседними блоками.
        <EdgeLabelRenderer>
          {label && (
            <div
              className={`pg-edge-label ${selected ? 'is-selected' : ''}`}
              style={{
                transform: `translate(-50%, -50%) translate(${route.x + (marks?.shift.x ?? 0)}px, ${route.y + (marks?.shift.y ?? 0)}px)`,
              }}
            >
              {label}
            </div>
          )}
          {marks?.ends.map(({ end, side, point, mark }) => (
            <div
              key={end}
              className={`pg-edge-mark pg-edge-mark--${mark.letter === 'U' ? 'up' : 'down'} ${selected ? 'is-selected' : ''}`}
              style={{ transform: `${MARK_ANCHOR[side]} translate(${point.x}px, ${point.y}px)` }}
            >
              {mark.letter}
              {mark.pattern && <span className="pg-edge-mark__pattern">{mark.pattern}</span>}
            </div>
          ))}
        </EdgeLabelRenderer>
      )}
    </>
  );
}

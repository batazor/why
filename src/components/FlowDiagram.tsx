import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  MarkerType,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NODE_SIZE, type FlowSpec } from '../code/flow';

type CardData = {
  kind: string;
  title: string;
  sub?: string;
  state: 'idle' | 'active' | 'focus';
  bad: boolean;
  variant: 'card' | 'bar';
};

/**
 * Узел — обычный HTML, а не текст в SVG. В этом и смысл перехода на React Flow:
 * вёрстка карточки живёт в CSS, переносы считает браузер, и не нужно руками
 * подбирать y-смещения для каждой подписи.
 */
function CardNode({ data }: NodeProps) {
  const card = data as unknown as CardData;
  return (
    <div
      className={[
        'fnode',
        `fnode--${card.state}`,
        card.variant === 'bar' ? 'fnode--bar' : '',
        card.bad ? 'fnode--bad' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {(['t', 'r', 'b', 'l'] as const).map((id) => (
        <Handle
          key={`s-${id}`}
          id={id}
          type="source"
          position={HANDLE_SIDE[id]}
          className="fnode__handle"
        />
      ))}
      {(['t', 'r', 'b', 'l'] as const).map((id) => (
        <Handle
          key={`t-${id}`}
          id={id}
          type="target"
          position={HANDLE_SIDE[id]}
          className="fnode__handle"
        />
      ))}

      {card.variant !== 'bar' && <span className="fnode__kind">{card.kind}</span>}
      <span className="fnode__title">{card.title}</span>
      {card.sub && <span className="fnode__sub">{card.sub}</span>}
    </div>
  );
}

const HANDLE_SIDE = {
  t: Position.Top,
  r: Position.Right,
  b: Position.Bottom,
  l: Position.Left,
} as const;

type AnnotationData = { level: number; label: string; arrow?: string };

/**
 * Стрелка пометки нарисована путём, а не глифом ⤹: глиф зависит от того, есть
 * ли он в системном шрифте, и по-разному сидит на базовой линии. Путь везде
 * выглядит одинаково и красится currentColor.
 */
function NoteArrow() {
  return (
    <svg className="fnote__arrow-svg" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M 37 33 C 18 33 7 26 7 9" />
      <path d="M 2 15 L 7 6 L 12 15" />
    </svg>
  );
}

/**
 * Пометка поверх схемы — приём из overview-примера React Flow: записка на полях,
 * а не узел графа. Номер совпадает с номером шага в плеере, чтобы взгляд не
 * искал соответствие между текстом слева и картинкой справа.
 */
function AnnotationNode({ data }: NodeProps) {
  const note = data as unknown as AnnotationData;
  return (
    <div className="fnote">
      <div className="fnote__body">
        <span className="fnote__level">{note.level}</span>
        <span className="fnote__text">{note.label}</span>
      </div>
      {note.arrow && (
        <span className={`fnote__arrow fnote__arrow--${note.arrow}`}>
          <NoteArrow />
        </span>
      )}
    </div>
  );
}

/** Пустой слот: сюда читатель приносит карточку акции из текста. */
function SlotNode({ data }: NodeProps) {
  const slot = data as unknown as { label: string; onDrop: () => void };
  const [over, setOver] = useState(false);
  return (
    <div
      className={['fslot', over ? 'fslot--over' : ''].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      onClick={() => slot.onDrop()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          slot.onDrop();
        }
      }}
      onDragOver={(event) => {
        // Без preventDefault браузер не считает элемент целью и не даст drop.
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        slot.onDrop();
      }}
    >
      <Handle id="l" type="target" position={Position.Left} className="fnode__handle" />
      <Handle id="r" type="source" position={Position.Right} className="fnode__handle" />
      <span className="fslot__label">{slot.label}</span>
    </div>
  );
}

const nodeTypes = { card: CardNode, annotation: AnnotationNode, slot: SlotNode };

/**
 * Цвета стрелок и сетки заданы конкретными значениями, а не токенами темы:
 * React Flow отдаёт их в SVG-атрибуты, а туда var(--…) не подставляется.
 * Значения подобраны так, чтобы читаться и на светлом, и на тёмном фоне.
 */
const ARROW = { none: '#8a93a3', ok: '#2fa36b', bad: '#e5484d' } as const;
const GRID = 'rgba(128, 134, 148, 0.35)';

/** Высота узла в координатах схемы: рендер её не задаёт, она измеренная. */
function nodeHeight(node: Node) {
  if (node.type === 'annotation') return NODE_SIZE.note;
  if ((node.data as { variant?: string }).variant === 'bar') return NODE_SIZE.bar;
  return NODE_SIZE.card;
}

/**
 * Границы того, что нарисовано на текущем шаге.
 *
 * Пересчитываются на каждое появление и исчезновение узла, поэтому шаг с двумя
 * карточками занимает полотно так же плотно, как шаг с пятью, и ничего не
 * уезжает за край. Пометки считаются наравне с узлами: они тоже должны влезать
 * в полотно целиком.
 */
function visibleBounds(nodes: Node[]) {
  // Пустой шаг: fitBounds делит на ширину, нулевая обращает масштаб в бесконечность.
  if (nodes.length === 0) return { x: 0, y: 0, width: 1, height: 1 };

  const boxes = nodes.map((node) => ({
    x: node.position.x,
    y: node.position.y,
    w: (node.style?.width as number | undefined) ?? NODE_SIZE.width,
    h: nodeHeight(node),
  }));

  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}

/**
 * Подстановка локализованных подписей. Ключ без перевода остаётся видимым как
 * `{{ключ}}` — молчаливый пустой ярлык на схеме нашли бы сильно позже.
 */
function localize(text: string | undefined, labels: Record<string, string>) {
  if (!text) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key) => labels[key] ?? whole);
}

function on(list: string[] | undefined, step: string) {
  return list === undefined || list.includes(step);
}

type Note = { step: string; level: number; text: string };

export default function FlowDiagram({
  spec,
  firstStep,
  notes = [],
  drags = [],
  labels = {},
}: {
  spec: FlowSpec;
  firstStep?: string;
  /** Локализованные подписи узлов и рёбер: `{{ключ}}` → текст. */
  labels?: Record<string, string>;
  /** Локализованные тексты пометок; геометрию задаёт spec.annotations. */
  notes?: Note[];
  /** Локализованные подписи карточки и слота по шагам. */
  drags?: { step: string; chip: string; slot: string }[];
}) {
  // Постер — схема из одного состояния: плеера у неё нет и слушать нечего.
  const pinned = spec.fixedStep;
  const [step, setStep] = useState(pinned ?? firstStep ?? '');
  // Состояние опыта хранится в плеере и сохраняется при возврате на шаг.
  const [dropped, setDropped] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);

  // Шагами по-прежнему управляет плеер — он живёт вне React.
  useEffect(() => {
    if (pinned) return;
    const host = hostRef.current?.closest<HTMLElement>('[data-player]');
    if (!host) return;

    // Остров монтируется лениво, поэтому сначала догоняем текущий шаг: к этому
    // моменту читатель мог уже пролистать разбор, и стартовать с первого нельзя.
    if (host.dataset.stepId) setStep(host.dataset.stepId);
    setDropped(host.dataset.promoPlaced === 'true');

    const handle = (event: Event) => {
      setStep((event as CustomEvent<{ id: string }>).detail.id);
    };
    // Клик по карточке делает то же, что перетаскивание: тащить мышью умеют не
    // все и не везде, а с клавиатуры — вообще никто.
    const place = () => setDropped(true);

    host.addEventListener('why:step', handle);
    host.addEventListener('why:promo-placed', place);
    return () => {
      host.removeEventListener('why:step', handle);
      host.removeEventListener('why:promo-placed', place);
    };
  }, [pinned]);

  // Пока карточку не донесли, того, что она приносит, на схеме нет.
  const awaitingDrop = spec.drop?.step === step && !dropped;
  const hidden = awaitingDrop ? new Set(spec.drop!.reveals) : new Set<string>();

  const nodes = useMemo<Node[]>(() => {
    const cards = spec.nodes
      .filter((node) => !hidden.has(node.id))
      .filter((node) => on(node.only, step))
      .map(
        (node) => ({
          id: node.id,
          type: 'card',
          position: node.position,
          draggable: false,
          selectable: false,
          style: node.width ? { width: node.width } : undefined,
          data: {
            kind: localize(node.kind, labels)!,
            variant: node.variant ?? 'card',
            title: localize(node.title, labels)!,
            sub: localize(node.sub, labels),
            bad: (node.bad ?? []).includes(step),
            state: (node.focus ?? []).includes(step)
              ? 'focus'
              : on(node.active, step)
                ? 'active'
                : 'idle',
          } satisfies CardData,
        }) satisfies Node,
      );

    // Пометка показывается только на своём шаге и только если перевод для неё есть.
    const stickies = (spec.annotations ?? [])
      .filter((annotation) => annotation.step === step)
      .flatMap((annotation) => {
        const note = notes.find((item) => item.step === annotation.step);
        if (!note) return [];
        return [
          {
            id: `note-${annotation.step}`,
            type: 'annotation',
            position: annotation.position,
            draggable: false,
            selectable: false,
            style: { width: annotation.width ?? 190 },
            data: { level: note.level, label: note.text, arrow: annotation.arrow },
          } satisfies Node,
        ];
      });

    const slots: Node[] =
      awaitingDrop && spec.drop
        ? [
            {
              id: 'drop-slot',
              type: 'slot',
              position: spec.drop.slot,
              draggable: false,
              selectable: false,
              style: { width: spec.drop.width ?? 190 },
              data: {
                label: drags.find((d) => d.step === step)?.slot ?? '',
                onDrop: () => hostRef.current?.closest('[data-player]')?.dispatchEvent(new CustomEvent('why:promo-placed')),
              },
            },
          ]
        : [];

    return [...cards, ...slots, ...stickies];
  }, [spec, step, notes, awaitingDrop, drags, labels]);

  const edges = useMemo<Edge[]>(
    () =>
      spec.edges
        .filter((edge) => !hidden.has(edge.id))
        .filter((edge) => on(edge.only, step))
        .map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          label: localize(edge.label, labels),
          type: 'smoothstep',
          animated: edge.tone === 'bad',
          markerEnd: { type: MarkerType.ArrowClosed, color: ARROW[edge.tone ?? 'none'], width: 18, height: 18 },
          className: [`fedge`, edge.tone && `fedge--${edge.tone}`, edge.dashed && 'fedge--dashed']
            .filter(Boolean)
            .join(' '),
        })),
    [spec, step, awaitingDrop, labels],
  );

  const bounds = useMemo(() => visibleBounds(nodes), [nodes]);

  // Пересчёт при смене размера полотна: масштаб считается от него.
  const fitted = useRef(false);
  const [instance, setInstance] = useState<{
    fitBounds: (b: ReturnType<typeof visibleBounds>, o?: object) => void;
  } | null>(null);
  useEffect(() => {
    if (!instance || !hostRef.current) return;
    // Масштаб меняется от шага к шагу, поэтому переход анимируется: мгновенный
    // скачок зума читается как подмена картинки. Первый фит — без анимации:
    // до него полотно стоит в zoom 1 и обрезано, и этот кадр видно.
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fit = (duration = 0) => instance.fitBounds(bounds, { padding: 0.12, duration });
    /**
     * Кадр задержки обязателен. Сразу после onInit полотно ещё не обмерено, и
     * мгновенный fitBounds (duration 0) уходит в никуда — схема остаётся в
     * zoom 1 и обрезанной. Анимированный вызов это скрывал, потому что сам
     * стартует со следующего кадра.
     */
    const frame = requestAnimationFrame(() => {
      fit(fitted.current && smooth ? 260 : 0);
      fitted.current = true;
    });
    /**
     * ResizeObserver, а не window.resize: полотно меняет размер и при
     * неподвижном окне. Сетка разбора схлопывается в одну колонку по
     * медиазапросу, колонка со схемой при этом становится шире — окно не
     * резайзится, событие не приходит, и масштаб остаётся от старой ширины.
     */
    const observer = new ResizeObserver(() => fit(0));
    observer.observe(hostRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [instance, bounds]);

  return (
    <div
      ref={hostRef}
      className={['flow', pinned ? 'flow--static' : '', spec.compact ? 'flow--compact' : '']
        .filter(Boolean)
        .join(' ')}
      style={{ '--flow-height': `${spec.height}px` } as CSSProperties}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(rf) => setInstance(rf as unknown as typeof instance)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        /* Колесо мыши должно листать страницу, а не зумить схему —
           иначе читатель залипает в полотне при обычной прокрутке. */
        zoomOnScroll={false}
        panOnScroll={false}
        preventScrolling={false}
        /* Постер — картинка, а не полотно: таскать и зумить его незачем. */
        panOnDrag={!pinned}
        zoomOnPinch={!pinned}
        zoomOnDoubleClick={!pinned}
        minZoom={0.4}
        maxZoom={1.6}
      >
        {!pinned && <Background variant={BackgroundVariant.Dots} gap={18} size={1} color={GRID} />}
        {!pinned && <Controls showInteractive={false} />}
      </ReactFlow>
    </div>
  );
}

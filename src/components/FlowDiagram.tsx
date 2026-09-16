import { useEffect, useMemo, useState, type CSSProperties } from 'react';
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
import type { FlowSpec } from '../code/flow';

type CardData = {
  kind: string;
  title: string;
  sub?: string;
  state: 'idle' | 'active' | 'focus';
  bad: boolean;
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

      <span className="fnode__kind">{card.kind}</span>
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

const nodeTypes = { card: CardNode, annotation: AnnotationNode };

/**
 * Цвета стрелок и сетки заданы конкретными значениями, а не токенами темы:
 * React Flow отдаёт их в SVG-атрибуты, а туда var(--…) не подставляется.
 * Значения подобраны так, чтобы читаться и на светлом, и на тёмном фоне.
 */
const ARROW = { none: '#8a93a3', ok: '#2fa36b', bad: '#e5484d' } as const;
const GRID = 'rgba(128, 134, 148, 0.35)';

function on(list: string[] | undefined, step: string) {
  return list === undefined || list.includes(step);
}

type Note = { step: string; level: number; text: string };

export default function FlowDiagram({
  spec,
  firstStep,
  notes = [],
}: {
  spec: FlowSpec;
  firstStep?: string;
  /** Локализованные тексты пометок; геометрию задаёт spec.annotations. */
  notes?: Note[];
}) {
  // Постер — схема из одного состояния: плеера у неё нет и слушать нечего.
  const pinned = spec.fixedStep;
  const [step, setStep] = useState(pinned ?? firstStep ?? '');

  // Шагами по-прежнему управляет плеер — он живёт вне React.
  useEffect(() => {
    if (pinned) return;
    const host = document.querySelector<HTMLElement>('[data-player]');
    if (!host) return;

    // Остров монтируется лениво, поэтому сначала догоняем текущий шаг: к этому
    // моменту читатель мог уже пролистать разбор, и стартовать с первого нельзя.
    if (host.dataset.stepId) setStep(host.dataset.stepId);

    const handle = (event: Event) => setStep((event as CustomEvent<{ id: string }>).detail.id);
    host.addEventListener('why:step', handle);
    return () => host.removeEventListener('why:step', handle);
  }, [pinned]);

  const nodes = useMemo<Node[]>(() => {
    const cards = spec.nodes
      .filter((node) => on(node.only, step))
      .map(
        (node) => ({
          id: node.id,
          type: 'card',
          position: node.position,
          draggable: false,
          selectable: false,
          data: {
            kind: node.kind,
            title: node.title,
            sub: node.sub,
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

    return [...cards, ...stickies];
  }, [spec, step, notes]);

  const edges = useMemo<Edge[]>(
    () =>
      spec.edges
        .filter((edge) => on(edge.only, step))
        .map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          label: edge.label,
          type: 'smoothstep',
          animated: edge.tone === 'bad',
          markerEnd: { type: MarkerType.ArrowClosed, color: ARROW[edge.tone ?? 'none'], width: 18, height: 18 },
          className: [`fedge`, edge.tone && `fedge--${edge.tone}`, edge.dashed && 'fedge--dashed']
            .filter(Boolean)
            .join(' '),
        })),
    [spec, step],
  );

  return (
    <div
      className={['flow', pinned ? 'flow--static' : '', spec.compact ? 'flow--compact' : '']
        .filter(Boolean)
        .join(' ')}
      style={{ '--flow-height': `${spec.height}px` } as CSSProperties}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
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

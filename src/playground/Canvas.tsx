import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { blockSpec } from './catalog';
import { techName } from './competency';
import { ROUTE_DRAG, assignRoute } from './api-templates';
import { REQ_DRAG, coverRequirement, uid, type Design, type DesignEdge, type DesignNode } from './model';
import type { T } from './i18n';

export const DRAG_TYPE = 'application/x-sysdesign-block';

type BlockData = { node: DesignNode; t: T; reqs: string[] };

const SIDES = [
  ['t', Position.Top],
  ['r', Position.Right],
  ['b', Position.Bottom],
  ['l', Position.Left],
] as const;

/**
 * Блок схемы. Ручки только исходящие и режим связи свободный: тянуть можно от
 * любой стороны к любой, и читателю не приходится угадывать, где вход.
 */
function BlockNode({ data, selected }: NodeProps) {
  const { node, t, reqs } = data as unknown as BlockData;
  const spec = blockSpec(node.kind);
  return (
    <div className={`pg-block pg-block--${spec.category} ${selected ? 'is-selected' : ''}`}>
      {SIDES.map(([id, side]) => (
        <Handle key={id} id={id} type="source" position={side} className="pg-block__handle" />
      ))}
      <i className={`codicon codicon-${spec.icon} pg-block__icon`} aria-hidden="true" />
      <span className="pg-block__text">
        <span className="pg-block__label">{node.label || t(`block.${node.kind}`)}</span>
        <span className="pg-block__kind">{techName(node.kind, node.tech) ?? t(`block.${node.kind}`)}</span>
        {node.schema && node.schema.length > 0 && (
          <span className="pg-block__schema" title={node.schema.map((table) => table.name).join(', ')}>
            <i className="codicon codicon-table" aria-hidden="true" />
            {node.schema.map((table) => table.name).join(', ')}
          </span>
        )}
        {/* Требования видны прямо на блоке: на схеме сразу понятно, что
            какой блок обещает, без щелчка по каждому. */}
        {reqs.length > 0 && (
          <span className="pg-block__reqs" title={t('inspect.reqs')}>
            {reqs.map((id) => (
              <span key={id} className={id.startsWith('NFR') ? 'is-nfr' : ''}>
                {id}
              </span>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

const nodeTypes = { block: BlockNode };

function toFlowNode(node: DesignNode, t: T, reqs: string[]): Node {
  return { id: node.id, type: 'block', position: { x: node.x, y: node.y }, data: { node, t, reqs } };
}

/** Размер блока для выбора сторон: совпадает с шириной и высотой .pg-block. */
const BLOCK = { w: 180, h: 56 };

/**
 * Стороны, к которым цепляется связь, выбираются по взаимному положению
 * блоков, а не по ручке, от которой её тянули: блоки двигают, и связь,
 * прибитая к верхней стороне, после этого петляет вокруг блока.
 */
function sides(from?: DesignNode, to?: DesignNode): [string, string] {
  if (!from || !to) return ['r', 'l'];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Горизонталь выигрывает с запасом: блок шире, чем выше.
  if (Math.abs(dx) * (BLOCK.h / BLOCK.w) * 2 >= Math.abs(dy)) return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
  return dy >= 0 ? ['b', 't'] : ['t', 'b'];
}

function toFlowEdge(edge: DesignEdge, nodes: Map<string, DesignNode>): Edge {
  const [sourceHandle, targetHandle] = sides(nodes.get(edge.source), nodes.get(edge.target));
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle,
    targetHandle,
    label: edge.label || undefined,
    // Асинхронная связь бежит пунктиром: сообщение ушло, отправитель не ждёт.
    animated: edge.mode === 'async',
    className: `pg-edge pg-edge--${edge.mode}`,
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  };
}

interface Props {
  design: Design;
  update: (fn: (design: Design) => Design) => void;
  onSelect: (selection: { node?: string; edge?: string }) => void;
  t: T;
  addRef: (add: (kind: string) => void) => void;
  /** Смотреть, не трогать: интервьюер видит доску кандидата, но не рисует на ней. */
  readOnly?: boolean;
  /** Строка поверх полотна: чью доску сейчас видно. */
  banner?: string;
  /** Что висит над полотном: карточка задания. */
  overlay?: ReactNode;
}

export default function Canvas({ design, update, onSelect, t, addRef, readOnly = false, banner, overlay }: Props) {
  const flow = useReactFlow();

  /**
   * Узлы React Flow живут в своём состоянии, а не выводятся из проекта на
   * каждом рендере: в них React Flow хранит замеры и выделение. Проект —
   * источник правды для содержимого, поэтому при каждой его правке узлы
   * пересобираются, сохраняя то, что намерил React Flow.
   */
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  /**
   * Только что добавленный блок выделяется на самом полотне, а не только в
   * инспекторе: иначе React Flow тут же сообщает о пустом выделении, и
   * инспектор сбрасывается раньше, чем читатель успел назвать блок.
   */
  const fresh = useRef<string | null>(null);

  useEffect(() => {
    const covered = new Map<string, string[]>();
    for (const item of design.requirements)
      for (const id of item.covers) covered.set(id, [...(covered.get(id) ?? []), item.id]);
    // Снимается до setNodes: функцию обновления React зовёт позже, на рендере.
    const picked = fresh.current;
    fresh.current = null;
    setNodes((previous) => {
      const byId = new Map(previous.map((node) => [node.id, node]));
      return design.nodes.map((node) => {
        const next = toFlowNode(node, t, covered.get(node.id) ?? []);
        const old = byId.get(node.id);
        const merged = old ? { ...old, ...next, data: next.data } : next;
        return picked ? { ...merged, selected: node.id === picked } : merged;
      });
    });
  }, [design.nodes, design.requirements, t]);

  useEffect(() => {
    const nodes = new Map(design.nodes.map((node) => [node.id, node]));
    setEdges((previous) => {
      const byId = new Map(previous.map((edge) => [edge.id, edge]));
      return design.edges.map((edge) => ({ ...byId.get(edge.id), ...toFlowEdge(edge, nodes) }));
    });
  }, [design.edges, design.nodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((current) => applyNodeChanges(changes, current));

      const moved = new Map<string, { x: number; y: number }>();
      const removed = new Set<string>();
      for (const change of changes) {
        if (change.type === 'position' && change.position) moved.set(change.id, change.position);
        if (change.type === 'remove') removed.add(change.id);
      }
      if (!moved.size && !removed.size) return;

      update((design) => ({
        ...design,
        nodes: design.nodes
          .filter((node) => !removed.has(node.id))
          .map((node) => {
            const position = moved.get(node.id);
            return position ? { ...node, x: Math.round(position.x), y: Math.round(position.y) } : node;
          }),
        edges: removed.size
          ? design.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target))
          : design.edges,
        requirements: removed.size
          ? design.requirements.map((item) => ({ ...item, covers: item.covers.filter((id) => !removed.has(id)) }))
          : design.requirements,
        api: removed.size
          ? design.api.map((item) => (item.service && removed.has(item.service) ? { ...item, service: undefined } : item))
          : design.api,
      }));
    },
    [update],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((current) => applyEdgeChanges(changes, current));
      const removed = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id));
      if (removed.size)
        update((design) => ({ ...design, edges: design.edges.filter((edge) => !removed.has(edge.id)) }));
    },
    [update],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return;
      update((design) => ({
        ...design,
        edges: [
          ...design.edges,
          {
            id: uid('e'),
            source: connection.source,
            target: connection.target,
            label: '',
            mode: 'sync',
          },
        ],
      }));
    },
    [update],
  );

  const add = useCallback(
    (kind: string, position?: { x: number; y: number }) => {
      // Без точки броска (щелчок в палитре) блок встаёт в центр видимой
      // области, со сдвигом, чтобы несколько щелчков не сложили блоки стопкой.
      const center =
        position ??
        (() => {
          const box = document.querySelector('.pg-canvas')?.getBoundingClientRect();
          const point = flow.screenToFlowPosition({
            x: (box?.left ?? 0) + (box?.width ?? 600) / 2,
            y: (box?.top ?? 0) + (box?.height ?? 400) / 2,
          });
          const shift = (design.nodes.length % 6) * 24;
          return { x: point.x - 90 + shift, y: point.y - 28 + shift };
        })();
      const id = uid('n');
      fresh.current = id;
      update((current) => ({
        ...current,
        nodes: [...current.nodes, { id, kind, label: t(`block.${kind}`), note: '', x: Math.round(center.x), y: Math.round(center.y) }],
      }));
    },
    [flow, update, t, design.nodes.length],
  );

  useEffect(() => addRef((kind) => add(kind)), [add, addRef]);

  /**
   * Маршрут из вкладки API и номер требования бросают прямо на блок: блок,
   * над которым курсор, подсвечивается, маршрут уходит ему, а требование
   * он начинает закрывать. Подсветка — классом на элементе узла, а не через
   * состояние: перерисовывать все узлы на каждое движение курсора незачем.
   */
  const routeTarget = useRef<HTMLElement | null>(null);
  const markTarget = (element: HTMLElement | null) => {
    if (routeTarget.current === element) return;
    routeTarget.current?.classList.remove('pg-route-drop');
    element?.classList.add('pg-route-drop');
    routeTarget.current = element;
  };

  const onDragOver = (event: DragEvent) => {
    if (readOnly) return;
    const types = event.dataTransfer.types;
    if (types.includes(ROUTE_DRAG) || types.includes(REQ_DRAG)) {
      const node = (event.target as HTMLElement).closest<HTMLElement>('.react-flow__node');
      markTarget(node);
      if (!node) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = types.includes(REQ_DRAG) ? 'link' : 'move';
      return;
    }
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (event: DragEvent) => {
    const route = event.dataTransfer.getData(ROUTE_DRAG);
    const requirement = event.dataTransfer.getData(REQ_DRAG);
    if ((route || requirement) && !readOnly) {
      const target = routeTarget.current?.dataset.id;
      markTarget(null);
      if (!target) return;
      event.preventDefault();
      update((current) =>
        route
          ? { ...current, api: assignRoute(current.api, route, target) }
          : { ...current, requirements: coverRequirement(current.requirements, requirement, target) },
      );
      return;
    }
    const kind = event.dataTransfer.getData(DRAG_TYPE);
    if (!kind || readOnly) return;
    event.preventDefault();
    const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    // Блок ложится центром под курсор, а не левым верхним углом.
    add(kind, { x: point.x - 90, y: point.y - 28 });
  };

  return (
    <div
      className={`pg-canvas ${readOnly ? 'is-readonly' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) markTarget(null);
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        onSelectionChange={({ nodes, edges }) => {
          if (nodes.length) onSelect({ node: nodes[0].id });
          else if (edges.length) onSelect({ edge: edges[0].id });
          else onSelect({});
        }}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        snapToGrid
        snapGrid={[10, 10]}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="pg-minimap" />
      </ReactFlow>
      {banner && <p className="pg-canvas__banner">{banner}</p>}
      {overlay}
      {!design.nodes.length && !readOnly && <p className="pg-canvas__empty">{t('canvas.empty')}</p>}
    </div>
  );
}

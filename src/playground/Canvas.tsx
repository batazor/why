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
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { blockSpec } from './catalog';
import { techName } from './competency';
import { ROUTE_DRAG, assignRoute } from './api-templates';
import FloatingEdge from './FloatingEdge';
import { autoLayout } from './layout';
import {
  REQ_DRAG,
  TEXT_KIND,
  blocksOf,
  coverRequirement,
  isText,
  uid,
  type Design,
  type DesignEdge,
  type DesignNode,
} from './model';
import type { T } from './i18n';

export const DRAG_TYPE = 'application/x-sysdesign-block';

type BlockData = { node: DesignNode; t: T; reqs: string[] };

type TextData = {
  node: DesignNode;
  t: T;
  /** Новый текст надписи; null — надпись опустела и её больше нет. */
  write?: (id: string, text: string | null) => void;
  /** Только что поставлена: сразу печатать, без двойного щелчка. */
  fresh: boolean;
};

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
    <div
      className={`pg-block pg-block--${spec.category} ${selected ? 'is-selected' : ''} ${node.drawnBy ? 'is-by-interviewer' : ''}`}
      title={node.drawnBy ? t('canvas.byInterviewer') : undefined}
    >
      {node.drawnBy && (
        <span className="pg-block__by" aria-label={t('canvas.byInterviewer')}>
          <i className="codicon codicon-person" aria-hidden="true" />
        </span>
      )}
      {/* Блок из исходной системы: его дали, а не нарисовали. Интервьюеру
          это нужно, чтобы отличить готовое от сделанного на собеседовании. */}
      {node.given && (
        <span className="pg-block__given" title={t('canvas.given')} aria-label={t('canvas.given')}>
          <i className="codicon codicon-history" aria-hidden="true" />
        </span>
      )}
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
      {/* Подпись — под рамкой, а не в ней: замер узла её не включает, и
          связи по-прежнему упираются в сам блок. Оформлена как пометка в
          разборах: рукописный текст и стрелка к блоку. */}
      {node.caption?.trim() && (
        <span className="pg-block__caption">
          <svg className="pg-block__caption-arrow" viewBox="0 0 40 40" aria-hidden="true">
            <path d="M 37 33 C 18 33 7 26 7 9" />
            <path d="M 2 15 L 7 6 L 12 15" />
          </svg>
          {node.caption.trim()}
        </span>
      )}
    </div>
  );
}

/**
 * Надпись: текст без рамки и без ручек — к ней не ведут связи. Печатают
 * прямо на полотне: двойной щелчок открывает поле, Esc или щелчок мимо
 * закрывают. Опустевшая надпись удаляется — пустой узел не найти глазами.
 */
function TextNode({ data, selected }: NodeProps) {
  const { node, t, write, fresh } = data as unknown as TextData;
  const [editing, setEditing] = useState(fresh && Boolean(write));
  const field = useRef<HTMLTextAreaElement>(null);

  /**
   * Новый узел React Flow держит скрытым, пока не замерит, а скрытое поле
   * фокус не берёт. Поэтому фокус ставится по кадрам, пока поле его не
   * примет, — обычно со второго.
   */
  useEffect(() => {
    if (!editing) return;
    let frame = 0;
    let tries = 0;
    const grab = () => {
      const element = field.current;
      if (!element) return;
      element.focus();
      if (document.activeElement === element) element.setSelectionRange(element.value.length, element.value.length);
      else if (++tries < 20) frame = requestAnimationFrame(grab);
    };
    grab();
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  // Поле растёт по тексту: прокрутка внутри надписи на полотне неуместна.
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = '0';
    element.style.height = `${element.scrollHeight}px`;
  });

  const finish = () => {
    setEditing(false);
    if (!node.label.trim()) write?.(node.id, null);
  };

  return (
    <div
      // nopan: двойной щелчок по надписи открывает поле, а не приближает полотно.
      className={`pg-text pg-text--${node.textSize ?? 'm'} nopan ${selected ? 'is-selected' : ''} ${node.drawnBy ? 'is-by-interviewer' : ''}`}
      title={node.drawnBy ? t('canvas.byInterviewer') : undefined}
      onDoubleClick={write ? () => setEditing(true) : undefined}
    >
      {editing ? (
        <textarea
          ref={field}
          className="pg-text__field nodrag nowheel"
          rows={1}
          value={node.label}
          placeholder={t('text.typing')}
          onChange={(event) => write?.(node.id, event.currentTarget.value)}
          onBlur={finish}
          onKeyDown={(event) => {
            if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) finish();
          }}
        />
      ) : (
        <span className={`pg-text__body ${node.label.trim() ? '' : 'is-empty'}`}>
          {node.label.trim() ? node.label : t(write ? 'text.placeholder' : 'text.empty')}
        </span>
      )}
    </div>
  );
}

const nodeTypes = { block: BlockNode, [TEXT_KIND]: TextNode };
const edgeTypes = { floating: FloatingEdge };

function toFlowNode(node: DesignNode, t: T, reqs: string[]): Node {
  return { id: node.id, type: 'block', position: { x: node.x, y: node.y }, data: { node, t, reqs } };
}

function toTextNode(node: DesignNode, t: T, write: TextData['write'], fresh: boolean): Node {
  const data: TextData = { node, t, write, fresh };
  return { id: node.id, type: TEXT_KIND, position: { x: node.x, y: node.y }, data };
}

function toFlowEdge(edge: DesignEdge): Edge {
  return {
    id: edge.id,
    type: 'floating',
    source: edge.source,
    target: edge.target,
    label: edge.label || undefined,
    // Асинхронная связь бежит пунктиром: сообщение ушло, отправитель не ждёт.
    animated: edge.mode === 'async',
    className: `pg-edge pg-edge--${edge.mode} ${edge.drawnBy ? 'is-by-interviewer' : ''}`,
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
  /** Слой внутри полотна, в его координатах: чужие курсоры. */
  layer?: ReactNode;
  /** Где курсор на схеме, `null` — ушёл с полотна. Нужно комнате собеседования. */
  onPointer?: (point: { x: number; y: number } | null) => void;
  /** Рисует интервьюер на доске кандидата: новое на схеме помечается его. */
  drawnBy?: 'interviewer';
  /** Блок, выбранный при открытии полотна: тур показывает его инспектор. */
  select?: string;
}

export default function Canvas({
  design,
  update,
  onSelect,
  t,
  addRef,
  readOnly = false,
  banner,
  overlay,
  layer,
  onPointer,
  drawnBy,
  select,
}: Props) {
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
  const fresh = useRef<string | null>(select ?? null);

  /** Текст надписи правится прямо на полотне; пустая надпись уходит со схемы. */
  const write = useCallback(
    (id: string, text: string | null) =>
      update((current) => ({
        ...current,
        nodes:
          text === null
            ? current.nodes.filter((node) => node.id !== id)
            : current.nodes.map((node) => (node.id === id ? { ...node, label: text } : node)),
      })),
    [update],
  );

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
        const next = isText(node)
          ? toTextNode(node, t, readOnly ? undefined : write, node.id === picked)
          : toFlowNode(node, t, covered.get(node.id) ?? []);
        const old = byId.get(node.id);
        const merged = old ? { ...old, ...next, data: next.data } : next;
        return picked ? { ...merged, selected: node.id === picked } : merged;
      });
    });
  }, [design.nodes, design.requirements, t, readOnly, write]);

  useEffect(() => {
    setEdges((previous) => {
      const byId = new Map(previous.map((edge) => [edge.id, edge]));
      return design.edges.map((edge) => ({ ...byId.get(edge.id), ...toFlowEdge(edge) }));
    });
  }, [design.edges]);

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
            ...(drawnBy ? { drawnBy } : {}),
          },
        ],
      }));
    },
    [update, drawnBy],
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
        nodes: [
          ...current.nodes,
          { id, kind, label: kind === TEXT_KIND ? '' : t(`block.${kind}`), note: '', x: Math.round(center.x), y: Math.round(center.y), ...(drawnBy ? { drawnBy } : {}) },
        ],
      }));
    },
    [flow, update, t, design.nodes.length, drawnBy],
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

  /**
   * Разложить схему: ELK расставляет блоки по слоям слева направо и сам
   * уменьшает число пересечений. Размеры берутся замеренные — карточки
   * разной высоты, и раскладка по номиналу разъехалась бы.
   */
  const [laying, setLaying] = useState(false);
  const arrange = async () => {
    setLaying(true);
    try {
      const sizes = new Map(
        nodes
          .filter((node) => node.measured?.width && node.measured?.height)
          .map((node) => [node.id, { width: node.measured!.width!, height: node.measured!.height! }]),
      );
      // Надписи остаются где были: связей у них нет, и ELK свалил бы их в угол.
      const placed = await autoLayout(blocksOf(design.nodes), design.edges, sizes);
      if (placed.size) {
        update((current) => ({
          ...current,
          nodes: current.nodes.map((node) => ({ ...node, ...(placed.get(node.id) ?? {}) })),
        }));
        // Схема переехала целиком: показываем её заново, иначе человек
        // смотрит в пустое место, где блоки были раньше.
        setTimeout(() => flow.fitView({ padding: 0.12, maxZoom: 1, minZoom: 0.3, duration: 400 }), 60);
      }
    } finally {
      setLaying(false);
    }
  };

  const onDragOver = (event: DragEvent) => {
    if (readOnly) return;
    const types = event.dataTransfer.types;
    if (types.includes(ROUTE_DRAG) || types.includes(REQ_DRAG)) {
      // На надпись требование и маршрут не бросают: она ничего не обслуживает.
      const node = (event.target as HTMLElement).closest<HTMLElement>('.react-flow__node:not(.react-flow__node-text)');
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

  /**
   * React Flow зовёт обработчик не только при смене выделения, но и когда
   * меняется сама функция. Стрелка прямо в пропе — новая на каждый рендер,
   * и вкладка «Выбранное» открывалась бы заново на каждый тик таймера
   * собеседования: уйти с неё на «Требования», пока блок выделен, было
   * нельзя — а без этого требование на блок не перетащить.
   */
  const onSelectionChange = useCallback(
    ({ nodes, edges }: OnSelectionChangeParams) => {
      if (nodes.length) onSelect({ node: nodes[0].id });
      else if (edges.length) onSelect({ edge: edges[0].id });
      else onSelect({});
    },
    [onSelect],
  );

  return (
    <div
      className={`pg-canvas ${readOnly ? 'is-readonly' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerMove={onPointer && ((event) => onPointer(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })))}
      onPointerLeave={onPointer && (() => onPointer(null))}
      onDragLeave={(event) => {
        // `Node` в этом файле — узел схемы из @xyflow/react; здесь нужен узел
        // DOM, поэтому имя берётся из глобальной области явно.
        if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null))
          markTarget(null);
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        onSelectionChange={onSelectionChange}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        snapToGrid
        snapGrid={[10, 10]}
        fitView
        /**
         * Нижняя граница подгонки: широкую схему можно вписать целиком, но в
         * масштабе 20% на ней не прочитать ни подписи, ни номера требований.
         * Лучше открыть читаемой и дать сдвинуть, чем показать ковёр.
         */
        fitViewOptions={{ padding: 0.12, maxZoom: 1, minZoom: 0.55 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        {!readOnly && blocksOf(design.nodes).length > 1 && (
          <Panel position="top-right">
            <button type="button" className="pg-button pg-arrange" onClick={arrange} disabled={laying}>
              <i className={`codicon codicon-${laying ? 'sync' : 'type-hierarchy'}`} aria-hidden="true" />{' '}
              {t('canvas.arrange')}
            </button>
          </Panel>
        )}
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        {/* Карта пустой схемы — просто белый прямоугольник, от которого кажется, что что-то не загрузилось. */}
        {design.nodes.length > 0 && <MiniMap pannable zoomable className="pg-minimap" />}
        {layer}
      </ReactFlow>
      {banner && <p className="pg-canvas__banner">{banner}</p>}
      {overlay}
      {!design.nodes.length && <p className="pg-canvas__empty">{t(readOnly ? 'canvas.emptyReadOnly' : 'canvas.empty')}</p>}
    </div>
  );
}

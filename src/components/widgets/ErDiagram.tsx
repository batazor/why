import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ErDiagramData, ErTable } from '../../code/widgets';

/**
 * ER-схема в духе dbdiagram: таблица — карточка со списком колонок, связь идёт
 * от колонки внешнего ключа к колонке, на которую он ссылается, и на её концах
 * стоит «воронья лапка»: веер у таблицы с ключом (многие), черта у той, на
 * которую он указывает (один). Стрелка сказала бы только «указывает на», а
 * кратность без легенды читается по нотации.
 *
 * Раскладка авторская, как у схемы разбора: координаты — в данных. Высоту
 * карточек считаем сами: по ней подбирается масштаб, и ждать обмера DOM ради
 * этого незачем.
 *
 * Наведение на колонку или таблицу подсвечивает её связи и колонки на другом
 * конце, остальное приглушается: вопрос к ER-схеме почти всегда «что на что
 * ссылается», и ответ на него должен быть виден без чтения линий глазами.
 */

interface Props {
  data: ErDiagramData;
  labels: Record<string, string>;
}

const TABLE_W = 260;
const HEAD_H = 46;
const ROW_H = 22;
const GRID = 'rgba(128, 134, 148, 0.35)';

const MARK_MANY = 'er-many';
const MARK_ONE = 'er-one';
const MARK_MANY_LIT = 'er-many-lit';
const MARK_ONE_LIT = 'er-one-lit';

const tableHeight = (table: ErTable) => HEAD_H + table.columns.length * ROW_H;

type TableData = {
  table: ErTable;
  role: string;
  /** Колонки, у которых есть связь: только им нужны точки крепления. */
  anchors: Set<string>;
  lit: Set<string>;
  dimmed: boolean;
  onHover: (target: string | null) => void;
};

type TableNode = Node<TableData, 'erTable'>;

const HANDLE = { opacity: 0, width: 1, height: 1, border: 'none', minWidth: 0, minHeight: 0 } as const;

/** Ключ из двух штрихов: колонка первичного ключа, как в dbdiagram. */
function KeyGlyph() {
  return (
    <svg className="er-node__key" viewBox="0 0 12 12" aria-hidden>
      <circle cx="4" cy="6" r="2.6" />
      <path d="M6.6 6 H11 M9.2 6 V8 M10.8 6 V7.4" />
    </svg>
  );
}

function TableCard({ data }: NodeProps<TableNode>) {
  const { table, role, anchors, lit, dimmed, onHover } = data;
  return (
    <div
      className={['er-node', 'nowheel', dimmed ? 'er-node--dim' : ''].filter(Boolean).join(' ')}
      style={{ width: TABLE_W }}
      onMouseEnter={() => onHover(table.name)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="er-node__head" style={{ height: HEAD_H }}>
        <span className="er-node__name">{table.name}</span>
        {role && <span className="er-node__role">{role}</span>}
      </div>
      {table.columns.map((column) => {
        const id = `${table.name}.${column.name}`;
        const pk = column.keys?.includes('pk');
        return (
          <div
            key={column.name}
            className={['er-node__row', lit.has(id) ? 'er-node__row--lit' : ''].filter(Boolean).join(' ')}
            style={{ height: ROW_H }}
            onMouseEnter={() => onHover(id)}
            onMouseLeave={() => onHover(table.name)}
          >
            {pk ? <KeyGlyph /> : <span className="er-node__key" />}
            <span className={pk ? 'er-node__col er-node__col--pk' : 'er-node__col'}>{column.name}</span>
            <span className="er-node__type">{column.type}</span>
            {anchors.has(column.name) && (
              <>
                <Handle id={`l:${column.name}`} type="source" position={Position.Left} isConnectable={false} style={HANDLE} />
                <Handle id={`r:${column.name}`} type="source" position={Position.Right} isConnectable={false} style={HANDLE} />
                <Handle id={`tl:${column.name}`} type="target" position={Position.Left} isConnectable={false} style={HANDLE} />
                <Handle id={`tr:${column.name}`} type="target" position={Position.Right} isConnectable={false} style={HANDLE} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

const nodeTypes = { erTable: TableCard };

/** Концы «вороньей лапки». Цвет задан явно: context-stroke знают не все браузеры. */
function Markers() {
  const many = (id: string, color: string) => (
    <marker id={id} viewBox="0 0 12 12" markerWidth="12" markerHeight="12" refX="0" refY="6" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M0 1 L11 6 M0 6 L11 6 M0 11 L11 6" fill="none" style={{ stroke: color }} strokeWidth="1.2" />
    </marker>
  );
  const one = (id: string, color: string) => (
    <marker id={id} viewBox="0 0 12 12" markerWidth="12" markerHeight="12" refX="12" refY="6" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M7 1.5 L7 10.5" fill="none" style={{ stroke: color }} strokeWidth="1.4" />
    </marker>
  );
  return (
    <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        {many(MARK_MANY, 'var(--muted)')}
        {one(MARK_ONE, 'var(--muted)')}
        {many(MARK_MANY_LIT, 'var(--accent)')}
        {one(MARK_ONE_LIT, 'var(--accent)')}
      </defs>
    </svg>
  );
}

export default function ErDiagram({ data, labels }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [instance, setInstance] = useState<{
    fitBounds: (b: { x: number; y: number; width: number; height: number }, o?: object) => void;
  } | null>(null);

  const byName = useMemo(() => new Map(data.tables.map((table) => [table.name, table])), [data]);

  /** Связь подсвечена, если навели на её таблицу или на одну из её колонок. */
  const litRelations = useMemo(() => {
    if (!hover) return [];
    return data.relations.filter((rel) =>
      hover.includes('.')
        ? hover === `${rel.child}.${rel.childColumn}` || hover === `${rel.parent}.${rel.parentColumn}`
        : hover === rel.child || hover === rel.parent,
    );
  }, [hover, data]);

  const litColumns = useMemo(
    () =>
      new Set(litRelations.flatMap((rel) => [`${rel.child}.${rel.childColumn}`, `${rel.parent}.${rel.parentColumn}`])),
    [litRelations],
  );
  const litTables = new Set(litRelations.flatMap((rel) => [rel.child, rel.parent]));

  const nodes = useMemo<TableNode[]>(
    () =>
      data.tables.map((table) => ({
        id: table.name,
        type: 'erTable',
        position: table.position,
        width: TABLE_W,
        height: tableHeight(table),
        draggable: false,
        selectable: false,
        data: {
          table,
          role: labels[`er.table.${table.name}`] ?? '',
          anchors: new Set(
            data.relations.flatMap((rel) => [
              ...(rel.child === table.name ? [rel.childColumn] : []),
              ...(rel.parent === table.name ? [rel.parentColumn] : []),
            ]),
          ),
          lit: litColumns,
          dimmed: litRelations.length > 0 && !litTables.has(table.name),
          onHover: setHover,
        },
      })),
    // litTables выводится из litRelations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, labels, litColumns, litRelations],
  );

  const edges = useMemo<Edge[]>(
    () =>
      data.relations.flatMap((rel) => {
        const child = byName.get(rel.child);
        const parent = byName.get(rel.parent);
        if (!child || !parent) return [];
        // Сторону выбирает раскладка: связь выходит туда, где стоит другая таблица.
        const parentIsLeft = parent.position.x < child.position.x;
        const lit = litRelations.includes(rel);
        return [
          {
            id: `${rel.child}.${rel.childColumn}->${rel.parent}.${rel.parentColumn}`,
            source: rel.child,
            target: rel.parent,
            sourceHandle: `${parentIsLeft ? 'l' : 'r'}:${rel.childColumn}`,
            targetHandle: `${parentIsLeft ? 'tr' : 'tl'}:${rel.parentColumn}`,
            type: 'smoothstep',
            className: ['er-edge', lit ? 'er-edge--lit' : '', hover && !lit ? 'er-edge--dim' : '']
              .filter(Boolean)
              .join(' '),
            markerStart: lit ? MARK_MANY_LIT : MARK_MANY,
            markerEnd: lit ? MARK_ONE_LIT : MARK_ONE,
            zIndex: lit ? 10 : 0,
          },
        ];
      }),
    [data, byName, litRelations, hover],
  );

  const bounds = useMemo(() => {
    const x = Math.min(...data.tables.map((t) => t.position.x));
    const y = Math.min(...data.tables.map((t) => t.position.y));
    return {
      x,
      y,
      width: Math.max(...data.tables.map((t) => t.position.x + TABLE_W)) - x,
      height: Math.max(...data.tables.map((t) => t.position.y + tableHeight(t))) - y,
    };
  }, [data]);

  /**
   * Масштаб — от размеров полотна. Кадр сцены скрыт, пока его шаг не активен,
   * и получает размеры только при показе: ResizeObserver ловит и это.
   */
  useEffect(() => {
    if (!instance || !hostRef.current) return;
    const fit = () => {
      const box = hostRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      instance.fitBounds(bounds, { padding: 0.08, duration: 0 });
    };
    const frame = requestAnimationFrame(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(hostRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [instance, bounds]);

  return (
    <div ref={hostRef} className="er-flow">
      <Markers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(rf) => setInstance(rf as unknown as typeof instance)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        panOnScroll={false}
        preventScrolling={false}
        panOnDrag={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        minZoom={0.3}
        maxZoom={1.2}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color={GRID} />
      </ReactFlow>
    </div>
  );
}

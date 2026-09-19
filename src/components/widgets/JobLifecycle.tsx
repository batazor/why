import { createContext, useContext, useMemo, useState, type CSSProperties } from 'react';
import {
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { JobLifecycleData, LifecycleSide } from '../../code/widgets';

/**
 * Жизненный цикл джобы — стейт-машина.
 *
 * Состояния те же, что видит пользователь в API. Цвет перехода — кто его
 * делает: клиент, команда приёма, воркер или планировщик. Щелчок по состоянию
 * раскрывает его: что оно значит и куда из него можно уйти; остальные линии
 * бледнеют.
 *
 * Узлы и линии неизменны, выбор приходит через контекст и классы — по той же
 * причине, что у транзакции: пересобранные узлы React Flow прячет и
 * перемеряет, и схема мигала бы на каждом щелчке.
 */

interface Props {
  data: JobLifecycleData;
  labels: Record<string, string>;
}

const Selected = createContext<{ key: string; select: (key: string) => void }>({
  key: '',
  select: () => {},
});

const POSITION: Record<LifecycleSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const SIDES = Object.keys(POSITION) as LifecycleSide[];

type StateData = { key: string; terminal?: boolean; start?: boolean; linked: string[] };

function StateNode({ data }: NodeProps) {
  const state = data as unknown as StateData;
  const { key, select } = useContext(Selected);
  const handles = SIDES.flatMap((side) => [
    <Handle
      key={`s-${side}`}
      id={`s-${side}`}
      type="source"
      position={POSITION[side]}
      className="fnode__handle"
    />,
    <Handle
      key={`t-${side}`}
      id={`t-${side}`}
      type="target"
      position={POSITION[side]}
      className="fnode__handle"
    />,
  ]);

  if (state.start) {
    return <div className="lc-start">{handles}</div>;
  }

  const on = key === state.key;
  const near = !on && state.linked.includes(key);
  return (
    <button
      type="button"
      className={[
        'lc-state',
        state.terminal ? 'lc-state--terminal' : '',
        `lc-state--${state.key}`,
        on ? 'is-on' : near ? 'is-near' : key ? 'is-far' : '',
      ].join(' ')}
      aria-pressed={on}
      onClick={() => select(state.key)}
    >
      {handles}
      <span>{state.key}</span>
    </button>
  );
}

const nodeTypes = { state: StateNode };

export default function JobLifecycle({ data, labels }: Props) {
  const text = (key: string) => labels[key] ?? key;
  const [key, setKey] = useState(data.initial);

  const nodes: Node[] = useMemo(
    () =>
      data.states.map((state) => ({
        id: state.key,
        type: 'state',
        position: { x: state.x, y: state.y },
        data: {
          ...state,
          // Соседи по переходам: при выборе они остаются яркими.
          linked: data.transitions
            .filter((tr) => tr.from === state.key || tr.to === state.key)
            .map((tr) => (tr.from === state.key ? tr.to : tr.from)),
        },
        selectable: false,
      })),
    [data],
  );

  const edges: Edge[] = useMemo(
    () =>
      data.transitions.map((tr) => {
        const touched = tr.from === key || tr.to === key;
        return {
          id: tr.id,
          source: tr.from,
          target: tr.to,
          sourceHandle: `s-${tr.out}`,
          targetHandle: `t-${tr.in}`,
          label: text(`lc.tr.${tr.id}`),
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 4,
          // Линия между соседями на одной высоте, сверху вниз и обратно —
          // петля ступенькой, с запасом над узлами: кривая Безье легла бы
          // на прямой переход и слилась с ним.
          ...(tr.out === tr.in
            ? { type: 'smoothstep', pathOptions: { offset: 44, borderRadius: 14 } }
            : {}),
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            markerUnits: 'userSpaceOnUse',
            // Наконечник в цвет актора: переменные объявлены на .lc, а
            // маркеры лежат внутри неё, поэтому var() доходит и до них.
            color: `var(--lc-${tr.actor})`,
          },
          className: `lc-edge lc-edge--${tr.actor} ${touched ? 'is-on' : 'is-far'}`,
        };
      }),
    [data, key, labels],
  );

  const current = data.states.find((state) => state.key === key);
  const outgoing = data.transitions.filter((tr) => tr.from === key);
  const actors = [...new Set(data.transitions.map((tr) => tr.actor))];

  return (
    <div className="lc">
      <div className="lc__stage" style={{ '--flow-height': '380px' } as CSSProperties}>
        <Selected.Provider value={{ key, select: setKey }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.08 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnScroll={false}
            panOnScroll={false}
            preventScrolling={false}
            panOnDrag={false}
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
          />
        </Selected.Provider>
      </div>

      <ul className="lc__legend" aria-label={text('lc.actors')}>
        {actors.map((actor) => (
          <li key={actor} className={`lc__actor lc__actor--${actor}`}>
            {text(`lc.actor.${actor}`)}
          </li>
        ))}
      </ul>

      <div className="lc__about" aria-live="polite">
        {current ? (
          <>
            <p className="lc__name">
              <code>{current.key}</code>
              {current.terminal && <span className="lc__badge">{text('lc.terminal')}</span>}
            </p>
            <p className="lc__text">{text(`lc.state.${current.key}`)}</p>
            {outgoing.length > 0 && (
              <>
                <p className="lc__label">{text('lc.out')}</p>
                <ul className="lc__moves">
                  {outgoing.map((tr) => (
                    <li key={tr.id} className={`lc__move lc__move--${tr.actor}`}>
                      <code>→ {tr.to}</code>
                      <span>
                        {text(`lc.tr.${tr.id}`)} · {text(`lc.actor.${tr.actor}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p className="lc__text">{text('lc.hint')}</p>
        )}
      </div>
    </div>
  );
}

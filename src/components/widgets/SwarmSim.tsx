import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { SwarmSimData, SwarmStrategy } from '../../code/widgets';
import { swarmCopies, swarmInit, swarmStep, type SwarmState } from '../../code/p2p-calc';

/**
 * Симулятор роя: сид в центре, качающие вокруг, у каждого — карта кусков.
 *
 * За такт узел отдаёт один кусок и принимает один. Меняется только правило,
 * по которому качающий выбирает следующий кусок, — и от него зависит, переживёт
 * ли рой уход сида. «По порядку» раздаёт всем одно и то же начало файла, и
 * хвост уходит вместе с сидом; «сначала редкие» за те же такты выносит из сида
 * каждый кусок ровно по разу.
 *
 * Узлы неизменны, состояние приходит через контекст — по той же причине, что у
 * жизненного цикла джобы: пересобранные узлы React Flow прячет и перемеряет.
 * Линии — передачи последнего такта, их пересобирать можно.
 */

interface Props {
  data: SwarmSimData;
  labels: Record<string, string>;
}

const Swarm = createContext<{ state: SwarmState; labels: Record<string, string> }>({
  state: swarmInit({ leechers: 0, pieces: 0, strategies: [], seedLeaves: false, seed: 1 }),
  labels: {},
});

function PeerNode({ data }: NodeProps) {
  const { index } = data as unknown as { index: number };
  const { state, labels } = useContext(Swarm);
  const row = state.have[index] ?? [];
  const gone = index === 0 && state.seedGone;
  const fresh = new Set(state.transfers.filter((item) => item.to === index).map((item) => item.piece));
  const full = row.every(Boolean);

  return (
    <div
      className={[
        'swarm-node',
        index === 0 ? 'swarm-node--seed' : '',
        full && index !== 0 ? 'is-full' : '',
        gone ? 'is-gone' : '',
      ].join(' ')}
    >
      {/* Ручки в центре узла: линия идёт от середины к середине и прячется под
          карточками, стороны выбирать не нужно. */}
      <Handle id="out" type="source" position={Position.Top} className="fnode__handle swarm-node__handle" />
      <Handle id="in" type="target" position={Position.Top} className="fnode__handle swarm-node__handle" />
      <span className="swarm-node__title">
        {index === 0
          ? gone
            ? labels['swarm.gone'] ?? 'swarm.gone'
            : labels['swarm.seed'] ?? 'swarm.seed'
          : `${labels['swarm.peer'] ?? 'swarm.peer'} ${index}`}
      </span>
      <span className="swarm-node__pieces">
        {row.map((has, piece) => (
          <i key={piece} className={has ? (fresh.has(piece) ? 'is-new' : 'is-on') : ''} />
        ))}
      </span>
    </div>
  );
}

const nodeTypes = { peer: PeerNode };

export default function SwarmSim({ data, labels }: Props) {
  const text = (key: string) => labels[key] ?? key;
  const [strategy, setStrategy] = useState<SwarmStrategy>(data.strategies[0]);
  const [seedLeaves, setSeedLeaves] = useState(data.seedLeaves);
  const [run, setRun] = useState(0);
  const [state, setState] = useState(() => swarmInit(data));
  const [running, setRunning] = useState(false);

  const config = useMemo(() => ({ ...data, seedLeaves }), [data, seedLeaves]);

  // Правило или уход сида сменили — прогон начинается заново, с тем же зерном:
  // сравнивать стратегии честно можно только на одинаковой случайности.
  useEffect(() => {
    setState(swarmInit(config, data.seed + run));
    setRunning(false);
  }, [config, strategy, run, data.seed]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setState((prev) => swarmStep(config, strategy, prev)), 650);
    return () => clearInterval(timer);
  }, [running, config, strategy]);

  const over = state.status === 'finished' || state.status === 'stuck';
  useEffect(() => {
    if (over) setRunning(false);
  }, [over]);

  const nodes: Node[] = useMemo(() => {
    const radius = 250;
    return [
      { id: 'p0', type: 'peer', position: { x: 0, y: 0 }, data: { index: 0 }, selectable: false },
      ...Array.from({ length: data.leechers }, (_, i) => {
        const angle = (2 * Math.PI * i) / data.leechers - Math.PI / 2;
        return {
          id: `p${i + 1}`,
          type: 'peer',
          // Эллипс, а не круг: кадр шире, чем выше.
          position: { x: Math.cos(angle) * radius * 1.35, y: Math.sin(angle) * radius * 0.8 },
          data: { index: i + 1 },
          selectable: false,
        };
      }),
    ];
  }, [data.leechers]);

  const edges: Edge[] = useMemo(
    () =>
      state.transfers.map((item) => ({
        id: `${state.tick}-${item.from}-${item.to}`,
        source: `p${item.from}`,
        target: `p${item.to}`,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'straight',
        animated: true,
        className: item.from === 0 ? 'swarm-edge swarm-edge--seed' : 'swarm-edge',
      })),
    [state.tick, state.transfers],
  );

  const done = state.have.slice(1).filter((row) => row.every(Boolean)).length;
  const copies = Array.from({ length: data.pieces }, (_, piece) => swarmCopies(state, piece));
  const rarest = Math.min(...copies);
  const lost = copies.filter((count) => count === 0).length;

  const verdict = text(`swarm.${state.status}`)
    .replace('{tick}', String(state.tick))
    .replace('{done}', String(done))
    .replace('{total}', String(data.leechers))
    .replace('{lost}', String(lost));

  return (
    <div className="swarm">
      <div className="noisy__controls">
        <span className="noisy__label">{text('swarm.strategy')}</span>
        {data.strategies.map((item) => (
          <button
            className={`noisy__policy ${strategy === item ? 'is-on' : ''}`}
            type="button"
            key={item}
            onClick={() => setStrategy(item)}
            aria-pressed={strategy === item}
          >
            {text(`swarm.strategy.${item}`)}
          </button>
        ))}
        <label className="swarm__toggle">
          <input type="checkbox" checked={seedLeaves} onChange={(event) => setSeedLeaves(event.currentTarget.checked)} />
          {text('swarm.seedLeaves')}
        </label>

        <button className="btn noisy__run" type="button" disabled={over} onClick={() => setRunning((on) => !on)}>
          {running ? text('swarm.pause') : text('swarm.start')}
        </button>
        <button
          className="swarm__step"
          type="button"
          disabled={over || running}
          onClick={() => setState((prev) => swarmStep(config, strategy, prev))}
        >
          {text('swarm.step')}
        </button>
        <button className="noisy__reset" type="button" onClick={() => setRun((value) => value + 1)}>
          {text('swarm.reset')}
        </button>
      </div>

      <div className="swarm__stage" style={{ '--flow-height': '440px' } as CSSProperties}>
        <Swarm.Provider value={{ state, labels }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.06 }}
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
        </Swarm.Provider>
      </div>

      <dl className="swarm__stats">
        <div>
          <dt>{text('swarm.tick')}</dt>
          <dd>{state.tick}</dd>
        </div>
        <div>
          <dt>{text('swarm.done')}</dt>
          <dd>
            {done} / {data.leechers}
          </dd>
        </div>
        <div className={rarest === 0 ? 'is-bad' : ''}>
          <dt>{text('swarm.rarest')}</dt>
          <dd>{rarest}</dd>
        </div>
      </dl>

      <p className={`noisy__verdict ${state.status === 'stuck' ? 'is-bad' : ''}`} aria-live="polite">
        {verdict}
      </p>
    </div>
  );
}

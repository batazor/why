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
import type { TransactionFlowData } from '../../code/widgets';

/**
 * Приём и публикация изнутри: два sub-flow.
 *
 * Строка jobs сама служит outbox: команда пишет джобу с пустым `published_at`
 * одной записью, а публикатор потом находит такие строки, отправляет событие и
 * проставляет время. Два групповых узла — две разные транзакции: приём и цикл
 * публикатора. Всё, что внутри рамки приёма, случается целиком или не
 * случается вовсе; в цикле публикатора между отправкой и отметкой есть щель, и
 * из неё берётся повторная доставка.
 *
 * Массив узлов неизменен с первого рендера, а судьба шага в сценарии приходит
 * через контекст. Узлы, собранные заново, React Flow считает новыми: прячет
 * их вместе с линиями и перемеряет — на каждом переключении сценария схема
 * мигала бы (так было у «Шумного соседа»).
 */

interface Props {
  data: TransactionFlowData;
  labels: Record<string, string>;
}

type Scenario = TransactionFlowData['scenarios'][number];

/** Что случилось с шагом в сценарии: прошёл, упал на нём, откатился или не дошёл. */
type Fate = 'done' | 'failed' | 'skipped' | 'undone';

type StepData = { title: string; sub?: string; mono?: boolean };

/** Судьбы шагов текущего сценария — мимо React Flow, см. выше. */
const Fates = createContext<Record<string, Fate>>({});

function StepNode({ id, data }: NodeProps) {
  const step = data as unknown as StepData;
  const fate = useContext(Fates)[id];
  return (
    <div className={`tx-node tx-node--${fate} ${step.mono ? 'tx-node--mono' : ''}`}>
      <Handle type="target" position={Position.Left} className="fnode__handle" />
      <Handle type="target" id="top" position={Position.Top} className="fnode__handle" />
      <span>{step.title}</span>
      {step.sub && <span className="tx-node__sub">{step.sub}</span>}
      <Handle type="source" position={Position.Right} className="fnode__handle" />
      <Handle type="source" id="bottom" position={Position.Bottom} className="fnode__handle" />
    </div>
  );
}

/** Рамка транзакции — родитель sub-flow. Подпись в углу, как у группы в LikeC4. */
function GroupNode({ id, data }: NodeProps) {
  const group = data as unknown as { title: string; tone: 'accent' | 'muted' };
  const fate = useContext(Fates)[id];
  return (
    <div className={`tx-group tx-group--${group.tone} tx-group--${fate}`}>
      <span className="tx-group__title">{group.title}</span>
    </div>
  );
}

const nodeTypes = { step: StepNode, group: GroupNode };

/**
 * Судьба каждого шага в сценарии.
 *
 * `undone` — шаг выполнился, но транзакция откатилась, и следа от него не
 * осталось. Этим упавшая транзакция отличается от упавшего запроса.
 */
const FATES: Record<Scenario, Record<string, Fate>> = {
  ok: {
    command: 'done', tx: 'done', begin: 'done', insert: 'done', commit: 'done',
    cycle: 'done', select: 'done', publish: 'done', mark: 'done', mq: 'done',
  },
  crash: {
    command: 'failed', tx: 'undone', begin: 'undone', insert: 'undone', commit: 'skipped',
    cycle: 'skipped', select: 'skipped', publish: 'skipped', mark: 'skipped', mq: 'skipped',
  },
  redeliver: {
    command: 'done', tx: 'done', begin: 'done', insert: 'done', commit: 'done',
    cycle: 'done', select: 'done', publish: 'done', mark: 'failed', mq: 'done',
  },
};

/** Шаг группы: позиции детей — от левого верхнего угла рамки. */
const child = (id: string, parent: string, row: number, data: StepData): Node => ({
  id,
  type: 'step',
  parentId: parent,
  extent: 'parent',
  position: { x: 24, y: 48 + row * 80 },
  data: { ...data, mono: true },
});

export default function TransactionFlow({ data, labels }: Props) {
  const text = (key: string) => labels[key] ?? key;
  const [scenario, setScenario] = useState<Scenario>(data.scenarios[0]);
  const fate = FATES[scenario];

  const nodes: Node[] = useMemo(
    () => [
      {
        id: 'command',
        type: 'step',
        position: { x: 0, y: 128 },
        data: { title: 'job-command' },
      },
      {
        id: 'tx',
        type: 'group',
        position: { x: 220, y: 0 },
        style: { width: 280, height: 300 },
        data: { title: text('tx.group'), tone: 'accent' },
        selectable: false,
      },
      child('begin', 'tx', 0, { title: 'BEGIN' }),
      child('insert', 'tx', 1, { title: 'INSERT INTO jobs', sub: 'published_at = NULL' }),
      child('commit', 'tx', 2, { title: 'COMMIT' }),
      {
        id: 'cycle',
        type: 'group',
        position: { x: 580, y: 0 },
        style: { width: 300, height: 300 },
        data: { title: text('tx.cycle'), tone: 'muted' },
        selectable: false,
      },
      child('select', 'cycle', 0, { title: 'SELECT … FROM jobs', sub: 'WHERE published_at IS NULL' }),
      child('publish', 'cycle', 1, { title: 'PUBLISH', sub: 'job queued' }),
      child('mark', 'cycle', 2, { title: 'UPDATE jobs', sub: 'SET published_at = now()' }),
      {
        id: 'mq',
        type: 'step',
        position: { x: 960, y: 128 },
        data: { title: 'MQ' },
      },
    ],
    [labels],
  );

  const edges: Edge[] = useMemo(() => {
    const arrow = {
      type: MarkerType.ArrowClosed,
      width: 12,
      height: 12,
      markerUnits: 'userSpaceOnUse',
    };
    const line = (
      id: string,
      source: string,
      target: string,
      extra: Partial<Edge> = {},
    ): Edge => ({
      id,
      source,
      target,
      markerEnd: arrow,
      className: `tx-edge tx-edge--${fate[target]}`,
      ...extra,
    });
    const down = { sourceHandle: 'bottom', targetHandle: 'top' };

    return [
      line('command-begin', 'command', 'begin'),
      line('begin-insert', 'begin', 'insert', down),
      line('insert-commit', 'insert', 'commit', down),
      line('commit-select', 'commit', 'select', { label: text('tx.afterCommit') }),
      line('select-publish', 'select', 'publish', down),
      line('publish-mark', 'publish', 'mark', down),
      line('publish-mq', 'publish', 'mq', {
        // Повторная доставка — подпись на стрелке: два сообщения об одной джобе.
        label: scenario === 'redeliver' ? '×2' : undefined,
      }),
    ];
  }, [scenario, labels]);

  /** Что осталось после сценария — строка под схемой. */
  const state = {
    ok: { jobs: 1, published: text('tx.sent'), mq: 1 },
    crash: { jobs: 0, published: '—', mq: 0 },
    redeliver: { jobs: 1, published: text('tx.unsent'), mq: 2 },
  }[scenario];

  return (
    <div className="tx">
      <div className="tx__controls" role="radiogroup" aria-label={text('tx.scenario')}>
        <span className="tx__label">{text('tx.scenario')}</span>
        {data.scenarios.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={scenario === key}
            className={`tx__scenario ${scenario === key ? 'is-on' : ''}`}
            onClick={() => setScenario(key)}
          >
            {text(`tx.scenario.${key}`)}
          </button>
        ))}
      </div>

      <div className="tx__stage" style={{ '--flow-height': '320px' } as CSSProperties}>
        <Fates.Provider value={fate}>
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
        </Fates.Provider>
      </div>

      <dl className="tx__state">
        <div>
          <dt>{text('tx.jobs')}</dt>
          <dd>{state.jobs}</dd>
        </div>
        <div>
          <dt>{text('tx.published')}</dt>
          <dd>{state.published}</dd>
        </div>
        <div>
          <dt>{text('tx.mq')}</dt>
          <dd className={state.mq > 1 ? 'is-warn' : ''}>{state.mq}</dd>
        </div>
      </dl>

      <p className="tx__verdict" aria-live="polite">
        {text(`tx.verdict.${scenario}`)}
      </p>
    </div>
  );
}

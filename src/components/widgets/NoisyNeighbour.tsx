import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { NoisyNeighbourData } from '../../code/widgets';

/**
 * Шумный сосед: три пользователя, один пул воркеров и выбор порядка.
 *
 * Прозой это звучит безобидно — «один пользователь может занять собой пул».
 * Цифра делает из этого другое утверждение: при общей очереди сосед, залпом
 * бросивший четыреста джоб, отодвигает двух остальных на минуты, и ни одна
 * джоба при этом не потеряна — система работает ровно так, как написана.
 *
 * Переключатель порядка — весь ответ: те же воркеры, тот же поток, другое
 * правило выбора следующей джобы.
 */

interface Props {
  data: NoisyNeighbourData;
  labels: Record<string, string>;
}

/** Сколько секунд симуляции проходит за один тик. */
const STEP = 0.5;
const TICK_MS = 120;

type Job = { tenant: string; at: number };

type Sim = {
  now: number;
  queues: Record<string, Job[]>;
  /** Дробные остатки прихода: 0.4 джобы в тик копятся, а не теряются. */
  pending: Record<string, number>;
  running: { tenant: string; until: number }[];
  done: Record<string, number>;
  waitTotal: Record<string, number>;
  credits: Record<string, number>;
};

type Shot = {
  now: number;
  waiting: Record<string, number>;
  done: Record<string, number>;
  wait: Record<string, number>;
  busy: number;
  /** Чья джоба занимает каждый слот пула. Это и есть главная картинка. */
  slots: string[];
};

type CardData = {
  title: string;
  rows: [string, string][];
  tone?: string;
  /** Индекс арендатора: он же цвет карточки, полосы и слотов в пуле. */
  tenant?: number;
  /** Доля очереди от самой длинной: полоса под заголовком. */
  fill?: number;
  /** Слоты пула: индекс арендатора в каждом занятом, null — свободен. */
  slots?: (number | null)[];
  /**
   * Сколько входов слева. У планировщика — по одному на арендатора: три линии,
   * сходящиеся в одну точку, читаются как одна толстая, и сравнивать их нечем.
   */
  inputs?: number;
};

/**
 * Живое содержимое карточек — мимо React Flow.
 *
 * Узлы, собранные заново на каждом тике, React Flow считает новыми: замер у
 * нового объекта пустой, узел прячется вместе со своими линиями и меряется
 * снова. Восемь раз в секунду это давало мерцание, а при совпадении с
 * подгонкой вьюпорта — пустое полотно. Поэтому массив узлов неизменен с
 * первого рендера, а числа карточки берут отсюда.
 */
const LiveCards = createContext<Record<string, CardData>>({});

function Card({ id }: NodeProps) {
  const card = useContext(LiveCards)[id];
  const inputs = card.inputs ?? 1;

  return (
    <div
      className={[
        'noisy-node',
        card.tone ? `noisy-node--${card.tone}` : '',
        card.tenant !== undefined ? `noisy-node--t${card.tenant}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {Array.from({ length: inputs }, (_, i) => (
        <Handle
          key={i}
          id={`in${i}`}
          type="target"
          position={Position.Left}
          className="fnode__handle"
          style={{ top: `${((i + 1) / (inputs + 1)) * 100}%` }}
        />
      ))}
      <span className="noisy-node__title">{card.title}</span>

      {/* Полоса длиннее любой цифры объясняет, у кого очередь: числа рядом
          приходится сравнивать, полосы видно сразу. */}
      {card.fill !== undefined && (
        <span className="noisy-node__bar">
          <span className="noisy-node__fill" style={{ width: `${Math.round(card.fill * 100)}%` }} />
        </span>
      )}

      {/* Слоты пула в цветах арендаторов — вся мысль врезки одной строкой:
          при общей очереди все восемь одного цвета. */}
      {card.slots && (
        <span className="noisy-node__slots">
          {card.slots.map((slot, i) => (
            <span
              className={`noisy-slot ${slot === null ? 'is-free' : `noisy-slot--t${slot}`}`}
              key={i}
            />
          ))}
        </span>
      )}

      {card.rows.map(([name, value]) => (
        <span className="noisy-node__row" key={name}>
          <span>{name}</span>
          <b>{value}</b>
        </span>
      ))}
      <Handle type="source" position={Position.Right} className="fnode__handle" />
    </div>
  );
}

const nodeTypes = { card: Card };

/**
 * Раскладка схемы в координатах React Flow.
 *
 * Карточка арендатора — заголовок, полоса и три строки, около 118 единиц в
 * высоту. Шаг в 165 оставляет между ними почти половину карточки воздуха,
 * иначе три карточки читаются одним столбцом, а не тремя очередями.
 *
 * Промежутки между колонками одинаковые — по 100: карточка 208 в ширину,
 * планировщик 232. Разные промежутки глаз читает как смысл, которого нет.
 * Планировщик и пул стоят по центру столбца: к ним сходятся стрелки, и перекос
 * был бы виден сразу.
 */
const LAYOUT = {
  row: 165,
  card: 118,
  schedulerX: 308,
  poolX: 640,
};

export default function NoisyNeighbour({ data, labels }: Props) {
  const text = (key: string) => labels[key] ?? key;

  const [policy, setPolicy] = useState(data.policies[0]);
  const [running, setRunning] = useState(false);
  const [shot, setShot] = useState<Shot>(() => empty(data));

  const sim = useRef<Sim>(start(data));

  /**
   * Подгонка схемы под полотно — не разовая.
   *
   * `fitView` у React Flow срабатывает один раз, при первом замере узлов. Всё,
   * что меняет размеры потом, — ширина окна, догрузившийся шрифт, выросшая
   * карточка, — уже не учитывается, и первым за край уезжает самый правый
   * узел: пул воркеров. Поэтому схема переподгоняется при каждом изменении
   * размера полотна и при каждом изменении размера любого узла.
   */
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const refitTimer = useRef<ReturnType<typeof setTimeout>>();

  /**
   * Подгонка откладывается на такт, а не зовётся сразу.
   *
   * React Flow узнаёт новый размер полотна из собственного наблюдателя, и наш
   * срабатывает раньше: `fitView`, позванный синхронно, считает по старой
   * ширине и ставит тот же масштаб — полотно сузилось, а пул так и торчит за
   * краем. Пятьдесят миллисекунд хватает, чтобы размер дошёл до React Flow.
   */
  const refit = () => {
    clearTimeout(refitTimer.current);
    refitTimer.current = setTimeout(() => flow?.fitView({ padding: 0.06 }), 50);
  };

  useEffect(() => {
    if (!flow || !stage.current) return;
    refit();
    const observer = new ResizeObserver(refit);
    observer.observe(stage.current);
    return () => {
      observer.disconnect();
      clearTimeout(refitTimer.current);
    };
  }, [flow]);

  const onNodesChange = (changes: NodeChange[]) => {
    if (changes.some((change) => change.type === 'dimensions')) refit();
  };

  /** Порядок меняется на ходу: очереди остаются, меняется правило выбора. */
  useEffect(() => {
    if (!running) return;

    const id = setInterval(() => {
      tick(sim.current, data, policy);
      setShot(snapshot(sim.current, data));
    }, TICK_MS);

    return () => clearInterval(id);
  }, [running, policy, data]);

  const reset = () => {
    sim.current = start(data);
    setShot(empty(data));
    setRunning(false);
  };

  /** Шумный — тот, у кого залп. Его и бросаем ещё раз по кнопке. */
  const noisy = data.tenants.reduce((a, b) => (b.burst > a.burst ? b : a));

  /**
   * Ещё один залп посреди прогона.
   *
   * Первый приходит на старте, когда смотреть ещё не на что. Второй читатель
   * бросает сам, в уже устоявшуюся систему, — и видит, как при общей очереди
   * соседи снова встают, а при справедливой почти не замечают.
   */
  const burst = () => {
    const now = sim.current.now;
    for (let i = 0; i < noisy.burst; i += 1) {
      sim.current.queues[noisy.key].push({ tenant: noisy.key, at: now });
    }
    setShot(snapshot(sim.current, data));
  };

  const clock = `${String(Math.floor(shot.now / 60)).padStart(2, '0')}:${String(
    Math.floor(shot.now % 60),
  ).padStart(2, '0')}`;

  /**
   * Вывод одной строкой под схемой: то, что читатель должен был увидеть в
   * цифрах, сказанное словами. Он же читается скринридером — схема для него
   * набор узлов, а не картина.
   */
  const verdict = (() => {
    if (shot.now === 0) return text('noisy.idle');

    const name = (key: string) => text(`noisy.tenant.${key}`);
    const starved = data.tenants.find(
      (tenant) => shot.done[tenant.key] === 0 && shot.waiting[tenant.key] > 0,
    );
    if (starved && shot.now > data.jobSeconds * 2) {
      return text('noisy.starved').replace('{tenant}', name(starved.key));
    }

    const served = data.tenants.filter((tenant) => shot.done[tenant.key] > 0);
    if (served.length < 2) return text('noisy.idle');

    const slow = served.reduce((a, b) => (shot.wait[b.key] > shot.wait[a.key] ? b : a));
    const fast = served.reduce((a, b) => (shot.wait[b.key] < shot.wait[a.key] ? b : a));
    const ratio = shot.wait[slow.key] / Math.max(shot.wait[fast.key], 0.1);

    if (ratio < 2) return text('noisy.even');
    return text('noisy.gap')
      .replace('{slow}', name(slow.key))
      .replace('{fast}', name(fast.key))
      .replace('{ratio}', ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1));
  })();

  const index = useMemo(
    () => Object.fromEntries(data.tenants.map((tenant, i) => [tenant.key, i])),
    [data],
  );

  const cards: Record<string, CardData> = useMemo(() => {
    const longest = Math.max(1, ...data.tenants.map((tenant) => shot.waiting[tenant.key]));

    const tenants = Object.fromEntries(
      data.tenants.map((tenant, i) => [
        tenant.key,
        {
          title: text(`noisy.tenant.${tenant.key}`),
          tenant: i,
          fill: shot.waiting[tenant.key] / longest,
          rows: [
            [text('noisy.waiting'), String(shot.waiting[tenant.key])],
            [text('noisy.done'), String(shot.done[tenant.key])],
            [text('noisy.wait'), `${shot.wait[tenant.key].toFixed(1)} s`],
          ] as [string, string][],
        },
      ]),
    );

    const slots = Array.from({ length: data.workers }, (_, i) =>
      shot.slots[i] === undefined ? null : index[shot.slots[i]],
    );

    return {
      ...tenants,
      scheduler: {
        title: text('noisy.queue'),
        tone: 'accent',
        inputs: data.tenants.length,
        rows: [[text('noisy.policy'), text(`noisy.policy.${policy}`)]],
      },
      pool: {
        title: text('noisy.workers'),
        slots,
        rows: [
          [text('noisy.slots'), `${shot.busy} / ${data.workers}`],
          [text('noisy.seconds'), `${data.jobSeconds} s`],
        ],
      },
    };
  }, [shot, policy, data, labels, index]);

  /**
   * Узлы — только раскладка, и она не меняется за всю жизнь врезки. Всё живое
   * карточка берёт из `LiveCards`.
   */
  const nodes: Node[] = useMemo(() => {
    // Центр столбца арендаторов: от верха первой карточки до низа последней.
    const middle = ((data.tenants.length - 1) * LAYOUT.row + LAYOUT.card) / 2;

    return [
      ...data.tenants.map((tenant, i) => ({
        id: tenant.key,
        type: 'card',
        position: { x: 0, y: i * LAYOUT.row },
        data: {},
      })),
      {
        id: 'scheduler',
        type: 'card',
        position: { x: LAYOUT.schedulerX, y: middle - 34 },
        data: {},
      },
      {
        id: 'pool',
        type: 'card',
        position: { x: LAYOUT.poolX, y: middle - 68 },
        data: {},
      },
    ];
  }, [data]);

  /**
   * Линии связи показывают то же, что слоты пула, но на пути к нему.
   *
   * Цвет — арендатор, толщина — его доля пула прямо сейчас, подпись — сколько
   * слотов из скольких. При общей очереди одна линия заметно толще, две —
   * бледные нитки; при справедливой все три одной толщины.
   *
   * Линии неподвижны. Бегущий пунктир перерисовывался на каждом тике симуляции
   * — восемь раз в секунду — и толстая линия мерцала; движение здесь и так видно
   * по слотам и числам, линии нужно только показывать долю.
   */
  const edges: Edge[] = useMemo(() => {
    const share = (key: string) => shot.slots.filter((slot) => slot === key).length;

    /**
     * Стрелка одного размера при любой толщине линии.
     *
     * По умолчанию маркер SVG меряется толщиной линии: стрелка в 14 при линии в
     * 7 становится стрелкой в сто, и конец линии превращается в треугольник
     * размером с карточку. `userSpaceOnUse` меряет её в координатах схемы.
     */
    const arrow = (color: string) => ({
      type: MarkerType.ArrowClosed,
      color,
      width: 12,
      height: 12,
      markerUnits: 'userSpaceOnUse',
    });

    /** Толщина от 1.5 до 4.5: разница видна, а верёвкой линия не становится. */
    const weight = (part: number) => 1.5 + part * 3;

    return [
      ...data.tenants.map((tenant, i) => {
        const taken = share(tenant.key);
        const color = `var(--tenant-${i})`;

        return {
          id: `${tenant.key}-scheduler`,
          source: tenant.key,
          target: 'scheduler',
          targetHandle: `in${i}`,
          label: `${taken}/${data.workers}`,
          labelShowBg: true,
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 999,
          labelStyle: { fill: color, fontWeight: 600, fontSize: 11 },
          labelBgStyle: { fill: 'var(--panel)' },
          markerEnd: arrow(color),
          style: {
            stroke: color,
            strokeWidth: weight(taken / data.workers),
            // Арендатор без единого слота — пунктиром и бледно: он есть, но
            // сейчас до пула не доходит.
            strokeDasharray: taken ? undefined : '3 5',
            opacity: taken ? 0.9 : 0.4,
            transition: 'stroke-width 0.4s ease, opacity 0.4s ease',
          },
        };
      }),
      {
        id: 'scheduler-pool',
        source: 'scheduler',
        target: 'pool',
        targetHandle: 'in0',
        markerEnd: arrow('var(--accent)'),
        style: {
          stroke: 'var(--accent)',
          strokeWidth: weight(shot.busy / data.workers),
          opacity: shot.busy ? 0.9 : 0.4,
          transition: 'stroke-width 0.4s ease, opacity 0.4s ease',
        },
      },
    ];
  }, [shot, data]);

  return (
    <div className="noisy">
      <div className="noisy__controls">
        <span className="noisy__label">{text('noisy.policy')}</span>
        {data.policies.map((item) => (
          <button
            className={`noisy__policy ${policy === item ? 'is-on' : ''}`}
            type="button"
            key={item}
            onClick={() => setPolicy(item)}
            aria-pressed={policy === item}
          >
            {text(`noisy.policy.${item}`)}
          </button>
        ))}

        <span className="noisy__clock" aria-label={text('noisy.time')}>
          {clock}
        </span>
        <button className="btn noisy__run" type="button" onClick={() => setRunning((on) => !on)}>
          {running ? text('noisy.pause') : text('noisy.start')}
        </button>
        <button className="noisy__burst" type="button" onClick={burst} disabled={!running}>
          {text('noisy.burst')}
        </button>
        <button className="noisy__reset" type="button" onClick={reset}>
          {text('noisy.reset')}
        </button>
      </div>

      <div
        className="noisy__stage"
        ref={stage}
        style={{ '--flow-height': '440px' } as CSSProperties}
      >
        <LiveCards.Provider value={cards}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={setFlow}
            onNodesChange={onNodesChange}
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
            minZoom={0.4}
            maxZoom={1.4}
            proOptions={{ hideAttribution: true }}
          />
        </LiveCards.Provider>
      </div>

      <p className="noisy__verdict" aria-live="polite">
        {verdict}
      </p>
    </div>
  );
}

function start(data: NoisyNeighbourData): Sim {
  const by = <T,>(value: (key: string) => T) =>
    Object.fromEntries(data.tenants.map((tenant) => [tenant.key, value(tenant.key)]));

  return {
    now: 0,
    // Залп приходит сразу: именно он и делает соседа шумным.
    queues: by((key) => {
      const tenant = data.tenants.find((item) => item.key === key)!;
      return Array.from({ length: tenant.burst }, () => ({ tenant: key, at: 0 }));
    }),
    pending: by(() => 0),
    running: [],
    done: by(() => 0),
    waitTotal: by(() => 0),
    credits: by(() => 0),
  };
}

function empty(data: NoisyNeighbourData): Shot {
  const by = (value: number) =>
    Object.fromEntries(data.tenants.map((tenant) => [tenant.key, value]));
  const waiting = Object.fromEntries(
    data.tenants.map((tenant) => [tenant.key, tenant.burst]),
  );
  return { now: 0, waiting, done: by(0), wait: by(0), busy: 0, slots: [] };
}

function snapshot(sim: Sim, data: NoisyNeighbourData): Shot {
  const waiting = Object.fromEntries(
    data.tenants.map((tenant) => [tenant.key, sim.queues[tenant.key].length]),
  );
  const wait = Object.fromEntries(
    data.tenants.map((tenant) => [
      tenant.key,
      sim.done[tenant.key] ? sim.waitTotal[tenant.key] / sim.done[tenant.key] : 0,
    ]),
  );
  return {
    now: sim.now,
    waiting,
    done: { ...sim.done },
    wait,
    busy: sim.running.length,
    slots: sim.running.map((job) => job.tenant),
  };
}

/**
 * Один тик: пришло, доработало, разобрали свободные слоты.
 *
 * Порядок именно такой. Разбирать очередь до того, как освободились слоты,
 * значит держать пул недогруженным на целый тик — и симуляция начнёт врать в
 * пользу любой политики одинаково, но заметно.
 */
function tick(sim: Sim, data: NoisyNeighbourData, policy: string) {
  sim.now += STEP;

  for (const tenant of data.tenants) {
    sim.pending[tenant.key] += tenant.rate * STEP;
    while (sim.pending[tenant.key] >= 1) {
      sim.pending[tenant.key] -= 1;
      sim.queues[tenant.key].push({ tenant: tenant.key, at: sim.now });
    }
  }

  sim.running = sim.running.filter((job) => {
    if (job.until > sim.now) return true;
    sim.done[job.tenant] += 1;
    return false;
  });

  while (sim.running.length < data.workers) {
    const job = take(sim, data, policy);
    if (!job) break;
    sim.waitTotal[job.tenant] += sim.now - job.at;
    sim.running.push({ tenant: job.tenant, until: sim.now + data.jobSeconds });
  }
}

/**
 * Чья джоба поедет следующей.
 *
 * `fifo` — общая очередь: побеждает тот, кто пришёл раньше, и залп соседа
 * стоит впереди всех остальных.
 *
 * `fair` и `weighted` — одна механика с разным весом: у каждого арендатора свой
 * счёт, берут у того, у кого счёт больше, потом счёт уменьшают. Когда брать не
 * у кого, счета пополняются на вес. Так очередь делится между арендаторами, а
 * не между джобами.
 */
function take(sim: Sim, data: NoisyNeighbourData, policy: string): Job | undefined {
  const ready = data.tenants.filter((tenant) => sim.queues[tenant.key].length);
  if (!ready.length) return undefined;

  if (policy === 'fifo') {
    const first = ready.reduce((best, tenant) =>
      sim.queues[tenant.key][0].at < sim.queues[best.key][0].at ? tenant : best,
    );
    return sim.queues[first.key].shift();
  }

  const weightOf = (key: string) =>
    policy === 'weighted' ? data.tenants.find((item) => item.key === key)!.weight : 1;

  if (ready.every((tenant) => sim.credits[tenant.key] <= 0)) {
    for (const tenant of ready) sim.credits[tenant.key] += weightOf(tenant.key);
  }

  const next = ready.reduce((best, tenant) =>
    sim.credits[tenant.key] > sim.credits[best.key] ? tenant : best,
  );
  sim.credits[next.key] -= 1;
  return sim.queues[next.key].shift();
}

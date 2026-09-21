import type { P2PModel, SwarmSimData, SwarmStrategy } from './widgets';

/**
 * Формулы разбора P2P-сети и симуляция роя.
 *
 * Чистые функции без интерфейса: их зовёт врезка в браузере и node, когда
 * нужно сверить числа в тексте с тем, что покажет калькулятор. Поэтому импорт
 * здесь только типовой — node исполняет файл как есть.
 */

const MBIT = 1_000_000;
const GIB = 1024 ** 3;
const KIB = 1024;

export type P2PResult = { out: Record<string, number>; verdict: string };

/**
 * Время раздачи файла N получателям: один сервер против роя.
 *
 * Жидкостная модель из учебника Куроуза и Росса. Сервер обязан выгрузить N
 * копий сам, поэтому его время растёт линейно с N. В рое отдают все: общая
 * отдача — сид плюс N пиров, и с ростом N она растёт вместе с потребностью.
 * Снизу оба времени подпирают два предела: сид хотя бы раз выгружает файл
 * целиком, и получатель не скачает быстрее своего канала.
 */
function swarm(v: Record<string, number>): P2PResult {
  const bits = v.fileGb * GIB * 8;
  const seed = v.seedMbps * MBIT;
  const up = v.upMbps * MBIT;
  const down = v.downMbps * MBIT;

  const bySeed = bits / seed;
  const byDownload = bits / down;
  const byUpload = (v.peers * bits) / (seed + v.peers * up);

  const clientServer = Math.max((v.peers * bits) / seed, byDownload);
  const p2p = Math.max(bySeed, byDownload, byUpload);

  const verdict = p2p === byUpload ? 'upload' : p2p === byDownload ? 'download' : 'seed';

  const fileBytes = v.fileGb * GIB;
  const pieces = Math.ceil(fileBytes / (v.pieceKb * KIB));

  return {
    out: {
      clientServer,
      p2p,
      speedup: clientServer / p2p,
      seedEgressCs: v.peers * fileBytes,
      // Сид отдаёт на полной скорости всё время раздачи, но не больше, чем
      // отдал бы в одиночку.
      seedEgressP2p: Math.min(v.peers * fileBytes, (seed * p2p) / 8),
      pieces,
      // SHA-1 на кусок — 20 байт; это почти весь вес .torrent-файла.
      metainfo: pieces * 20,
      // Карта наличия: бит на кусок, уходит каждому соседу при рукопожатии.
      bitfield: pieces / 8,
    },
    verdict,
  };
}

/**
 * Трекер против DHT: одна и та же работа — «кто раздаёт этот файл» — на одном
 * сервисе или размазанная по всем узлам.
 *
 * Шаги поиска — верхняя оценка Kademlia: каждый шаг хотя бы вдвое сокращает
 * XOR-расстояние до цели, а последние k узлов уже лежат в одном бакете.
 */
function dht(v: Record<string, number>): P2PResult {
  const interval = v.announceMin * 60;
  const trackerRps = (v.nodes * v.torrentsPerNode) / interval;

  const hops = Math.max(1, Math.ceil(Math.log2(v.nodes / v.k)));
  const lookupMessages = hops * v.alpha;
  const contacts = hops * v.k;

  // Анонс в DHT — поиск k ближайших к хешу плюс k записей на них.
  const nodeMessages = (v.torrentsPerNode * (lookupMessages + v.k)) / interval;

  const verdict = trackerRps <= 1_000 ? 'tracker' : trackerRps <= 50_000 ? 'cluster' : 'dht';

  return {
    out: {
      trackerRps,
      nodeMessages,
      hops,
      lookup: (hops * v.rttMs) / 1000,
      lookupMessages,
      contacts,
      // Компактная запись узла: 20 байт id, 4 адрес, 2 порт.
      table: contacts * 26,
      // Каждый анонс лежит на k узлах; всего анонсов nodes × torrents.
      records: v.torrentsPerNode * v.k,
    },
    verdict,
  };
}

/**
 * Доживёт ли файл: копии кусков, разбросанные по узлам независимо, против
 * такого же числа полных копий.
 *
 * Файлу нужны все куски разом, поэтому у разбросанных копий вероятности
 * перемножаются по числу кусков — и на тысячах кусков даже 99,9% на кусок
 * дают ноль на файл.
 */
function availability(v: Record<string, number>): P2PResult {
  const offline = 1 - v.onlinePct / 100;
  const pieceUp = 1 - offline ** v.copies;
  const scattered = pieceUp ** v.pieces;
  const whole = pieceUp;

  const target = 0.99;
  const copiesFor = (perPiece: number) => Math.ceil(Math.log(1 - perPiece) / Math.log(offline));

  return {
    out: {
      pieceUp,
      scattered,
      whole,
      copiesScattered: copiesFor(target ** (1 / v.pieces)),
      copiesWhole: copiesFor(target),
    },
    verdict: scattered < 0.5 ? 'dead' : scattered < target ? 'flaky' : 'ok',
  };
}

export function p2pCalculate(model: P2PModel, values: Record<string, number>): P2PResult {
  if (model === 'swarm') return swarm(values);
  if (model === 'dht') return dht(values);
  return availability(values);
}

/* ------------------------------------------------------------------------ */

export type SwarmTransfer = { from: number; to: number; piece: number };

export type SwarmState = {
  tick: number;
  /** have[peer][piece]; peer 0 — сид. */
  have: boolean[][];
  /** Сид ушёл из роя. */
  seedGone: boolean;
  seedUploaded: number;
  /** Передачи последнего такта: их рисуют линиями. */
  transfers: SwarmTransfer[];
  status: 'idle' | 'running' | 'finished' | 'stuck';
  rng: number;
};

export function swarmInit(data: SwarmSimData, seed = data.seed): SwarmState {
  return {
    tick: 0,
    have: [
      Array.from({ length: data.pieces }, () => true),
      ...Array.from({ length: data.leechers }, () => Array.from({ length: data.pieces }, () => false)),
    ],
    seedGone: false,
    seedUploaded: 0,
    transfers: [],
    status: 'idle',
    rng: seed >>> 0 || 1,
  };
}

/** mulberry32: прогон должен повторяться, `Math.random` этого не даёт. */
function next(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(list: T[], state: { rng: number }): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next(state) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Сколько копий куска осталось в рое; ушедший сид не считается. */
export function swarmCopies(state: SwarmState, piece: number): number {
  return state.have.reduce(
    (sum, row, peer) => sum + (row[piece] && !(peer === 0 && state.seedGone) ? 1 : 0),
    0,
  );
}

/**
 * Один такт: каждый узел отдаёт один кусок и принимает один.
 *
 * Кусок, полученный в этом такте, отдавать можно только со следующего —
 * поэтому наличие читается из снимка на начало такта.
 */
export function swarmStep(data: SwarmSimData, strategy: SwarmStrategy, prev: SwarmState): SwarmState {
  if (prev.status === 'finished' || prev.status === 'stuck') return prev;

  const state: SwarmState = {
    ...prev,
    tick: prev.tick + 1,
    have: prev.have.map((row) => [...row]),
    transfers: [],
    status: 'running',
  };
  const before = prev.have;
  const peers = before.length;
  const busy = new Set<number>(state.seedGone ? [0] : []);
  const copies = Array.from({ length: data.pieces }, (_, piece) => swarmCopies(prev, piece));

  const downloaders = shuffle(
    Array.from({ length: peers - 1 }, (_, i) => i + 1).filter((peer) => before[peer].some((has) => !has)),
    state,
  );

  for (const peer of downloaders) {
    // Кусок → кто может его отдать прямо сейчас.
    const offers = new Map<number, number[]>();
    for (let piece = 0; piece < data.pieces; piece += 1) {
      if (before[peer][piece]) continue;
      const holders = [];
      for (let other = 0; other < peers; other += 1) {
        if (other !== peer && !busy.has(other) && before[other][piece]) holders.push(other);
      }
      if (holders.length) offers.set(piece, holders);
    }
    if (!offers.size) continue;

    const available = [...offers.keys()];
    let piece: number;
    if (strategy === 'sequential') {
      piece = Math.min(...available);
    } else if (strategy === 'random') {
      piece = available[Math.floor(next(state) * available.length)];
    } else {
      const rarest = Math.min(...available.map((item) => copies[item]));
      const pool = available.filter((item) => copies[item] === rarest);
      piece = pool[Math.floor(next(state) * pool.length)];
    }

    const holders = offers.get(piece)!;
    const from = holders[Math.floor(next(state) * holders.length)];
    busy.add(from);
    state.have[peer][piece] = true;
    state.transfers.push({ from, to: peer, piece });
    // Раздал — кусок уже не такой редкий: следующий в этом такте выберет другой.
    copies[piece] += 1;
    if (from === 0) state.seedUploaded += 1;
  }

  if (data.seedLeaves && !state.seedGone && state.seedUploaded >= data.pieces) state.seedGone = true;

  const complete = state.have.slice(1).every((row) => row.every(Boolean));
  if (complete) {
    state.status = 'finished';
  } else if (!state.transfers.length) {
    state.status = 'stuck';
  }
  return state;
}

/** Прогон до конца: для проверок в node и для подсчёта исходов. */
export function swarmRun(data: SwarmSimData, strategy: SwarmStrategy, seed = data.seed): SwarmState {
  let state = swarmInit(data, seed);
  for (let i = 0; i < 1_000 && state.status !== 'finished' && state.status !== 'stuck'; i += 1) {
    state = swarmStep(data, strategy, state);
  }
  return state;
}

import type { Board } from '../model';

/**
 * Правка доски — то, что поменялось, а не вся доска.
 *
 * Рисуют обе стороны сразу: кандидат двигает блок, интервьюер тут же
 * дорисовывает кэш. Пришли бы доски целиком — последняя затёрла бы чужую
 * правку. Правка несёт только свои изменения по элементам: какие блоки,
 * связи, требования и маршруты появились или поменялись и какие удалены. Её
 * накладывают на свою доску, и чужие правки остаются на месте. Один и тот же
 * элемент двое поменяли разом — побеждает пришедшая позже, это честно.
 */

interface ListPatch<T> {
  put: T[];
  drop: string[];
}

export interface BoardPatch {
  nodes?: ListPatch<Board['nodes'][number]>;
  edges?: ListPatch<Board['edges'][number]>;
  requirements?: ListPatch<Board['requirements'][number]>;
  api?: ListPatch<Board['api'][number]>;
  estimate?: string;
}

const LISTS = ['nodes', 'edges', 'requirements', 'api'] as const;

function diffList<T extends { id: string }>(from: T[], to: T[]): ListPatch<T> | undefined {
  if (from === to) return undefined;
  const before = new Map(from.map((item) => [item.id, item]));
  const after = new Set(to.map((item) => item.id));
  const put = to.filter((item) => {
    const old = before.get(item.id);
    return old !== item && JSON.stringify(old) !== JSON.stringify(item);
  });
  const drop = from.filter((item) => !after.has(item.id)).map((item) => item.id);
  return put.length || drop.length ? { put, drop } : undefined;
}

function applyList<T extends { id: string }>(list: T[], patch: ListPatch<T> | undefined): T[] {
  if (!patch) return list;
  const dropped = new Set(patch.drop);
  const incoming = new Map(patch.put.map((item) => [item.id, item]));
  const kept = list.filter((item) => !dropped.has(item.id)).map((item) => incoming.get(item.id) ?? item);
  const known = new Set(list.map((item) => item.id));
  return [...kept, ...patch.put.filter((item) => !known.has(item.id) && !dropped.has(item.id))];
}

/** Что поменялось от `from` к `to`; null — ничего. */
export function diffBoard(from: Board, to: Board): BoardPatch | null {
  const patch: BoardPatch = {};
  for (const key of LISTS) {
    const part = diffList<{ id: string }>(from[key], to[key]);
    if (part) (patch as Record<string, unknown>)[key] = part;
  }
  if (from.estimate !== to.estimate) patch.estimate = to.estimate;
  return Object.keys(patch).length ? patch : null;
}

/** Наложить правку на доску. */
export function applyPatch<B extends Board>(board: B, patch: BoardPatch): B {
  const nodes = applyList(board.nodes, patch.nodes);
  const ids = new Set(nodes.map((node) => node.id));
  return {
    ...board,
    nodes,
    // Один удалил блок, пока другой вёл к нему связь, — висящая связь никому не нужна.
    edges: applyList(board.edges, patch.edges).filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    requirements: applyList(board.requirements, patch.requirements),
    api: applyList(board.api, patch.api),
    estimate: patch.estimate ?? board.estimate,
  };
}

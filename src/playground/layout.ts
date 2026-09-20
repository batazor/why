import type { DesignEdge, DesignNode } from './model';

/**
 * Автораскладка схемы: ELK, послойный алгоритм.
 *
 * Расставить десяток блоков руками несложно, но стоит добавить один — и
 * линии снова начинают пересекаться. Послойный алгоритм решает ровно эту
 * задачу: раскладывает граф по слоям слева направо и внутри слоя двигает
 * блоки так, чтобы пересечений связей было меньше.
 *
 * ELK грузится динамически: это полтора мегабайта, и попадать в бандл
 * страницы ради кнопки, которую нажимают раз за схему, ему незачем.
 *
 * Раскладка — помощник, а не истина: ELK считает пересечения для своих
 * ортогональных маршрутов, а рисуем мы своими, в обход блоков. Поэтому пара
 * пересечений после кнопки остаётся, и доводить схему всё равно руками.
 */

export interface NodeSize {
  id: string;
  width: number;
  height: number;
}

/**
 * Расстояния подобраны под наши карточки: между слоями должно помещаться
 * подписью связи, между соседями по слою — оставаться воздух, но не поле.
 */
const OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  /* Коридор между слоями держит подпись связи, между соседями по слою
     остаётся воздух. Шире — не лучше: схема расползается, а пересечений
     столько же. */
  'elk.layered.spacing.nodeNodeBetweenLayers': '140',
  'elk.spacing.nodeNode': '70',
  'elk.spacing.edgeNode': '40',
  'elk.spacing.edgeEdge': '20',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  /** Связь назад (воркер → база) не должна ломать порядок слоёв. */
  'elk.layered.cycleBreaking.strategy': 'GREEDY',
};

export async function autoLayout(
  nodes: DesignNode[],
  edges: DesignEdge[],
  sizes: Map<string, { width: number; height: number }>,
): Promise<Map<string, { x: number; y: number }>> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const elk = new ELK();

  const graph = {
    id: 'root',
    layoutOptions: OPTIONS,
    children: nodes.map((node) => ({
      id: node.id,
      width: sizes.get(node.id)?.width ?? 200,
      height: sizes.get(node.id)?.height ?? 90,
    })),
    // Петли ELK не любит, а на схеме они бывают: блок, зовущий сам себя.
    edges: edges
      .filter((edge) => edge.source !== edge.target)
      .map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  };

  const laid = await elk.layout(graph);
  const placed = new Map<string, { x: number; y: number }>();
  for (const child of laid.children ?? []) {
    if (typeof child.x === 'number' && typeof child.y === 'number') {
      placed.set(child.id, { x: Math.round(child.x), y: Math.round(child.y) });
    }
  }
  return placed;
}

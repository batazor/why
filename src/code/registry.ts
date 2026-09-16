import type { CodeDeck } from './types';
import type { FlowSpec } from './flow';

export type DeckModule = {
  default: CodeDeck;
  /** Схема разбора: рисуется React Flow, состояния зависят от активного шага. */
  flow?: FlowSpec;
  /** Постер: суть проблемы одной схемой (FlowSpec с fixedStep). */
  poster?: FlowSpec;
};

// Единственное место, где резолвятся колоды и схемы. Каталогу нужны постеры,
// странице урока — и постер, и схема; дублировать glob в двух местах значит
// рано или поздно развести их правила.
const decks = import.meta.glob<DeckModule>(
  ['./*.ts', '!./types.ts', '!./registry.ts', '!./flow.ts', '!./*.flow.ts', '!./*.poster.ts'],
  { eager: true },
);

export function getDeck(name: string): DeckModule {
  const deck = decks[`./${name}.ts`];
  if (!deck) throw new Error(`Missing deck src/code/${name}.ts`);
  return deck;
}

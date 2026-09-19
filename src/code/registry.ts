import type { CodeDeck } from './types';
import type { FlowSpec } from './flow';
import type { LikeC4Spec } from './likec4';
import type { FileTreeSpec } from './tree';
import type { WidgetSpec } from './widgets';

export type DeckModule = {
  default: CodeDeck;
  /** Схема разбора: рисуется React Flow, состояния зависят от активного шага. */
  flow?: FlowSpec;
  /** Разбор ведёт модель LikeC4: шаг выбирает view, раскладку считает генератор. */
  likec4?: LikeC4Spec;
  /** Разбор ведёт редактор с деревом файлов: колода объявляет, что и когда в нём появляется. */
  tree?: FileTreeSpec;
  /** Постер: суть проблемы одной схемой (FlowSpec с fixedStep). */
  poster?: FlowSpec;
  /**
   * Обложка картинкой вместо схемы: путь к файлу в public/. Разбору задачи
   * целиком схема-постер не подходит — сути «одной схемой» у него нет, есть
   * сюжет, и его лучше рассказывает иллюстрация.
   */
  cover?: string;
  /**
   * Интерактивные врезки: шаг → калькулятор, сортировка или симулятор.
   *
   * Занимают ту же половину разбора, что схема и редактор: полотно на шаге
   * одно, и врезка на нём — такой же кадр, только его двигает читатель.
   */
  widgets?: WidgetSpec;
};

// Единственное место, где резолвятся колоды и схемы. Каталогу нужны постеры,
// странице урока — и постер, и схема; дублировать glob в двух местах значит
// рано или поздно развести их правила.
const decks = import.meta.glob<DeckModule>(
  [
    './*.ts',
    '!./types.ts',
    '!./registry.ts',
    '!./flow.ts',
    '!./*.flow.ts',
    '!./*.poster.ts',
    '!./widgets.ts',
  ],
  { eager: true },
);

export function getDeck(name: string): DeckModule {
  const deck = decks[`./${name}.ts`];
  if (!deck) throw new Error(`Missing deck src/code/${name}.ts`);
  return deck;
}

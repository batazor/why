/**
 * Описание схемы урока для React Flow.
 *
 * Координаты проставлены руками: React Flow не раскладывает граф сам, и это
 * к лучшему — авторская раскладка читается лучше автоматической.
 *
 * Как и колода кода, схема общая для всех локалей — значит только английский.
 */
export type FlowNodeSpec = {
  id: string;
  /** Тип мелкими капсами над именем: service, external, state, pattern. */
  kind: string;
  title: string;
  sub?: string;
  position: { x: number; y: number };
  /** Рендерится только на этих шагах. По умолчанию — на всех. */
  only?: string[];
  /** Во всю силу на этих шагах, призраком на остальных. По умолчанию — всегда. */
  active?: string[];
  /** Подсвечен кольцом: текущее состояние машины. */
  focus?: string[];
  /** Красный: сломанный или недоступный узел. */
  bad?: string[];
};

export type FlowEdgeSpec = {
  id: string;
  source: string;
  target: string;
  /** Якоря: t | r | b | l. */
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  tone?: 'ok' | 'bad';
  dashed?: boolean;
  /** Показывается только на этих шагах. */
  only?: string[];
};

/**
 * Пометка поверх схемы: стикер со стрелкой, указывающий на то, ради чего шаг.
 *
 * Здесь только геометрия. Текст — проза, а вся проза переводится, поэтому он
 * живёт в `steps[].note` локализованного урока и находится по `step`.
 * Спека общая для локалей, и текста в ней быть не может по тому же правилу,
 * что и у подписей узлов.
 */
export type FlowAnnotationSpec = {
  /** Шаг, на котором пометка показывается. Он же ключ для текста. */
  step: string;
  position: { x: number; y: number };
  /** Куда смотрит стрелка. Без неё пометка просто висит рядом. */
  arrow?: 'up' | 'down' | 'left' | 'right';
  /** Ширина стикера в пикселях; по умолчанию 190. */
  width?: number;
};

export type FlowSpec = {
  /** Высота полотна в пикселях. */
  height: number;
  /**
   * Постер: схема из одного состояния. Здесь указывается тот единственный шаг,
   * на который ссылаются `only`/`active`/`focus`/`bad` её узлов и рёбер.
   * Схема с fixedStep не слушает плеер и не даёт себя таскать и зумить.
   */
  fixedStep?: string;
  /** Компактные карточки: для постера в карточке каталога. */
  compact?: boolean;
  nodes: FlowNodeSpec[];
  edges: FlowEdgeSpec[];
  annotations?: FlowAnnotationSpec[];
};

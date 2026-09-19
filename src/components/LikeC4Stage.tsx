import { useEffect, useRef, useState } from 'react';
import NoteArrow from './NoteArrow';
import type { LikeC4Group, LikeC4Note } from '../code/likec4';
import { LikeC4ModelProvider, LikeC4View, useLikeC4View } from '../likec4/generated';
import type { $ViewId } from '../likec4/generated';

/**
 * Кадр разбора, который рисует LikeC4.
 *
 * Компонент не раскладывает граф и не решает, что на нём видно: и то и другое
 * объявлено в `likec4/*.c4` и посчитано генератором. Здесь остаётся ровно две
 * обязанности — какой view показать и в какой теме.
 *
 * Кадр стоит внутри своего шага и шагов не слушает. Раньше он был один на весь
 * разбор и менял view на каждой смене шага: при быстрой прокрутке подмены шли
 * пачкой, кадры перебивали друг друга, а на стыке со шагом без панели кадр
 * оставался прижатым к верху окна отдельно от своего текста. Кадр внутри шага
 * приезжает и уходит вместе с текстом, и подменять нечего.
 */
export default function LikeC4Stage({
  view,
  tags = false,
  note,
  groups = [],
  bare = false,
}: {
  /** Id view из `likec4/views.c4`. */
  view: string;
  /**
   * Лейблы вида контекста на карточках: core, supporting, generic. Включает их
   * тот шаг, который про виды говорит: подпись, появившаяся раньше объяснения,
   * читается как шум.
   */
  tags?: boolean;
  /** Стикер-пометка поверх кадра: к какому элементу, с какой стороны и что написано. */
  note?: LikeC4Note & { text: string; level: number };
  /** Рамки групп шагов поверх последовательности, с подписями на языке страницы. */
  groups?: (LikeC4Group & { title: string })[];
  /** Без подписей на линиях: только связи. */
  bare?: boolean;
}) {
  const scheme = useColorScheme();

  /**
   * Пропорции кадра берутся у самой схемы — из посчитанной генератором
   * раскладки.
   *
   * Коробка одной высоты на все кадры держала схему по центру: у низкой схемы
   * сверху оставалось пустое поле, и её верх не совпадал с первой строкой
   * текста рядом. Коробка по пропорциям схемы этого поля не создаёт — кадр
   * начинается там же, где текст, а высота остаётся заданной и считается до
   * гидратации, поэтому страница не дёргается.
   */
  const layout = useLikeC4View(view as $ViewId) as
    | {
        _type?: string;
        bounds?: { width: number; height: number };
        sequenceLayout?: { bounds?: { width: number; height: number } };
      }
    | undefined;
  /**
   * Динамический view — это порядок запросов, а не структура. Такой кадр
   * рисуется последовательностью: участники сверху, запросы и ответы по
   * порядку сверху вниз. Решает тип view в модели, а не колода: писать его
   * второй раз в спеке значило бы дать им разойтись.
   */
  const sequence = layout?._type === 'dynamic';
  /**
   * Пропорции — той раскладки, которую рисуем. У динамического view их две:
   * схема вытянута в полосу, последовательность почти вдвое шире высоты.
   * Коробка по пропорциям схемы выходила 1344×168, и последовательность
   * сжималась в ней до масштаба 0.14.
   */
  const bounds = (sequence && layout?.sequenceLayout?.bounds) || layout?.bounds;
  const stage = useRef<HTMLDivElement>(null);

  return (
    /**
     * Контейнер, а не сам LikeC4View: размеры коробки задаёт страница, а
     * полотно обязано в неё вписаться. Предел высоты — `--flow-height`.
     */
    <div
      ref={stage}
      className="likec4-stage"
      style={bounds ? { aspectRatio: `${bounds.width} / ${bounds.height}` } : undefined}
    >
      <LikeC4ModelProvider>
        <LikeC4View
          viewId={view as $ViewId}
          colorScheme={scheme}
          background="transparent"
          /**
           * Шрифт LikeC4 не подключается: на странице свой, и вторая гарнитура
           * ради схемы — лишний запрос и другая картинка, чем в тексте рядом.
           */
          injectFontCss={false}
          /**
           * Зум и панорама есть, но без кнопок и без перехвата прокрутки.
           *
           * Кадр во всю ширину показывает сервис целиком, и мелкие подписи в
           * нём надо уметь рассмотреть. Но полотно стоит посреди статьи, и
           * колесо, которое вместо страницы зумит схему, запирает читателя в
           * кадре. Поэтому: щипок на трекпаде и колесо с зажатым Cmd или Ctrl
           * — зум, перетаскивание — камера, обычное колесо листает страницу.
           *
           * Модального обозревателя по клику по-прежнему нет: увести читателя
           * из разбора значит потерять шаг, на котором он стоял.
           */
          pannable
          zoomable
          reactFlowProps={{
            zoomOnScroll: false,
            panOnScroll: false,
            preventScrolling: false,
            zoomOnPinch: true,
            zoomActivationKeyCode: ['Meta', 'Control'],
            panOnDrag: true,
            zoomOnDoubleClick: true,
          }}
          browser={false}
          controls={false}
          enableElementTags={tags}
          dynamicViewVariant={sequence ? 'sequence' : undefined}
          /**
           * Пропорции полотна не сохраняются: сцена — коробка известных
           * размеров (высоту задаёт `--flow-height`), и схема обязана
           * вписаться в неё, а не растянуть страницу под свою раскладку.
           *
           * Без коробки LikeC4 считает размер сам — и тогда кадр либо
           * съезжает в миниатюру, либо режет карточки по краям. Поэтому
           * коробка есть у всех кадров: и у прилипшей панели, и у тех, что
           * стоят внутри шага.
           */
          keepAspectRatio={false}
          style={{ width: '100%', height: '100%' }}
          fitViewPadding={{ x: 8, y: 12 }}
        />
      </LikeC4ModelProvider>
      {bare && <BareEdges stage={stage} />}
      {groups.length > 0 && <StageGroups stage={stage} groups={groups} />}
      {note && <StageNote stage={stage} note={note} />}
    </div>
  );
}

/** Прямоугольник в координатах кадра. */
type Box = { left: number; top: number; right: number; bottom: number };

/**
 * Следить за схемой LikeC4 и пересчитывать то, что лежит поверх неё.
 *
 * Схему LikeC4 рисует внутри shadow DOM своего контейнера: снаружи её узлов
 * не видно ни поиску, ни наблюдателю изменений. Поэтому и искать, и следить
 * приходится внутри тени. Появляется она не сразу — после гидратации, —
 * отсюда ожидание. Пересчёт — на каждом изменении внутри тени (замер узлов,
 * зум и панорама меняют стили) и на смене размера кадра.
 *
 * `useEffect`, а не `useLayoutEffect`: контейнер кадра приходит ref'ом
 * родителя, а на первом монтировании эффекты раскладки ребёнка выполняются
 * раньше, чем React привяжет ref родительского `div`. `stage.current` там ещё
 * пустой, и стикер не появлялся вовсе.
 *
 * Возвращает способ пересчитать вручную: стикеру он нужен, когда стала
 * известна его настоящая высота.
 */
function useScene(
  stage: React.RefObject<HTMLDivElement | null>,
  measure: (root: HTMLDivElement, scene: ShadowRoot, local: (r: DOMRect) => Box) => void,
  deps: unknown[],
) {
  const latest = useRef(measure);
  latest.current = measure;
  const rerun = useRef<() => void>(() => {});

  useEffect(() => {
    const root = stage.current;
    if (!root) return;

    let frame = 0;
    let wait = 0;
    const scene = () => root.querySelector('.likec4-view')?.shadowRoot ?? null;

    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const shadow = scene();
        if (!shadow) return;
        const box = root.getBoundingClientRect();
        latest.current(root, shadow, (r) => ({
          left: r.left - box.left,
          top: r.top - box.top,
          right: r.right - box.left,
          bottom: r.bottom - box.top,
        }));
      });
    };

    const mutations = new MutationObserver(run);
    const resize = new ResizeObserver(run);
    const attach = () => {
      const shadow = scene();
      if (!shadow) {
        wait = window.setTimeout(attach, 150);
        return;
      }
      /*
       * Только `style` и `transform`: панорама, зум и замер узлов идут через
       * них. Классы LikeC4 перещёлкивает на наведение и подсветку шагов, и
       * пересчёт на каждое такое переключение гонял рамки по кругу.
       */
      mutations.observe(shadow, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['style', 'transform'],
      });
      run();
    };

    rerun.current = run;
    resize.observe(root);
    attach();

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(wait);
      mutations.disconnect();
      resize.disconnect();
    };
  }, deps);

  return rerun;
}

/**
 * Стикер поверх кадра, привязанный к элементу модели.
 *
 * Положение считается по настоящей коробке элемента на экране: LikeC4 рисует
 * узел React Flow с `data-id`, равным id элемента, — внутри shadow DOM своего
 * контейнера. Пока элемент не найден, стикер не показывается: висящая в
 * углу записка хуже её отсутствия.
 */
function StageNote({
  stage,
  note,
}: {
  stage: React.RefObject<HTMLDivElement | null>;
  note: LikeC4Note & { text: string; level: number };
}) {
  const [place, setPlace] = useState<{
    left: number;
    top: number;
    side: LikeC4Note['side'];
  } | null>(null);
  const width = note.width ?? 200;
  /** Сам стикер: его высоту знает только браузер, а она нужна для выбора места. */
  const sticker = useRef<HTMLDivElement>(null);
  /** Высота, по которой выбрано текущее место. */
  const usedHeight = useRef(0);

  /** Длина стрелки: столько между стикером и элементом. */
  const gap = 40;

  const remeasure = useScene(
    stage,
    (root, scene, local) => {
      const target = scene.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${CSS.escape(note.element)}"]`,
      );
      const rect = target?.getBoundingClientRect();
      if (!target || !rect?.width) return setPlace(null);

      const box = root.getBoundingClientRect();
      const own = local(rect);

      /**
       * Что стикеру нельзя закрывать: остальные элементы схемы. Рамки, внутри
       * которых лежит сам элемент (граница сервиса, сервис на C3), — не в
       * счёт: стикер и так стоит внутри них.
       */
      const others = [...scene.querySelectorAll<HTMLElement>('.react-flow__node')]
        .filter((node) => node !== target)
        .map((node) => local(node.getBoundingClientRect()))
        .filter(
          (r) =>
            !(r.left <= own.left && r.top <= own.top && r.right >= own.right && r.bottom >= own.bottom),
        );

      const height = sticker.current?.offsetHeight || 64;
      usedHeight.current = height;
      const midX = (own.left + own.right) / 2;
      const midY = (own.top + own.bottom) / 2;

      const at = (side: LikeC4Note['side']) => {
        const spot = {
          right: { left: own.right + gap, top: midY - 14 },
          left: { left: own.left - gap - width, top: midY - 14 },
          bottom: { left: midX - 12, top: own.bottom + gap },
          top: { left: midX - 12, top: own.top - gap - height },
        }[side];
        // Внутри кадра по ширине: стикер, уехавший за край, читатель не увидит.
        spot.left = Math.min(Math.max(spot.left, 4), box.width - width - 4);
        return { ...spot, side };
      };

      const overlap = (spot: { left: number; top: number }) =>
        others.reduce((sum, r) => {
          const w = Math.min(spot.left + width, r.right) - Math.max(spot.left, r.left);
          const h = Math.min(spot.top + height, r.bottom) - Math.max(spot.top, r.top);
          return sum + (w > 0 && h > 0 ? w * h : 0);
        }, 0);

      /**
       * Сторона из спеки — первая попытка, а не приговор. Под элементом на
       * одном кадре пусто, на другом там стоит соседний сервис, и стикер его
       * закрывал. Поэтому перебор: заданная сторона, противоположная, боковые;
       * берётся первая, где стикер никого не накрывает, а если такой нет — с
       * наименьшим перекрытием. Выход за верх или низ кадра терпим: у низкой
       * схемы-полосы под ней пустая колонка.
       */
      const order: LikeC4Note['side'][] = {
        bottom: ['bottom', 'top', 'right', 'left'],
        top: ['top', 'bottom', 'right', 'left'],
        right: ['right', 'left', 'bottom', 'top'],
        left: ['left', 'right', 'bottom', 'top'],
      }[note.side] as LikeC4Note['side'][];

      const spots = order.map(at);
      const next = spots.find((spot) => overlap(spot) === 0) ?? spots.reduce((a, b) => (overlap(b) < overlap(a) ? b : a));
      // Состояние — только если место правда сдвинулось: новый объект на
      // каждый пересчёт перерисовывал стикер без нужды.
      setPlace((prev) =>
        prev && prev.side === next.side && Math.round(prev.left) === Math.round(next.left) && Math.round(prev.top) === Math.round(next.top)
          ? prev
          : next,
      );
    },
    [note.element, note.side, width],
  );

  /**
   * Первое место выбрано по оценке высоты: до отрисовки стикера её не знает
   * никто. Отрисовали — сверяем; разошлась заметно — выбираем место заново,
   * уже по настоящей коробке.
   */
  useEffect(() => {
    const real = sticker.current?.offsetHeight ?? 0;
    if (real && Math.abs(real - usedHeight.current) > 4) remeasure.current();
  }, [place]);

  if (!place) return null;

  /** Стрелка смотрит на элемент: со стороны, противоположной стикеру. */
  const arrow = { right: 'left', left: 'right', bottom: 'up', top: 'down' }[place.side];

  return (
    <div
      ref={sticker}
      className="fnote likec4-note"
      style={{ left: place.left, top: place.top, width }}
    >
      <div className="fnote__body">
        <span className="fnote__level">{note.level}</span>
        <span className="fnote__text">{note.text}</span>
      </div>
      <span className={`fnote__arrow fnote__arrow--${arrow}`}>
        <NoteArrow />
      </span>
    </div>
  );
}

/**
 * Рамки групп поверх последовательности: «транзакция приёма», «цикл
 * публикатора».
 *
 * У LikeC4 есть фрагменты последовательности, но это слова UML — `opt`,
 * `loop`, `par`, `try`, — и на рамке транзакции `opt` читался бы как
 * «необязательный шаг». К тому же подписи в модели только английские.
 * Поэтому рамка своя: общая коробка линий и подписей шагов с `from` по `to`,
 * подпись — на языке страницы.
 */
/** Место над первым шагом группы, px. Плашка названия стоит в правом углу:
    первый шаг группы идёт слева, и правый угол над ним свободен. */
const GROUP_TITLE = 12;

function StageGroups({
  stage,
  groups,
}: {
  stage: React.RefObject<HTMLDivElement | null>;
  groups: (LikeC4Group & { title: string })[];
}) {
  const [boxes, setBoxes] = useState<(Box & { title: string })[]>([]);

  useScene(
    stage,
    (_root, scene, local) => {
      const step = (n: number) => `step-${String(n).padStart(2, '0')}`;
      const found = groups.map((group) => {
        const parts: Box[] = [];
        for (let n = group.from; n <= group.to; n += 1) {
          const id = step(n);
          for (const el of scene.querySelectorAll<Element>(
            `.react-flow__edge[data-id="${id}"], .likec4-edge-label[data-edge-id="${id}"]`,
          )) {
            const r = el.getBoundingClientRect();
            if (r.width || r.height) parts.push(local(r));
          }
        }
        if (!parts.length) return null;
        // Поля вокруг шагов: рамка не должна резать подписи, но и наезжать
        // на соседнюю группу — шаги разных групп стоят почти вплотную.
        const pad = 8;
        return {
          title: group.title,
          left: Math.min(...parts.map((b) => b.left)) - pad,
          top: Math.min(...parts.map((b) => b.top)) - pad - GROUP_TITLE,
          right: Math.max(...parts.map((b) => b.right)) + pad,
          bottom: Math.max(...parts.map((b) => b.bottom)) + pad,
        };
      });
      const next = found.filter((box): box is Box & { title: string } => box !== null);
      // Соседние группы идут почти вплотную, и выросшая шапка нижней залезла
      // бы в рамку верхней. Верхняя тогда кончается над ней.
      next.sort((a, b) => a.top - b.top);
      for (let k = 1; k < next.length; k += 1) {
        if (next[k - 1].bottom > next[k].top - 4) next[k - 1].bottom = next[k].top - 4;
      }
      /*
       * Рамки меняются, только если сдвинулись. Новый массив на каждый
       * пересчёт перерисовывал их на каждый кадр, перерисовка давала новые
       * изменения, и на видимой вкладке страница вставала намертво.
       */
      const key = (list: (Box & { title: string })[]) =>
        list.map((b) => [b.title, b.left, b.top, b.right, b.bottom].map((v) => (typeof v === 'number' ? Math.round(v) : v)).join(',')).join('|');
      setBoxes((prev) => (key(prev) === key(next) ? prev : next));
    },
    [groups.map((g) => `${g.from}-${g.to}-${g.title}`).join('|')],
  );

  return (
    <>
      {boxes.map((box) => (
        <div
          key={box.title}
          className="likec4-group"
          style={{
            left: box.left,
            top: box.top,
            width: box.right - box.left,
            height: box.bottom - box.top,
          }}
        >
          <span className="likec4-group__title">{box.title}</span>
        </div>
      ))}
    </>
  );
}

/**
 * Прячет подписи линий у схемы: остаются только связи.
 *
 * Схема живёт в shadow DOM, и стили страницы туда не проходят. Поэтому стиль
 * кладётся внутрь тени, как только она появилась.
 */
function BareEdges({ stage }: { stage: React.RefObject<HTMLDivElement | null> }) {
  useEffect(() => {
    let wait = 0;
    let style: HTMLStyleElement | null = null;
    const attach = () => {
      const shadow = stage.current?.querySelector('.likec4-view')?.shadowRoot;
      if (!shadow) {
        wait = window.setTimeout(attach, 150);
        return;
      }
      style = document.createElement('style');
      style.textContent = '.likec4-edge-label-container { display: none !important; }';
      shadow.appendChild(style);
    };
    attach();
    return () => {
      clearTimeout(wait);
      style?.remove();
    };
  }, []);
  return null;
}

/**
 * Тема страницы в терминах LikeC4.
 *
 * Тему выбирает читатель, и она лежит в `data-theme` на <html>; если он её не
 * выбирал — атрибута нет, и решает системная настройка. Слушать надо оба
 * источника: переключатель меняет атрибут, система — медиазапрос.
 */
function useColorScheme(): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const root = document.documentElement;
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const read = () => {
      const chosen = root.dataset.theme;
      setScheme(chosen === 'dark' || chosen === 'light' ? chosen : dark.matches ? 'dark' : 'light');
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributeFilter: ['data-theme'] });
    dark.addEventListener('change', read);

    return () => {
      observer.disconnect();
      dark.removeEventListener('change', read);
    };
  }, []);

  return scheme;
}

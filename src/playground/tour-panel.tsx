import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Design } from './model';
import { TOUR, tourDesign, tourText, type TourFocus, type TourStep } from './tour';
import type { T } from './i18n';

type Update = (fn: (design: Design) => Design) => void;

interface Props {
  design: Design;
  update: Update;
  t: T;
  lang: string;
  /** Шаг на экране: какую вкладку открыть, какой блок выбрать, что подсветить. */
  onShow: (step: TourStep) => void;
}

/**
 * Где карточке стоять на полотне, чтобы не закрывать то, о чём шаг: про
 * панель справа и про строку сверху — в правом верхнем углу, про блоки слева —
 * в левом нижнем, про задание и саму доску — в правом нижнем. Шаг без
 * подсветки над пустой доской — посередине: смотреть пока не на что.
 */
const PLACE: Record<TourFocus | 'none', string> = {
  side: 'top-right',
  toolbar: 'top-right',
  palette: 'bottom-left',
  brief: 'bottom-right',
  canvas: 'bottom-right',
  none: 'center',
};

/**
 * Карточка тура поверх полотна: шаги точками, заголовок, текст и
 * «Назад / Дальше». Лежит в сетке песочницы и меряет полотно сама: палитру
 * могут свернуть, окно — сузить, и угол полотна переезжает вместе с ними.
 *
 * Шаг делает свою часть доски, как только на него пришли: тур — показ, а не
 * экзамен. «Назад» возвращает доску, какой она была до шага, — вместе с тем,
 * что человек успел наделать руками.
 */
export function TourDock({ design, update, t, lang, onShow }: Props) {
  const [at, setAt] = useState(0);
  /** Доска до шага с этим номером. */
  const before = useRef<Design[]>([]);
  const step = TOUR[at];
  const last = at === TOUR.length - 1;
  /**
   * Что показано сейчас. Номер шага для этого не годится: «Очистить» остаётся
   * на последнем шаге, а полотно под карточкой всё равно пересоздаётся и
   * подсветка переезжает на блоки слева.
   */
  const [shown, setShown] = useState<{ n: number; focus?: TourFocus }>({ n: 0 });
  const show = (target: TourStep) => {
    setShown((current) => ({ n: current.n + 1, focus: target.focus }));
    onShow(target);
  };

  /**
   * Прямоугольник полотна внутри сетки — от него считаются углы. Верх правого
   * угла — под карточкой задания, если рядом с ней карточке тура не хватает
   * места: задание закрывать нельзя, к нему возвращаются на каждом шаге.
   */
  const card = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ l: number; t: number; w: number; h: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const body = card.current?.parentElement;
    // Полотно пересоздаётся на каждом показе — ищем его заново.
    const canvas = body?.querySelector<HTMLElement>('.pg-canvas');
    if (!body || !canvas) return;
    const brief = canvas.querySelector<HTMLElement>('.pg-brief');
    const measure = () => {
      // Снятое полотно меряется нулём — карточка схлопнулась бы в угол.
      if (!canvas.isConnected) return;
      const origin = body.getBoundingClientRect();
      const area = canvas.getBoundingClientRect();
      const gap = 12;
      const width = card.current?.offsetWidth ?? 0;
      let top = area.top - origin.top + 52;
      if (brief) {
        const note = brief.getBoundingClientRect();
        if (note.right + gap + width > area.right - gap) top = Math.max(top, note.bottom - origin.top + gap);
      }
      setBox({ l: area.left - origin.left, t: area.top - origin.top, w: area.width, h: area.height, top });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    observer.observe(canvas);
    if (brief) observer.observe(brief);
    return () => observer.disconnect();
  }, [shown.n]);
  // Посередине — только над пустой доской: на финише там уже схема и задание.
  const place = shown.focus ? PLACE[shown.focus] : design.nodes.length ? PLACE.canvas : PLACE.none;
  const style = box
    ? ({
        '--tour-l': `${box.l}px`,
        '--tour-t': `${box.t}px`,
        '--tour-w': `${box.w}px`,
        '--tour-h': `${box.h}px`,
        '--tour-top': `${box.top}px`,
      } as CSSProperties)
    : { visibility: 'hidden' as const };

  const go = (next: number) => {
    const target = TOUR[next];
    if (next > at) {
      before.current[next] = design;
      if (target.apply) update((current) => target.apply!(current, lang));
    } else {
      const snapshot = before.current[at];
      if (snapshot) update(() => snapshot);
    }
    setAt(next);
    show(target);
  };

  /** Сначала — чистая доска и первый шаг. */
  const restart = () => {
    before.current = [];
    update(() => tourDesign(lang));
    setAt(0);
    show(TOUR[0]);
  };

  /** Попробовать самому: задание остаётся, доска — пустая. */
  const clear = () => {
    update(() => tourDesign(lang));
    show({ ...TOUR[0], focus: 'palette' });
  };

  const stepOf = t('train.stepOf', { n: String(at + 1), m: String(TOUR.length) });

  return (
    <section ref={card} className={`pg-tour pg-tour--${place}`} style={style} aria-label={t('tour.label')}>
      <header className="pg-tour__head">
        <ol className="pg-stepper" aria-label={stepOf}>
          {TOUR.map((item, index) => (
            <li
              key={item.id}
              className={`pg-stepper__step ${index < at ? 'is-done' : index === at ? 'is-on' : ''}`}
              title={`${index + 1}. ${tourText(item.title, lang)}`}
              aria-current={index === at ? 'step' : undefined}
            >
              <button
                type="button"
                className="pg-stepper__jump"
                aria-label={`${index + 1}. ${tourText(item.title, lang)}`}
                onClick={() => index !== at && jump(index)}
              />
            </li>
          ))}
        </ol>
      </header>
      <h3 className="pg-tour__title">{tourText(step.title, lang)}</h3>
      <p className="pg-tour__text">{tourText(step.body, lang)}</p>
      <div className="pg-tour__actions">
        {last ? (
          <>
            <button type="button" className="pg-button pg-button--primary" onClick={clear}>
              <i className="codicon codicon-clear-all" aria-hidden="true" /> {t('tour.try')}
            </button>
            <button type="button" className="pg-button" onClick={restart}>
              <i className="codicon codicon-refresh" aria-hidden="true" /> {t('tour.again')}
            </button>
          </>
        ) : (
          <button type="button" className="pg-button pg-button--primary" onClick={() => go(at + 1)}>
            {t('tour.next')} <i className="codicon codicon-arrow-right" aria-hidden="true" />
          </button>
        )}
        {at > 0 && (
          <button type="button" className="pg-button" onClick={() => go(at - 1)}>
            <i className="codicon codicon-arrow-left" aria-hidden="true" /> {t('tour.back')}
          </button>
        )}
        <span className="pg-hint pg-tour__count">{stepOf}</span>
      </div>
    </section>
  );

  /** Прыжок по точкам — шагами по одному: каждый шаг доливает своё и запоминает снимок. */
  function jump(index: number) {
    let current = design;
    if (index > at) {
      for (let next = at + 1; next <= index; next += 1) {
        before.current[next] = current;
        current = TOUR[next].apply?.(current, lang) ?? current;
      }
    } else {
      current = before.current[index + 1] ?? current;
    }
    update(() => current);
    setAt(index);
    show(TOUR[index]);
  }
}

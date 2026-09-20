import { useRef, useState, type DragEvent } from 'react';
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react';
import { BLOCKS, CATEGORIES, type BlockCategory } from './catalog';
import { DRAG_TYPE } from './Canvas';
import type { T } from './i18n';

/**
 * Палитра блоков: группы по категориям, поиск и два состояния — раскрытая
 * колонка и узкая полоса значков.
 *
 * Свёрнутая палитра нужна не ради красоты: на ноутбуке полотно отъедает
 * левая колонка, а блоки добавляют пару раз за собеседование. Свёрнутая
 * полоса остаётся рабочей — значок категории раскрывает палитру на ней.
 *
 * Что свёрнуто, помнит браузер: человек настраивает это один раз, а не
 * заново в каждом сценарии.
 */

interface Props {
  t: T;
  onAdd: (kind: string) => void;
}

/** Значок категории — он же кнопка в свёрнутой полосе. */
const CATEGORY_ICON: Record<BlockCategory, string> = {
  client: 'person',
  edge: 'shield',
  compute: 'server-process',
  storage: 'database',
  messaging: 'inbox',
  infra: 'gear',
};

/**
 * Основной блок категории: он стоит в свёрнутой полосе и добавляется щелчком
 * или перетаскиванием прямо оттуда. Остальные — в списке, который
 * раскрывается при наведении.
 */
const PRIMARY: Record<BlockCategory, string> = {
  client: 'user',
  edge: 'lb',
  compute: 'service',
  storage: 'sql',
  messaging: 'queue',
  infra: 'auth',
};

const KEY = 'why:playground:palette';

function readState(): { collapsed: boolean; closed: string[] } {
  try {
    return { collapsed: false, closed: [], ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { collapsed: false, closed: [] };
  }
}

export default function Palette({ t, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState(readState);
  /** Какая категория раскрыта в свёрнутой полосе. */
  const [open, setOpen] = useState<BlockCategory | null>(null);
  const leaving = useRef(0);
  const calm = useReducedMotion();

  /**
   * Меню закрывается с задержкой: курсору нужно время переехать со значка на
   * список, а по дороге он проходит мимо обоих.
   */
  const hover = (category: BlockCategory | null) => {
    clearTimeout(leaving.current);
    if (category) setOpen(category);
    else leaving.current = window.setTimeout(() => setOpen(null), 180);
  };

  const save = (next: { collapsed: boolean; closed: string[] }) => {
    setState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* приватное окно — настройка живёт до перезагрузки */
    }
  };

  const needle = query.trim().toLowerCase();
  const match = (kind: string) =>
    !needle || t(`block.${kind}`).toLowerCase().includes(needle) || kind.includes(needle);

  const found = (category: BlockCategory) => BLOCKS.filter((block) => block.category === category && match(block.kind));
  // Во время поиска закрытые группы раскрываются: иначе находка не видна.
  const isOpen = (category: BlockCategory) => Boolean(needle) || !state.closed.includes(category);

  const toggle = (category: BlockCategory) =>
    save({
      ...state,
      closed: state.closed.includes(category)
        ? state.closed.filter((name) => name !== category)
        : [...state.closed, category],
    });

  const fade = calm ? {} : { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 } };

  /** Перетаскивание одинаково и в полосе, и в списке, и во всплывающем меню. */
  const drag = (kind: string) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(DRAG_TYPE, kind);
      event.dataTransfer.effectAllowed = 'copy';
    },
  });

  if (state.collapsed)
    return (
      <LazyMotion features={domAnimation} strict>
      <aside className="pg-palette pg-palette--rail" onMouseLeave={() => hover(null)}>
        <button
          type="button"
          className="pg-icon-button pg-palette__toggle"
          aria-label={t('palette.expand')}
          title={t('palette.expand')}
          onClick={() => save({ ...state, collapsed: false })}
        >
          <i className="codicon codicon-chevron-right" aria-hidden="true" />
        </button>

        {CATEGORIES.map((category) => {
          const primary = PRIMARY[category];
          return (
            <div
              className="pg-rail__slot"
              key={category}
              onMouseEnter={() => hover(category)}
              onFocus={() => hover(category)}
            >
              {/* Сам значок — основной блок категории: его и тащат, и щёлкают. */}
              <button
                type="button"
                className={`pg-palette__rail-item pg-block--${category}`}
                title={`${t(`block.${primary}`)} · ${t(`cat.${category}`)}`}
                aria-label={t(`block.${primary}`)}
                aria-haspopup="true"
                aria-expanded={open === category}
                {...drag(primary)}
                onClick={() => onAdd(primary)}
              >
                <i className={`codicon codicon-${BLOCKS.find((block) => block.kind === primary)?.icon ?? CATEGORY_ICON[category]}`} aria-hidden="true" />
              </button>

              <AnimatePresence>
                {open === category && (
                  <m.div
                    className="pg-rail__flyout"
                    initial={calm ? undefined : { opacity: 0, x: -6 }}
                    animate={calm ? undefined : { opacity: 1, x: 0 }}
                    exit={calm ? undefined : { opacity: 0, x: -6 }}
                    transition={{ duration: 0.14, ease: 'easeOut' }}
                    onMouseEnter={() => hover(category)}
                  >
                    <span className="pg-rail__flyout-title">
                      <i className={`codicon codicon-${CATEGORY_ICON[category]}`} aria-hidden="true" /> {t(`cat.${category}`)}
                    </span>
                    <ul className="pg-palette__list">
                      {BLOCKS.filter((block) => block.category === category).map((block) => (
                        <li key={block.kind}>
                          <button
                            type="button"
                            className={`pg-palette__item pg-block--${block.category}`}
                            {...drag(block.kind)}
                            onClick={() => onAdd(block.kind)}
                          >
                            <i className={`codicon codicon-${block.icon}`} aria-hidden="true" />
                            {t(`block.${block.kind}`)}
                            <i className="codicon codicon-add pg-palette__add" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </aside>
      </LazyMotion>
    );

  return (
    <LazyMotion features={domAnimation} strict>
      <aside className="pg-palette">
        <header className="pg-palette__head">
          <h3 className="pg-heading">{t('palette.title')}</h3>
          <button
            type="button"
            className="pg-icon-button pg-palette__toggle"
            aria-label={t('palette.collapse')}
            title={t('palette.collapse')}
            onClick={() => save({ ...state, collapsed: true })}
          >
            <i className="codicon codicon-chevron-left" aria-hidden="true" />
          </button>
        </header>

        <div className="pg-palette__search">
          <i className="codicon codicon-search" aria-hidden="true" />
          <input
            className="pg-input"
            type="search"
            placeholder={t('palette.filter')}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <p className="pg-hint">{t('palette.hint')}</p>

        {CATEGORIES.map((category) => {
          const blocks = found(category);
          if (!blocks.length) return null;
          const open = isOpen(category);
          return (
            <section className="pg-palette__group" key={category}>
              <button
                type="button"
                className={`pg-palette__category ${open ? 'is-open' : ''}`}
                aria-expanded={open}
                onClick={() => toggle(category)}
              >
                <i className="codicon codicon-chevron-right pg-palette__chevron" aria-hidden="true" />
                <i className={`codicon codicon-${CATEGORY_ICON[category]} pg-palette__cat-icon pg-block--${category}`} aria-hidden="true" />
                {t(`cat.${category}`)}
                <span className="pg-count">{blocks.length}</span>
              </button>

              <AnimatePresence initial={false}>
                {open && (
                  <m.ul
                    className="pg-palette__list"
                    initial={calm ? undefined : { height: 0, opacity: 0 }}
                    animate={calm ? undefined : { height: 'auto', opacity: 1 }}
                    exit={calm ? undefined : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    {blocks.map((block, index) => (
                      <m.li
                        key={block.kind}
                        {...fade}
                        // Лесенка: строки проявляются по очереди, но быстро —
                        // палитрой пользуются, а не любуются.
                        transition={{ duration: 0.14, delay: calm ? 0 : Math.min(index, 6) * 0.015 }}
                      >
                        <button
                          type="button"
                          className={`pg-palette__item pg-block--${block.category}`}
                          {...drag(block.kind)}
                          onClick={() => onAdd(block.kind)}
                        >
                          <i className={`codicon codicon-${block.icon}`} aria-hidden="true" />
                          {t(`block.${block.kind}`)}
                          <i className="codicon codicon-add pg-palette__add" aria-hidden="true" />
                        </button>
                      </m.li>
                    ))}
                  </m.ul>
                )}
              </AnimatePresence>
            </section>
          );
        })}

        {needle && !CATEGORIES.some((category) => found(category).length) && (
          <p className="pg-hint pg-hint--empty">{t('palette.nothing')}</p>
        )}
      </aside>
    </LazyMotion>
  );
}

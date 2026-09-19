import { useState } from 'react';
import { BLOCKS, CATEGORIES } from './catalog';
import { DRAG_TYPE } from './Canvas';
import type { T } from './i18n';

interface Props {
  t: T;
  onAdd: (kind: string) => void;
}

export default function Palette({ t, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const match = (kind: string) =>
    !needle || t(`block.${kind}`).toLowerCase().includes(needle) || kind.includes(needle);

  return (
    <aside className="pg-palette">
      <h3 className="pg-heading">{t('palette.title')}</h3>
      <input
        className="pg-input pg-palette__filter"
        type="search"
        placeholder={t('palette.filter')}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <p className="pg-hint">{t('palette.hint')}</p>
      {CATEGORIES.map((category) => {
        const blocks = BLOCKS.filter((block) => block.category === category && match(block.kind));
        if (!blocks.length) return null;
        return (
          <section className="pg-palette__group" key={category}>
            <h4 className="pg-palette__category">{t(`cat.${category}`)}</h4>
            <ul className="pg-palette__list">
              {blocks.map((block) => (
                <li key={block.kind}>
                  <button
                    type="button"
                    className={`pg-palette__item pg-block--${block.category}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(DRAG_TYPE, block.kind);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => onAdd(block.kind)}
                  >
                    <i className={`codicon codicon-${block.icon}`} aria-hidden="true" />
                    {t(`block.${block.kind}`)}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </aside>
  );
}

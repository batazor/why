import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';

/**
 * Оглавление серии: кнопка со списком глав, как в книге.
 *
 * Разбор длиной в тридцать шагов разбит на главы — отдельные уроки с общим
 * ключом серии. Читателю нужно видеть, где он в книге и куда идти дальше, и
 * видеть это в одном месте, а не ссылкой в прозе, которую надо сперва найти.
 *
 * Меню — Popover из Headless UI, а не `<details>`: у поповера есть то, чего у
 * details нет и что приходилось бы писать руками — закрытие по щелчку снаружи
 * и по Escape, возврат фокуса на кнопку и правильные `aria-expanded`/`aria-
 * controls`. Поэтому компонент React, а не Astro: остальная страница остаётся
 * статикой, остров здесь один и маленький.
 *
 * Черновики в списке остаются: пока книга пишется, оглавление без них пустое,
 * а ссылки внутри серии ведут на страницы, которые уже собираются.
 */
interface Props {
  /** Подпись кнопки: «Главы». */
  label: string;
  /** Slug текущей главы: она в списке помечена и не является ссылкой. */
  current: string;
  /** Главы серии по порядку. `href` считает страница — у неё есть локаль и base. */
  chapters: { slug: string; title: string; href: string }[];
}

export default function Chapters({ label, current, chapters }: Props) {
  if (chapters.length < 2) return null;

  const index = chapters.findIndex((chapter) => chapter.slug === current);

  return (
    <Popover className="chapters">
      <PopoverButton className="chapters__summary">
        <svg className="chapters__icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
        </svg>
        <span>{label}</span>
        <span className="chapters__count">
          {index + 1}/{chapters.length}
        </span>
      </PopoverButton>

      <PopoverPanel as="ol" className="chapters__list">
        {chapters.map((chapter, i) => (
          <li key={chapter.slug}>
            {chapter.slug === current ? (
              <span className="chapters__link" aria-current="page">
                <span className="chapters__num">{i + 1}</span>
                <span>{chapter.title}</span>
              </span>
            ) : (
              <a className="chapters__link" href={chapter.href}>
                <span className="chapters__num">{i + 1}</span>
                <span>{chapter.title}</span>
              </a>
            )}
          </li>
        ))}
      </PopoverPanel>
    </Popover>
  );
}

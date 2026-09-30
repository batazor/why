import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Выпадающее меню строки инструментов.
 *
 * Строка держит на виду то, что нужно каждую минуту; остальное — то, что
 * нужно раз в неделю (импорт, удаление, команда, выход), — уходит сюда.
 * Закрывается щелчком мимо, Escape и выбором пункта.
 */
export function Menu({
  trigger,
  label,
  align = 'left',
  children,
}: {
  /** Содержимое кнопки: значок, текст, аватар. */
  trigger: ReactNode;
  /** Подпись для чтения с экрана и подсказка. */
  label: string;
  align?: 'left' | 'right';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as globalThis.Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="pg-menu" ref={box}>
      <button
        type="button"
        className="pg-button pg-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && (
        // Щелчок по пункту всплывает сюда и закрывает меню.
        <div className={`pg-menu__list pg-menu__list--${align}`} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </span>
  );
}

export function MenuItem({
  icon,
  onClick,
  danger = false,
  title,
  children,
}: {
  icon: string;
  onClick: () => void;
  danger?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button type="button" role="menuitem" className={`pg-menu__item ${danger ? 'is-danger' : ''}`} title={title} onClick={onClick}>
      <i className={`codicon codicon-${icon}`} aria-hidden="true" /> {children}
    </button>
  );
}

export function MenuSeparator() {
  return <hr className="pg-menu__sep" />;
}

/** Строка без действия: кто вошёл, в каком пространстве. */
export function MenuNote({ children }: { children: ReactNode }) {
  return <div className="pg-menu__note">{children}</div>;
}

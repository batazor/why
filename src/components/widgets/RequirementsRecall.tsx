import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { concealPanel, fabRail, revealPanel } from '../fab-rail';
import type { RequirementsData } from '../../code/widgets';
import RequirementsBoard from './RequirementsBoard';
import { useRequirements } from './requirements-store';

/**
 * Таблица требований под рукой: значок на правом краю, как у задания.
 *
 * Таблица стоит только на шагах, которые что-то в неё приносят, а сверяться с
 * ней хочется и на шаге про ретраи, и на итоговой схеме. Значок открывает тот
 * же документ целиком — состояние общее через модуль, поэтому и перетащить в
 * него строку из текста можно прямо отсюда.
 *
 * Значок есть, пока таблицы нет на экране и в ней уже что-то лежит: пустой
 * документ открывать незачем.
 */

interface Props {
  data: RequirementsData;
  labels: Record<string, string>;
}

const ICON = (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
    <path d="M3.5 9.5h17M3.5 14.5h17M9 9.5v10" />
  </svg>
);

export default function RequirementsRecall({ data, labels }: Props) {
  const { placed } = useRequirements(data.name);
  const [boardInView, setBoardInView] = useState(false);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const label = labels['req.recall'] ?? 'Requirements';

  // Таблицы в тексте разбора — острова, они появляются после гидрации. Поэтому
  // наблюдатель подхватывает их по мере появления, а не один раз.
  useEffect(() => {
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      setBoardInView(visible.size > 0);
    });
    const watched = new Set<Element>();
    const scan = () => {
      document.querySelectorAll('.req-board').forEach((board) => {
        if (watched.has(board) || panel.current?.contains(board)) return;
        watched.add(board);
        io.observe(board);
      });
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  const shown = placed.size > 0 && !boardInView;

  // Уехала причина — уходит и панель: таблица снова в тексте.
  useEffect(() => {
    if (!shown) setOpen(false);
  }, [shown]);

  /**
   * Панель открывается наведением или фокусом, без щелчка: заглянуть в таблицу
   * и вернуться к тексту — одно движение. Закрывается с задержкой, чтобы
   * курсор успел переехать со значка на панель. Щелчок остаётся для касаний.
   */
  const leave = useRef(0);
  const show = () => {
    clearTimeout(leave.current);
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(leave.current);
    leave.current = window.setTimeout(() => setOpen(false), 250);
  };
  const hover = { onPointerEnter: show, onPointerLeave: hide, onFocus: show, onBlur: hide };

  /**
   * Панель в DOM живёт дольше, чем `open`: закрытие — анимация, и спрятать
   * панель можно только после неё. `mounted` — видна ли панель сейчас.
   */
  const [mounted, setMounted] = useState(false);
  // До отрисовки: иначе панель на кадр мелькала бы целиком, до начала анимации.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (open) {
      setMounted(true);
      // Каждое открытие — с начала документа, а не с места прошлой прокрутки.
      el.querySelector('.req-board__doc')?.scrollTo({ top: 0 });
      revealPanel(el);
      return;
    }
    if (!mounted) return;
    let cancelled = false;
    concealPanel(el, () => {
      if (!cancelled) setMounted(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Кружок стоит в общем столбике на правом краю: он есть только в браузере.
  const [rail, setRail] = useState<HTMLElement | null>(null);
  useEffect(() => setRail(fabRail()), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(leave.current), []);

  const circle = (
    <button
      ref={button}
      type="button"
      className="req-recall"
      aria-label={label}
      aria-expanded={open}
      hidden={!shown}
      onClick={show}
      {...hover}
    >
      {ICON}
    </button>
  );

  return (
    <>
      {rail && createPortal(circle, rail)}
      <div
        ref={panel}
        className="req-recall__panel"
        aria-label={label}
        hidden={!open && !mounted}
        {...hover}
        // Строку тащат из текста в открытую панель: пока идёт перетаскивание,
        // наведения нет, и панель держится на dragenter.
        onDragEnter={show}
      >
        <RequirementsBoard step="" data={data} labels={labels} />
      </div>
    </>
  );
}

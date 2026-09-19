import { useEffect, useRef } from 'react';
import { uid, type Design, type Signal } from './model';

/**
 * Сбор сигналов честности, пока на экране роль кандидата.
 *
 * Всё считается в браузере кандидата, и он может это отключить или подделать:
 * без бэкенда это прототип, а не защита. Когда появится сервер, этот же хук
 * будет отправлять события туда, а не в проект.
 *
 * Что ловится:
 * - уход со вкладки (visibilitychange) и из окна (blur без ухода со вкладки:
 *   другое приложение, второй монитор или сами devtools) — с длительностью;
 * - смена размера окна; если разница между внешним и внутренним размером
 *   окна резко выросла — похоже на пристыкованные devtools;
 * - сочетания клавиш devtools (F12, ⌘⌥I/J/C, Ctrl+Shift+I/J/C) и контекстное
 *   меню, из которого открывают «Просмотреть код»;
 * - копирование, вырезание и вставка — вместе с текстом.
 *
 * Открытие devtools надёжно не определяется ничем: это эвристики, и в ленте
 * они подписаны как признаки, а не факты.
 */

/** Сколько текста хранить из буфера: достаточно, чтобы увидеть, что вставили. */
const TEXT_LIMIT = 2000;
/** Больше событий в одной сессии не пишем: проект живёт в localStorage. */
const SIGNALS_LIMIT = 500;
/** Прирост рамки окна, после которого похоже на пристыкованные devtools. */
const DEVTOOLS_GAP = 160;

type Update = (fn: (design: Design) => Design) => void;

function describeField(target: EventTarget | null): string {
  const element = target as HTMLElement | null;
  if (!element?.closest) return '';
  const field = element.closest('label')?.querySelector('.pg-field__label, span')?.textContent;
  return (
    element.getAttribute('aria-label') ??
    field ??
    element.getAttribute('placeholder') ??
    element.tagName.toLowerCase()
  ).trim().slice(0, 80);
}

/** Выделенный текст: у полей ввода выделение живёт в самом поле, а не в документе. */
function selectedText(target: EventTarget | null): string {
  const element = target as HTMLInputElement | HTMLTextAreaElement | null;
  if (element && 'selectionStart' in element && typeof element.value === 'string' && element.selectionStart !== null) {
    return element.value.slice(element.selectionStart, element.selectionEnd ?? element.selectionStart);
  }
  return window.getSelection()?.toString() ?? '';
}

export function useIntegrity(active: boolean, update: Update) {
  const updateRef = useRef(update);
  updateRef.current = update;

  useEffect(() => {
    if (!active) return;

    const push = (signal: Omit<Signal, 'id' | 'at'>) => {
      const item: Signal = { id: uid('s'), at: new Date().toISOString(), ...signal };
      updateRef.current((design) => ({
        ...design,
        session: { ...design.session, signals: [...design.session.signals, item].slice(-SIGNALS_LIMIT) },
      }));
      return item.id;
    };

    const close = (id: string) => {
      const back = new Date().toISOString();
      updateRef.current((design) => ({
        ...design,
        session: {
          ...design.session,
          signals: design.session.signals.map((signal) => (signal.id === id ? { ...signal, back } : signal)),
        },
      }));
    };

    /* ----------------------------------------------------- уходы */

    let away: string | null = null;
    let blurTimer = 0;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(blurTimer);
        if (!away) away = push({ type: 'away', via: 'tab' });
      } else if (away) {
        close(away);
        away = null;
      }
    };

    /**
     * blur приходит и при уходе на другую вкладку — раньше visibilitychange.
     * Поэтому решение откладывается: если вкладка осталась видимой, значит
     * ушли из окна, а не со вкладки.
     */
    const onBlur = () => {
      clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        if (document.visibilityState === 'visible' && !away) away = push({ type: 'away', via: 'window' });
      }, 120);
    };

    const onFocus = () => {
      clearTimeout(blurTimer);
      if (away && document.visibilityState === 'visible') {
        close(away);
        away = null;
      }
    };

    /* ----------------------------------------------- размер окна */

    const size = (): [number, number] => [window.innerWidth, window.innerHeight];
    const gap = () => Math.max(window.outerWidth - window.innerWidth, window.outerHeight - window.innerHeight);
    let from = size();
    let gapBefore = gap();
    let resizeTimer = 0;

    const onResize = () => {
      clearTimeout(resizeTimer);
      // Пишем итог перетаскивания рамки, а не каждый его пиксель.
      resizeTimer = window.setTimeout(() => {
        const to = size();
        if (to[0] === from[0] && to[1] === from[1]) return;
        const gapNow = gap();
        push({ type: 'resize', from, to });
        // Окно не сменило внешний размер, а внутренний ужался — что-то
        // пристыковалось внутри окна. Чаще всего это devtools.
        if (gapNow - gapBefore > DEVTOOLS_GAP) push({ type: 'devtools', via: 'size', from, to });
        from = to;
        gapBefore = gapNow;
      }, 400);
    };

    /* ------------------------------------------------- devtools */

    const onKey = (event: KeyboardEvent) => {
      // Клавиша — по физическому коду: на маке ⌥ меняет символ, а на русской
      // раскладке I — это «ш». Код один на любой раскладке.
      const letter = ['KeyI', 'KeyJ', 'KeyC'].includes(event.code) || ['I', 'J', 'C'].includes(event.key.toUpperCase());
      const mac = event.metaKey && event.altKey && letter;
      const other = event.ctrlKey && event.shiftKey && letter;
      if (event.key === 'F12' || mac || other) {
        const combo = [event.metaKey && '⌘', event.ctrlKey && 'Ctrl', event.altKey && '⌥', event.shiftKey && 'Shift', event.key === 'F12' ? 'F12' : event.code.replace('Key', '')]
          .filter(Boolean)
          .join('+');
        push({ type: 'devtools', via: 'shortcut', field: combo });
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      // Меню по полю ввода — обычно «вставить», его покажет сама вставка.
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea')) return;
      push({ type: 'devtools', via: 'contextmenu' });
    };

    /* -------------------------------------------- буфер обмена */

    const onClipboard = (type: 'copy' | 'cut') => (event: ClipboardEvent) => {
      const text = selectedText(event.target);
      if (!text) return;
      push({ type, text: text.slice(0, TEXT_LIMIT), length: text.length });
    };
    const onCopy = onClipboard('copy');
    const onCut = onClipboard('cut');

    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!text) return;
      push({ type: 'paste', text: text.slice(0, TEXT_LIMIT), length: text.length, field: describeField(event.target) });
    };

    // Уход, который не закрылся в прошлый раз (страницу закрыли или
    // перезагрузили в отлучке): раз страница снова открыта — кандидат вернулся.
    updateRef.current((design) => {
      if (!design.session.signals.some((signal) => signal.type === 'away' && !signal.back)) return design;
      const back = new Date().toISOString();
      return {
        ...design,
        session: {
          ...design.session,
          signals: design.session.signals.map((signal) =>
            signal.type === 'away' && !signal.back ? { ...signal, back } : signal,
          ),
        },
      };
    });

    // Вкладка уже в фоне, когда роль включилась (ссылку открыли и не
    // посмотрели): это тоже уход, просто без момента ухода.
    if (document.visibilityState === 'hidden') away = push({ type: 'away', via: 'tab' });

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste, true);

    return () => {
      clearTimeout(blurTimer);
      clearTimeout(resizeTimer);
      if (away) close(away);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste, true);
    };
  }, [active]);
}

/* -------------------------------------------------------------- сводка */

/** Уход дольше этого — заметный: за полминуты можно успеть спросить у кого-то. */
export const LONG_AWAY_MS = 30_000;
/** Вставка длиннее этого — не своё имя поля, а кусок готового текста. */
export const LONG_PASTE = 200;

export function awayMs(signal: Signal, now: number): number {
  if (signal.type !== 'away') return 0;
  return (signal.back ? Date.parse(signal.back) : now) - Date.parse(signal.at);
}

/** Сигнал, на который стоит посмотреть, а не просто отметить. */
export function isNotable(signal: Signal, now: number): boolean {
  if (signal.type === 'devtools') return true;
  if (signal.type === 'away') return awayMs(signal, now) >= LONG_AWAY_MS;
  if (signal.type === 'paste') return (signal.length ?? 0) >= LONG_PASTE;
  return false;
}

export interface SignalSummary {
  awayCount: number;
  awayTotal: number;
  longest: number;
  pastes: number;
  pastedChars: number;
  copies: number;
  devtools: number;
  resizes: number;
  notable: number;
}

export function summarize(signals: Signal[], now: number): SignalSummary {
  const away = signals.filter((signal) => signal.type === 'away');
  const pastes = signals.filter((signal) => signal.type === 'paste');
  return {
    awayCount: away.length,
    awayTotal: away.reduce((sum, signal) => sum + awayMs(signal, now), 0),
    longest: Math.max(0, ...away.map((signal) => awayMs(signal, now))),
    pastes: pastes.length,
    pastedChars: pastes.reduce((sum, signal) => sum + (signal.length ?? 0), 0),
    copies: signals.filter((signal) => signal.type === 'copy' || signal.type === 'cut').length,
    devtools: signals.filter((signal) => signal.type === 'devtools').length,
    resizes: signals.filter((signal) => signal.type === 'resize').length,
    notable: signals.filter((signal) => isNotable(signal, now)).length,
  };
}

/** Длительность как на секундомере — 0:05, 12:40: одинаково читается на любом языке. */
export function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

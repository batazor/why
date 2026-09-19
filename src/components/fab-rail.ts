import { animate } from 'motion';

/**
 * Столбик кружков на правом краю: задание, таблица требований, комментарии.
 *
 * Кружки делают три разных компонента, и раньше каждый ставил себя сам, а
 * пары и тройки собирались правилами на :has(). Правила спорили друг с другом
 * по силе селектора, и кружки наезжали один на другой. Теперь у них общий
 * контейнер: он стоит по середине высоты, порядок держит `order`, а скрытый
 * кружок просто выпадает из потока.
 */
export function fabRail(): HTMLElement {
  let rail = document.querySelector<HTMLElement>('.fab-rail');
  if (!rail) {
    rail = document.createElement('div');
    rail.className = 'fab-rail';
    document.body.append(rail);
  }
  return rail;
}

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Раскрытие панели у кружка: выезжает от него, чуть подрастая. Панель стоит
 * слева от столбика, поэтому и движение справа налево.
 */
export function revealPanel(panel: HTMLElement) {
  if (calm()) return;
  animate(
    panel,
    { opacity: [0, 1], x: [18, 0], scale: [0.96, 1], filter: ['blur(4px)', 'blur(0px)'] },
    { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 },
  );
}

/** Обратное движение; `done` прячет панель, когда она уже не видна. */
export function concealPanel(panel: HTMLElement, done: () => void) {
  if (calm()) {
    done();
    return;
  }
  animate(panel, { opacity: 0, x: 12, scale: 0.97 }, { duration: 0.14, ease: 'easeIn' }).finished.then(
    done,
  );
}

import { useEffect, useState } from 'react';
import { LikeC4ModelProvider, LikeC4View } from '../likec4/generated';
import type { $ViewId } from '../likec4/generated';

/**
 * Полотно разбора, которое рисует LikeC4.
 *
 * Компонент не раскладывает граф и не решает, что на нём видно: и то и другое
 * объявлено в `likec4/*.c4` и посчитано генератором. Здесь остаётся ровно две
 * обязанности — какой view показывать на текущем шаге и в какой теме.
 */
export default function LikeC4Stage({
  views,
  firstStep,
  fixedView,
}: {
  /** Шаг разбора → id view. */
  views: Record<string, string>;
  firstStep?: string;
  /** Одна картинка вне плеера: постер. Шаги тогда не слушаются. */
  fixedView?: string;
}) {
  const [viewId, setViewId] = useState<string | undefined>(
    fixedView ?? (firstStep ? views[firstStep] : undefined),
  );

  // Шагами управляет плеер — он живёт вне React и говорит событием.
  useEffect(() => {
    if (fixedView) return;
    const host = document.querySelector<HTMLElement>('[data-player]');
    if (!host) return;

    const show = (id: string | undefined) => {
      if (!id) return;
      // Шаг без своего view оставляет предыдущую картинку: два шага об одном
      // уровне вложенности делят одну схему.
      const next = views[id];
      if (next) setViewId(next);
    };

    // Остров монтируется лениво: к этому моменту читатель мог уже пролистать
    // разбор, поэтому сначала догоняем текущий шаг.
    show(host.dataset.stepId);

    const handle = (event: Event) => show((event as CustomEvent<{ id: string }>).detail.id);
    host.addEventListener('why:step', handle);
    return () => host.removeEventListener('why:step', handle);
  }, [fixedView, views]);

  const scheme = useColorScheme();

  if (!viewId) return null;

  return (
    /**
     * Контейнер, а не сам LikeC4View: высоту сцены задаёт страница через
     * `--flow-height`, ровно как у схемы на React Flow, и полотно обязано
     * вписаться в эту коробку.
     */
    <div className="likec4-stage">
      <LikeC4ModelProvider>
        <LikeC4View
          viewId={viewId as $ViewId}
          colorScheme={scheme}
          background="transparent"
          /**
           * Шрифт LikeC4 не подключается: на странице свой, и вторая гарнитура
           * ради схемы — лишний запрос и другая картинка, чем в тексте рядом.
           */
          injectFontCss={false}
          /**
           * Полотно — иллюстрация, а не приложение. Ни панорамы, ни зума, ни
           * модального обозревателя по клику: увести читателя из разбора значит
           * потерять шаг, на котором он стоял.
           */
          pannable={false}
          zoomable={false}
          browser={false}
          controls={false}
          /**
           * Пропорции полотна не сохраняются: сцена — коробка известной высоты
           * (её задаёт `--flow-height`), и схема обязана вписаться в неё, а не
           * растянуть страницу под свою раскладку. По умолчанию LikeC4 ставит
           * себе aspect-ratio, и высокая схема уезжает на полтора экрана.
           */
          keepAspectRatio={false}
          style={{ width: '100%', height: '100%' }}
          fitViewPadding={{ x: 8, y: 12 }}
        />
      </LikeC4ModelProvider>
    </div>
  );
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

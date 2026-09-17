import { useEffect, useState } from 'react';
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
}: {
  /** Id view из `likec4/views.c4`. */
  view: string;
  /**
   * Лейблы вида контекста на карточках: core, supporting, generic. Включает их
   * тот шаг, который про виды говорит: подпись, появившаяся раньше объяснения,
   * читается как шум.
   */
  tags?: boolean;
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
  const bounds = useLikeC4View(view as $ViewId)?.bounds;

  return (
    /**
     * Контейнер, а не сам LikeC4View: размеры коробки задаёт страница, а
     * полотно обязано в неё вписаться. Предел высоты — `--flow-height`.
     */
    <div
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
           * Полотно — иллюстрация, а не приложение. Ни панорамы, ни зума, ни
           * модального обозревателя по клику: увести читателя из разбора значит
           * потерять шаг, на котором он стоял.
           */
          pannable={false}
          zoomable={false}
          browser={false}
          controls={false}
          enableElementTags={tags}
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

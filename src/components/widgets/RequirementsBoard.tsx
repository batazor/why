import { useEffect, useRef, useState } from 'react';
import { requirementsAt, type RequirementsData } from '../../code/widgets';
import { clear, place, useRequirements } from './requirements-store';
import { DRAG_TYPE } from './RequirementChips';

/**
 * Документ требований, который читатель собирает по ходу разбора.
 *
 * Таблица одна на весь разбор: всё, что перенесено на шаге про функции, лежит
 * в ней и на шаге про SLO, где к строкам приходят числа. Выглядит она как
 * документ в редакторе — путь сверху, отрендеренная таблица под ним: это тот
 * же файл в репозитории сервиса, только заполняет его читатель.
 */

interface Props {
  step: string;
  data: RequirementsData;
  labels: Record<string, string>;
}

/** Путь файла — идентификатор, а не проза: одинаков на всех языках. */
const PATH = 'scraper/docs/REQUIREMENTS.md';

export default function RequirementsBoard({ step, data, labels }: Props) {
  const { placed, last } = useRequirements(data.name);
  const [over, setOver] = useState(false);
  const text = (key: string) => labels[key] ?? key;

  // Строки, которые шаг приносит: их место в таблице подсвечено пунктиром,
  // пока читатель их не перенёс.
  const incoming = new Set(
    requirementsAt(data, step)
      .filter((item) => !item.keys.every((key) => placed.has(key)))
      .map((item) => item.row.id),
  );

  /**
   * Только что положенная строка вспыхивает: таблица длинная, и без этого
   * читатель ищет глазами, куда она легла.
   */
  const [flash, setFlash] = useState<string | null>(null);
  const seen = useRef(last);
  useEffect(() => {
    if (!last || last === seen.current) return;
    seen.current = last;
    setFlash(last.split(':')[1]);
    const timer = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(timer);
  }, [last]);

  /**
   * Какие разделы трогает шаг: только они раскрыты.
   *
   * Таблица к середине разбора длиннее экрана, и шаг про SLO, которому нужны
   * цели свойств, показывал сначала восемь функций, которых он не касается.
   * Нетронутый раздел свёрнут до заголовка со счётчиком и раскрывается
   * щелчком: документ целиком по-прежнему под рукой.
   */
  const touched = new Set(
    requirementsAt(data, step).map((item) => item.row.kind),
  );

  const section = (kind: 'fr' | 'nfr') => {
    const rows = data.rows.filter((row) => row.kind === kind && placed.has(`row:${row.id}`));
    const waiting = data.rows.filter(
      (row) => row.kind === kind && incoming.has(row.id) && !placed.has(`row:${row.id}`),
    );
    /** Колонок три у обоих разделов: номер, текст и либо «кто вызывает», либо цель. */
    const columns = 3;

    return (
      <details className="req-board__section" open={touched.size === 0 || touched.has(kind)}>
        <summary className="req-board__title">
          {text(`req.${kind}`)}
          <span className="req-board__count">{rows.length}</span>
        </summary>
        <table className="req-board__table">
          <thead>
            <tr>
              <th>#</th>
              <th>{text(`req.col.text.${kind}`)}</th>
              {/* У функций вторая колонка — кто вызывает, коротко. У
                  свойств «что ломается» уезжает строкой под само свойство:
                  четыре колонки в половине экрана зажимали цель до пары
                  символов, а цель здесь самое длинное. */}
              <th>{kind === 'nfr' ? text('req.col.goal') : text(`req.col.note.${kind}`)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const goal = row.goal && placed.has(`goal:${row.id}`);
              const goalIncoming = incoming.has(row.id) && !goal && row.goal === step;
              return (
                <tr
                  key={row.id}
                  className={[flash === row.id ? 'is-flash' : '', goalIncoming ? 'is-incoming' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  <td>{row.id}</td>
                  <td>
                    {text(`req.text.${row.id}`)}
                    {kind === 'nfr' && (
                      <span className="req-board__breaks">{text(`req.note.${row.id}`)}</span>
                    )}
                  </td>
                  {kind === 'nfr' ? (
                    <td className="req-board__goal">
                      {goal ? text(`req.goal.${row.id}`) : goalIncoming ? '…' : '—'}
                    </td>
                  ) : (
                    <td className="req-board__note">{text(`req.note.${row.id}`)}</td>
                  )}
                </tr>
              );
            })}

            {/* Места для строк этого шага: пунктирная строка говорит «сюда»
                раньше, чем читатель спросит, куда тащить. */}
            {waiting.map((row) => (
              <tr className="req-board__slot" key={`slot-${row.id}`}>
                <td>{row.id}</td>
                <td colSpan={columns - 1}>{text('req.drop')}</td>
              </tr>
            ))}

            {!rows.length && !waiting.length && (
              <tr className="req-board__empty">
                <td colSpan={columns}>{text('req.empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </details>
    );
  };

  return (
    <div
      className={`req-board ${over ? 'is-over' : ''}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={(event) => {
        // Уход на дочерний элемент — не уход с таблицы.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        const keys = event.dataTransfer.getData(DRAG_TYPE);
        setOver(false);
        if (!keys) return;
        event.preventDefault();
        place(data.name, keys.split(' '));
      }}
    >
      <div className="req-board__path">
        <span>{PATH}</span>
        {placed.size > 0 && (
          <button className="req-board__reset" type="button" onClick={() => clear(data.name)}>
            {text('req.reset')}
          </button>
        )}
      </div>
      <div className="req-board__doc">
        {section('fr')}
        {section('nfr')}
      </div>
    </div>
  );
}

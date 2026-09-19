import type { ApiCardsData } from '../../code/widgets';

/**
 * HTTP-контракт карточками: метод, путь, код ответа, одна строка смысла и
 * поля запроса и ответа.
 *
 * Врезка неподвижная — рендерится при сборке без гидратации: в ней нечего
 * нажимать, а текст с кодами должен быть на странице сразу.
 *
 * Параметр пути `{id}` подсвечен: по нему видно, где адрес постоянный, а где
 * подставляется значение. Вебхук — отдельный вид карточки: запрос идёт не к
 * нам, а от нас к клиенту.
 */

interface Props {
  data: ApiCardsData;
  labels: Record<string, string>;
}

/** Путь с подсвеченными параметрами: `/jobs/{id}` → `/jobs/` + `{id}`. */
function Path({ path }: { path: string }) {
  const parts = path.split(/(\{[^}]+\})/g).filter(Boolean);
  return (
    <code className="api-card__path">
      {parts.map((part, i) =>
        part.startsWith('{') ? (
          <span className="api-card__param" key={i}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </code>
  );
}

export default function ApiCards({ data, labels }: Props) {
  const text = (key: string) => labels[key] ?? key;

  return (
    <ul className="api-cards">
      {data.endpoints.map((item) => (
        <li
          key={item.key}
          className={['api-card', `api-card--${item.method.toLowerCase()}`, item.outbound ? 'api-card--out' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <div className="api-card__head">
            <span className="api-card__method">{item.method}</span>
            <Path path={item.path} />
            <span className={`api-card__status api-card__status--${Math.floor(item.status / 100)}xx`}>
              {item.status} {item.statusText}
            </span>
          </div>

          <p className="api-card__about">
            {item.outbound && <span className="api-card__out">{text('api.outbound')}</span>}
            {text(`api.${item.key}`)}
          </p>

          {(item.request || item.response) && (
            <dl className="api-card__fields">
              {item.request && (
                <div>
                  <dt>{text('api.request')}</dt>
                  <dd>
                    {item.request.map((field) => (
                      <code key={field}>{field}</code>
                    ))}
                  </dd>
                </div>
              )}
              {item.response && (
                <div>
                  <dt>{text('api.response')}</dt>
                  <dd>
                    {item.response.map((field) => (
                      <code key={field}>{field}</code>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}

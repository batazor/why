import { useState, type DragEvent } from 'react';
import {
  API_TEMPLATES,
  OUTBOUND,
  ROUTE_DRAG,
  STATUS_CODES,
  assignRoute,
  expandTemplate,
  parseFields,
  statusText,
  type ApiTemplate,
} from './api-templates';
import { BLOCK_BY_KIND } from './catalog';
import { HTTP_METHODS, uid, type Design, type Endpoint, type HttpMethod } from './model';
import type { T } from './i18n';

type Update = (fn: (design: Design) => Design) => void;

interface Props {
  design: Design;
  update: Update;
  t: T;
  readOnly: boolean;
}

const patchApi = (update: Update, id: string, patch: Partial<Endpoint>) =>
  update((design) => ({
    ...design,
    api: design.api.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }));

/** Путь с подсвеченными параметрами: `/jobs/{id}` → `/jobs/` + `{id}`. */
function Path({ path }: { path: string }) {
  const parts = path.split(/(\{[^}]+\})/g).filter(Boolean);
  return (
    <code className="pg-api__path">
      {parts.map((part, index) =>
        part.startsWith('{') ? (
          <span className="pg-api__param" key={index}>
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </code>
  );
}

/** Шапка карточки: одна и та же в просмотре и в правке, чтобы карточка не прыгала. */
function Head({ item }: { item: Endpoint }) {
  return (
    <div className="pg-api__head">
      <span className="pg-api__method">{item.method}</span>
      <Path path={item.path} />
      <span className={`pg-api__status pg-api__status--${Math.floor(item.status / 100)}xx`}>
        {item.status} {statusText(item.status)}
      </span>
    </div>
  );
}

function Card({ item, design, t, onEdit, onDelete }: {
  item: Endpoint;
  design: Design;
  t: T;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const service = design.nodes.find((node) => node.id === item.service);
  const body = (
    <>
      <Head item={item} />
      {(item.about || item.outbound) && (
        <p className="pg-api__about">
          {item.outbound && <span className="pg-api__out">{t('api.outbound')}</span>}
          {item.about}
        </p>
      )}
      {(item.request.length > 0 || item.response.length > 0) && (
        <dl className="pg-api__fields">
          {item.request.length > 0 && (
            <div>
              <dt>{t('api.request')}</dt>
              <dd>
                {item.request.map((field) => (
                  <code key={field}>{field}</code>
                ))}
              </dd>
            </div>
          )}
          {item.response.length > 0 && (
            <div>
              <dt>{t('api.response')}</dt>
              <dd>
                {item.response.map((field) => (
                  <code key={field}>{field}</code>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
      {(service || item.covers.length > 0) && (
        <div className="pg-api__links">
          {service && (
            <span className="pg-api__service">
              <i className={`codicon codicon-${BLOCK_BY_KIND.get(service.kind)?.icon ?? 'server-process'}`} aria-hidden="true" />
              {service.label || t(`block.${service.kind}`)}
            </span>
          )}
          {item.covers.map((id) => (
            <span key={id} className="pg-api__fr">
              {id}
            </span>
          ))}
        </div>
      )}
    </>
  );

  return (
    <li
      className={`pg-api pg-api--${item.method.toLowerCase()} ${item.outbound ? 'pg-api--out' : ''}`}
      // Карточку тащат на группу сервиса или прямо на блок схемы.
      draggable={Boolean(onEdit)}
      onDragStart={(event) => {
        event.dataTransfer.setData(ROUTE_DRAG, item.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      {onEdit ? (
        <button type="button" className="pg-api__open" onClick={onEdit} title={t('api.edit')}>
          {body}
        </button>
      ) : (
        body
      )}
      {onDelete && (
        <button
          type="button"
          className="pg-icon-button pg-api__delete"
          aria-label={t('inspect.delete')}
          title={t('inspect.delete')}
          onClick={onDelete}
        >
          <i className="codicon codicon-trash" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

/**
 * Правка карточки. Поля запроса и ответа набираются строкой через запятую и
 * разбираются при уходе из поля: разбор на каждом нажатии съедал бы запятую,
 * которую человек только что напечатал.
 */
function Editor({ item, design, update, t, onClose }: { item: Endpoint; design: Design; update: Update; t: T; onClose: () => void }) {
  const [request, setRequest] = useState(item.request.join(', '));
  const [response, setResponse] = useState(item.response.join(', '));
  const patch = (value: Partial<Endpoint>) => patchApi(update, item.id, value);
  const frs = design.requirements.filter((req) => req.kind === 'fr');

  return (
    <li className={`pg-api pg-api--${item.method.toLowerCase()} ${item.outbound ? 'pg-api--out' : ''} is-editing`}>
      <div className="pg-api__edit-row">
        <select
          className="pg-input pg-select pg-api__method-select"
          aria-label={t('api.method')}
          value={item.method}
          onChange={(event) => patch({ method: event.currentTarget.value as HttpMethod })}
        >
          {HTTP_METHODS.map((method) => (
            <option key={method}>{method}</option>
          ))}
        </select>
        <input
          className="pg-input pg-api__path-input"
          aria-label={t('api.path')}
          value={item.path}
          placeholder="/resources/{id}"
          onChange={(event) => patch({ path: event.currentTarget.value })}
        />
        <select
          className="pg-input pg-select pg-api__status-select"
          aria-label={t('api.status')}
          value={item.status}
          onChange={(event) => patch({ status: Number(event.currentTarget.value) })}
        >
          {STATUS_CODES.map((code) => (
            <option key={code} value={code}>
              {code} {statusText(code)}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="pg-input pg-textarea"
        rows={2}
        placeholder={t('api.about')}
        value={item.about}
        onChange={(event) => patch({ about: event.currentTarget.value })}
      />
      <label className="pg-api__field">
        <span>{t('api.request')}</span>
        <input
          className="pg-input"
          placeholder="Idempotency-Key, url, params"
          value={request}
          onChange={(event) => setRequest(event.currentTarget.value)}
          onBlur={() => patch({ request: parseFields(request) })}
        />
      </label>
      <label className="pg-api__field">
        <span>{t('api.response')}</span>
        <input
          className="pg-input"
          placeholder="id, status"
          value={response}
          onChange={(event) => setResponse(event.currentTarget.value)}
          onBlur={() => patch({ response: parseFields(response) })}
        />
      </label>
      <div className="pg-api__edit-row">
        <label className="pg-api__field pg-api__field--grow">
          <span>{t('api.service')}</span>
          <select
            className="pg-input pg-select"
            value={item.service ?? ''}
            onChange={(event) => patch({ service: event.currentTarget.value || undefined })}
          >
            <option value="">—</option>
            {design.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label || t(`block.${node.kind}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="pg-toggle">
          <input type="checkbox" checked={item.outbound} onChange={(event) => patch({ outbound: event.currentTarget.checked })} />
          {t('api.outboundToggle')}
        </label>
      </div>
      {frs.length > 0 && (
        <div className="pg-api__field">
          <span>{t('api.covers')}</span>
          <div className="pg-chips">
            {frs.map((req) => {
              const on = item.covers.includes(req.id);
              return (
                <button
                  key={req.id}
                  type="button"
                  className={`pg-chip ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  title={req.text}
                  onClick={() =>
                    patch({ covers: on ? item.covers.filter((id) => id !== req.id) : [...item.covers, req.id] })
                  }
                >
                  {req.id}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="pg-actions">
        <button
          type="button"
          className="pg-button pg-button--small"
          onClick={() => {
            // Поля могли остаться в фокусе: забираем набранное перед закрытием.
            patch({ request: parseFields(request), response: parseFields(response) });
            onClose();
          }}
        >
          <i className="codicon codicon-check" aria-hidden="true" /> {t('api.done')}
        </button>
        <button
          type="button"
          className="pg-button pg-button--small"
          onClick={() =>
            update((current) => {
              const index = current.api.findIndex((other) => other.id === item.id);
              const copy = { ...item, id: uid('api') };
              return { ...current, api: [...current.api.slice(0, index + 1), copy, ...current.api.slice(index + 1)] };
            })
          }
        >
          <i className="codicon codicon-copy" aria-hidden="true" /> {t('pg.duplicate')}
        </button>
        <button
          type="button"
          className="pg-button pg-button--small pg-button--danger"
          onClick={() => {
            update((current) => ({ ...current, api: current.api.filter((other) => other.id !== item.id) }));
            onClose();
          }}
        >
          <i className="codicon codicon-trash" aria-hidden="true" /> {t('inspect.delete')}
        </button>
      </div>
    </li>
  );
}

/**
 * Имя ресурса по умолчанию — из путей, которые уже есть: второй шаблон
 * обычно про тот же ресурс, что и первый.
 */
function guessResource(api: Endpoint[]): string {
  const path = api.find((item) => item.path.startsWith('/'))?.path ?? '';
  return path.split(/[/?{]/).filter(Boolean)[0] ?? 'items';
}

export function ApiPanel({ design, update, t, readOnly }: Props) {
  const [template, setTemplate] = useState<ApiTemplate>('crud');
  const [resource, setResource] = useState(() => guessResource(design.api));
  const [editing, setEditing] = useState<string | null>(null);
  const [service, setService] = useState('');

  const add = () => {
    const fresh = expandTemplate(template, resource, t).map((item) =>
      service && !item.outbound ? { ...item, service } : item,
    );
    update((current) => ({ ...current, api: [...current.api, ...fresh] }));
    // Одиночный маршрут сразу открывается на правку: пустую карточку всё равно заполнять.
    if (fresh.length === 1) setEditing(fresh[0].id);
  };

  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const alive = new Set(design.nodes.map((node) => node.id));
  const keyOf = (item: Endpoint) => (item.outbound ? OUTBOUND : item.service && alive.has(item.service) ? item.service : '');

  /**
   * Группы — по сервисам схемы, в том порядке, в каком блоки лежат на
   * полотне. Пустые группы тоже показаны: это места, куда бросить маршрут.
   * Сервисом считается то, что отвечает на запросы: вычисления и периметр,
   * плюс любой блок, которому маршрут уже отдали руками.
   */
  const serving = design.nodes.filter(
    (node) =>
      ['compute', 'edge'].includes(BLOCK_BY_KIND.get(node.kind)?.category ?? 'compute') ||
      design.api.some((item) => item.service === node.id),
  );
  const keys = [
    ...serving.map((node) => node.id),
    '',
    OUTBOUND,
  ].filter((key) => {
    const count = design.api.filter((item) => keyOf(item) === key).length;
    if (count) return true;
    if (readOnly) return false;
    // «Без сервиса» и «Исходящие» пустыми показываются только во время переноса.
    return key === '' || key === OUTBOUND ? dragging : true;
  });

  const title = (key: string) => {
    if (key === OUTBOUND) return t('api.groupOutbound');
    if (!key) return t('api.groupNone');
    const node = design.nodes.find((item) => item.id === key);
    return node ? node.label || t(`block.${node.kind}`) : '';
  };
  const icon = (key: string) => {
    if (key === OUTBOUND) return 'arrow-up';
    if (!key) return 'question';
    const node = design.nodes.find((item) => item.id === key);
    return BLOCK_BY_KIND.get(node?.kind ?? '')?.icon ?? 'server-process';
  };

  const dropProps = (key: string) =>
    readOnly
      ? {}
      : {
          onDragOver: (event: DragEvent) => {
            if (!event.dataTransfer.types.includes(ROUTE_DRAG)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setOver(key);
          },
          onDragLeave: (event: DragEvent) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
          },
          onDrop: (event: DragEvent) => {
            const id = event.dataTransfer.getData(ROUTE_DRAG);
            setOver(null);
            setDragging(false);
            if (!id) return;
            event.preventDefault();
            update((current) => ({ ...current, api: assignRoute(current.api, id, key) }));
          },
        };

  const remove = (id: string) => update((current) => ({ ...current, api: current.api.filter((item) => item.id !== id) }));

  return (
    <div className="pg-panel">
      {!readOnly && (
        <div className="pg-api-tpl">
          <span className="pg-field__label">{t('api.template')}</span>
          <div className="pg-api-tpl__row">
            <select
              className="pg-input pg-select"
              value={template}
              onChange={(event) => setTemplate(event.currentTarget.value as ApiTemplate)}
            >
              {API_TEMPLATES.map((name) => (
                <option key={name} value={name}>
                  {t(`tpl.${name}`)}
                </option>
              ))}
            </select>
            <span className="pg-api-tpl__slash">/</span>
            <input
              className="pg-input"
              aria-label={t('api.resource')}
              placeholder={t('api.resource')}
              value={resource}
              onChange={(event) => setResource(event.currentTarget.value)}
            />
          </div>
          <div className="pg-api-tpl__row">
            <select
              className="pg-input pg-select pg-api-tpl__service"
              aria-label={t('api.service')}
              value={service}
              onChange={(event) => setService(event.currentTarget.value)}
            >
              <option value="">{t('api.serviceAny')}</option>
              {design.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label || t(`block.${node.kind}`)}
                </option>
              ))}
            </select>
            <button type="button" className="pg-button" onClick={add}>
              <i className="codicon codicon-add" aria-hidden="true" /> {t('req.add')}
            </button>
          </div>
          <p className="pg-hint">{t(`tpl.${template}.hint`)}</p>
        </div>
      )}

      {!design.api.length && <p className="pg-hint pg-hint--empty">{t('api.empty')}</p>}

      {!readOnly && design.api.length > 0 && <p className="pg-hint">{t('api.dragHint')}</p>}

      <div
        className={`pg-api-groups ${dragging ? 'is-dragging' : ''}`}
        // Состояние меняется после старта, а не в нём: перестройка DOM прямо в
        // dragstart в Chrome отменяет перетаскивание.
        onDragStart={(event) => {
          if (event.dataTransfer.types.includes(ROUTE_DRAG)) setTimeout(() => setDragging(true));
        }}
        onDragEnd={() => {
          setDragging(false);
          setOver(null);
        }}
      >
        {keys.map((key) => {
          const items = design.api.filter((item) => keyOf(item) === key);
          return (
            <section className={`pg-api-group ${over === key ? 'is-over' : ''} ${items.length ? '' : 'is-empty'}`} key={key || 'none'} {...dropProps(key)}>
              <h3 className="pg-heading pg-api-group__title">
                <i className={`codicon codicon-${icon(key)}`} aria-hidden="true" /> {title(key)}{' '}
                <span className="pg-count">{items.length}</span>
              </h3>
              {items.length > 0 ? (
                <ul className="pg-api-list">
                  {items.map((item) =>
                    editing === item.id && !readOnly ? (
                      <Editor key={item.id} item={item} design={design} update={update} t={t} onClose={() => setEditing(null)} />
                    ) : (
                      <Card
                        key={item.id}
                        item={item}
                        design={design}
                        t={t}
                        onEdit={readOnly ? undefined : () => setEditing(item.id)}
                        onDelete={readOnly ? undefined : () => remove(item.id)}
                      />
                    ),
                  )}
                </ul>
              ) : (
                <p className="pg-api-group__drop">{t('api.dropHere')}</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Маршруты блока — в инспекторе: у сервиса сразу видно, какой кусок контракта он держит. */
export function BlockRoutes({ design, nodeId, t }: { design: Design; nodeId: string; t: T }) {
  const routes = design.api.filter((item) => item.service === nodeId);
  if (!routes.length) return null;
  return (
    <section className="pg-field">
      <span className="pg-field__label">
        {t('api.routes')} <span className="pg-count">{routes.length}</span>
      </span>
      <ul className="pg-api-list pg-api-list--compact">
        {routes.map((item) => (
          <li key={item.id} className={`pg-api pg-api--${item.method.toLowerCase()}`}>
            <Head item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

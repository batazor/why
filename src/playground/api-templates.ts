import { uid, type Endpoint, type HttpMethod } from './model';
import type { T } from './i18n';

/**
 * Шаблоны маршрутов: типовые куски HTTP-контракта, которые на собеседовании
 * рисуют чаще всего. Шаблон разворачивается под имя ресурса — `links`,
 * `jobs` — и дальше правится как обычные карточки.
 *
 * Пути, коды и поля — идентификаторы протокола, они не переводятся; строка
 * смысла берётся из локали с подстановкой ресурса.
 */

export const API_TEMPLATES = ['crud', 'asyncJob', 'upload', 'list', 'webhook', 'blank'] as const;
export type ApiTemplate = (typeof API_TEMPLATES)[number];

type Draft = [HttpMethod, string, number, string, string[]?, string[]?, boolean?];

/** Единственное число для `{id}`-параметра: `links` → `link`. Грубо, но для пути хватает. */
function singular(resource: string) {
  return resource.endsWith('ies') ? `${resource.slice(0, -3)}y` : resource.replace(/s$/, '');
}

function drafts(template: ApiTemplate, resource: string): Draft[] {
  const r = `/${resource}`;
  const one = singular(resource);
  switch (template) {
    case 'crud':
      return [
        ['POST', r, 201, 'crud.create', ['Idempotency-Key', '…fields'], ['id', 'created_at']],
        ['GET', `${r}/{id}`, 200, 'crud.read', undefined, [one]],
        ['PATCH', `${r}/{id}`, 200, 'crud.update', ['If-Match', '…fields'], [one, 'ETag']],
        ['DELETE', `${r}/{id}`, 204, 'crud.delete'],
      ];
    case 'asyncJob':
      return [
        ['POST', r, 202, 'job.submit', ['Idempotency-Key', 'params', 'callback_url?'], ['id', 'status: queued', 'links.self']],
        ['GET', `${r}/{id}`, 200, 'job.status', undefined, ['status', 'attempts', 'last_error']],
        ['GET', `${r}/{id}/result`, 200, 'job.result', undefined, ['url', 'expires_at']],
        ['DELETE', `${r}/{id}`, 202, 'job.cancel', undefined, ['status: cancelling']],
        ['POST', '{callback_url}', 200, 'job.webhook', ['id', 'status', 'finished_at', 'X-Signature'], undefined, true],
      ];
    case 'upload':
      return [
        ['POST', r, 201, 'upload.init', ['filename', 'size', 'content_type'], ['id', 'upload_url', 'expires_at']],
        ['PUT', '{upload_url}', 200, 'upload.put', ['bytes'], ['ETag']],
        ['POST', `${r}/{id}/complete`, 200, 'upload.complete', ['parts[]'], ['id', 'status: ready']],
      ];
    case 'list':
      return [['GET', `${r}?cursor=&limit=`, 200, 'list.page', undefined, ['items[]', 'next_cursor']]];
    case 'webhook':
      return [['POST', '{callback_url}', 200, 'hook.event', ['event', 'id', 'occurred_at', 'X-Signature'], undefined, true]];
    case 'blank':
      return [['GET', r, 200, '']];
  }
}

export function expandTemplate(template: ApiTemplate, resource: string, t: T): Endpoint[] {
  const name = resource.trim().replace(/^\/+/, '') || 'items';
  return drafts(template, name).map(([method, path, status, about, request, response, outbound]) => ({
    id: uid('api'),
    method,
    path,
    status,
    about: about ? t(`tpl.${about}`, { resource: name }) : '',
    request: request ?? [],
    response: response ?? [],
    outbound: Boolean(outbound),
    covers: [],
  }));
}

/** Текст статуса по коду: его пишут рядом с числом, как в карточке разбора. */
const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  412: 'Precondition Failed',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  503: 'Service Unavailable',
};

export const STATUS_CODES = Object.keys(STATUS_TEXT).map(Number);

export function statusText(status: number): string {
  return STATUS_TEXT[status] ?? '';
}

/** Поля в карточке — список, в поле ввода — строка через запятую. */
export function parseFields(value: string): string[] {
  return value
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
}

/** Тип перетаскивания маршрута: карточку бросают на группу сервиса или на блок схемы. */
export const ROUTE_DRAG = 'application/x-sysdesign-route';

/** Группа «Исходящие»: маршрут, брошенный туда, становится вызовом клиента. */
export const OUTBOUND = '__out';

/**
 * Куда перенесли маршрут: на блок — его обслуживает этот блок; в «Без
 * сервиса» — ничей; в «Исходящие» — это уже наш вызов клиенту, а не вход.
 */
export function assignRoute(api: Endpoint[], id: string, target: string): Endpoint[] {
  return api.map((item) => {
    if (item.id !== id) return item;
    if (target === OUTBOUND) return { ...item, outbound: true, service: undefined };
    return { ...item, outbound: false, service: target || undefined };
  });
}

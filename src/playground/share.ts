import { emptyBoard, emptyScenario, emptySession, migrate, pickBoard, type Design } from './model';
import type { Role } from './roles';

/**
 * Ссылка на сценарий: весь проект едет в адресе, сервера нет.
 *
 * Данные лежат в hash (`#s=…`): он не уходит на сервер ни при каком хостинге,
 * не попадает в логи и в Referer. Проект сжимается deflate и кодируется
 * base64url — пример на 25 КБ превращается примерно в 6 КБ ссылки. Браузеры
 * такую открывают, но мессенджеры и почта режут длинные ссылки, поэтому рядом
 * всегда есть файл.
 *
 * Главное здесь — не размер, а что именно уезжает. В ссылке для кандидата не
 * должно быть ни эталона, ни подсказок, ни критериев: адрес видно целиком, и
 * «спрятать» в нём ничего нельзя.
 */

export interface ShareOptions {
  /** В какой роли откроется ссылка. */
  role: Role;
  /** Вложить сценарий: эталон, подсказки, критерии, вопросы, заметки. */
  scenario: boolean;
  /** Вложить текущую доску: схему, требования, API, прикидку. */
  board: boolean;
}

/** Что уедет по ссылке: копия проекта без того, чего этой роли видеть нельзя. */
export function shared(design: Design, options: ShareOptions): Design {
  return {
    ...design,
    ...(options.board ? pickBoard(design) : emptyBoard()),
    scenario: options.scenario
      ? design.scenario
      : // Настройки остаются: без них кандидат не получит ни калькулятор, ни проверки.
        { ...emptyScenario(), allowChecks: design.scenario.allowChecks },
    // Сессия — про одно прохождение: оценки, подсказки и сигналы чужие.
    session: emptySession(),
  };
}

const bytes = (text: string) => new TextEncoder().encode(text);

function toBase64url(data: Uint8Array): string {
  let binary = '';
  // Кусками: спред на сотнях килобайт переполняет стек аргументов.
  for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function squeeze(data: Uint8Array, mode: 'deflate-raw', direction: 'c' | 'd'): Promise<Uint8Array> {
  const stream = direction === 'c' ? new CompressionStream(mode) : new DecompressionStream(mode);
  const blob = await new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream as never)).arrayBuffer();
  return new Uint8Array(blob);
}

/**
 * Первый символ — метка способа: `1` сжато, `0` просто base64. Сжатие есть не
 * везде (старые Safari), и без метки читатель не знал бы, что ему прислали.
 */
export async function encodeDesign(design: Design): Promise<string> {
  const json = bytes(JSON.stringify(design));
  try {
    return `1${toBase64url(await squeeze(json, 'deflate-raw', 'c'))}`;
  } catch {
    return `0${toBase64url(json)}`;
  }
}

export async function decodeDesign(payload: string): Promise<Design> {
  const data = fromBase64url(payload.slice(1));
  const json = payload.startsWith('1') ? await squeeze(data, 'deflate-raw', 'd') : data;
  return migrate(JSON.parse(new TextDecoder().decode(json)));
}

export function shareUrl(payload: string, role: Role): string {
  const url = new URL(location.href);
  url.searchParams.set('role', role);
  url.hash = `s=${payload}`;
  return url.toString();
}

/** Полученную ссылку читаем один раз при загрузке. */
export function payloadFromUrl(): string | null {
  const match = location.hash.match(/(?:^#|&)s=([^&]+)/);
  return match ? match[1] : null;
}

/**
 * Адрес чистится сразу после открытия: иначе кандидат перезагрузит страницу и
 * вернётся к присланному состоянию, потеряв свою работу.
 */
export function clearPayload() {
  const url = new URL(location.href);
  url.hash = '';
  history.replaceState(null, '', url.toString().replace(/#$/, ''));
}

/** Длиннее этого ссылку режут почта и мессенджеры — честнее предложить файл. */
export const LINK_LIMIT = 8000;

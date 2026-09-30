import type { FlowSpec } from './flow';

/**
 * Схема урока про словари. Верхний ряд — путь запроса: форма заказа присылает
 * страну из адреса, оформление заказа превращает её в варианты доставки. Он не
 * меняется от шага к шагу — и в этом смысл: словарь живёт под ним, в стороне.
 *
 * Нижние ряды — откуда сервис берёт знание о странах. Логистика стоит
 * посередине и не двигается: на первом шаге её путь уходит влево, в релиз и
 * константу, дальше — вправо, в админку и копию в памяти. Старое и новое не
 * делят одно место: иначе при смене шага гаснущая карточка и появляющаяся
 * на время перехода лежат друг на друге.
 */
const HARDCODE = ['hardcode'];
const DICTIONARY = ['dictionary', 'storage', 'key', 'offpath', 'swap', 'unknown', 'owner'];
const KNOWN = ['hardcode', 'dictionary', 'storage', 'key', 'offpath', 'swap', 'owner'];

const flow: FlowSpec = {
  height: 430,
  nodes: [
    { id: 'form', kind: '{{kindClient}}', title: '{{orderForm}}', sub: '{{sendsCountry}}', position: { x: 0, y: 0 } },
    { id: 'service', kind: '{{kindService}}', title: 'Checkout', sub: '{{buildsOptions}}', position: { x: 290, y: 0 } },
    { id: 'response', kind: '{{kindOutput}}', title: '{{options}}', sub: '{{zoneAndCod}}', position: { x: 580, y: 0 } },

    // Слева — как было: константа в коде и релиз.
    {
      id: 'constmap',
      kind: '{{kindCode}}',
      title: 'shippingZones',
      sub: '{{mapInCode}}',
      position: { x: 0, y: 170 },
      only: HARDCODE,
    },
    {
      id: 'release',
      kind: '{{kindProcess}}',
      title: '{{release}}',
      sub: 'code → review → deploy',
      position: { x: 0, y: 320 },
      only: HARDCODE,
      bad: HARDCODE,
    },

    // Посередине — люди, которые знают, куда возим, и общая доставка словарей.
    { id: 'ops', kind: '{{kindPeople}}', title: '{{logistics}}', sub: '{{knowsCountries}}', position: { x: 290, y: 320 } },
    {
      id: 'loader',
      kind: '{{kindCode}}',
      title: 'Fetch[T]',
      sub: '{{sharedTransport}}',
      position: { x: 290, y: 170 },
      only: ['owner'],
      focus: ['owner'],
    },

    // Справа — как стало: админка и копия в памяти.
    {
      id: 'memory',
      kind: '{{kindState}}',
      title: '{{memCopy}}',
      sub: 'map[string]Country',
      position: { x: 580, y: 170 },
      only: DICTIONARY,
      focus: ['key', 'swap', 'unknown'],
    },
    {
      id: 'admin',
      kind: '{{kindService}}',
      title: '{{adminPanel}}',
      sub: 'shipping_countries',
      position: { x: 580, y: 320 },
      only: DICTIONARY,
      focus: ['dictionary', 'storage'],
      bad: ['offpath'],
    },
  ],
  edges: [
    { id: 'in', source: 'form', target: 'service', sourceHandle: 'r', targetHandle: 'l', label: 'country: CZ', only: KNOWN },
    {
      id: 'in-unknown',
      source: 'form',
      target: 'service',
      sourceHandle: 'r',
      targetHandle: 'l',
      label: 'country: XK',
      only: ['unknown'],
    },
    { id: 'out', source: 'service', target: 'response', sourceHandle: 'r', targetHandle: 'l', label: 'eu, COD', tone: 'ok', only: KNOWN },
    {
      id: 'out-unknown',
      source: 'service',
      target: 'response',
      sourceHandle: 'r',
      targetHandle: 'l',
      label: '{{notShippable}}',
      tone: 'bad',
      dashed: true,
      only: ['unknown'],
    },

    { id: 'lookup-const', source: 'service', target: 'constmap', sourceHandle: 'b', targetHandle: 't', label: 'shippingZones["CZ"]', only: HARDCODE },
    { id: 'lookup', source: 'service', target: 'memory', sourceHandle: 'b', targetHandle: 't', label: 'Lookup("CZ")', only: KNOWN.filter((s) => s !== 'hardcode') },
    { id: 'lookup-unknown', source: 'service', target: 'memory', sourceHandle: 'b', targetHandle: 't', label: 'Lookup("XK") → false', only: ['unknown'] },

    { id: 'ticket', source: 'ops', target: 'release', sourceHandle: 'l', targetHandle: 'r', label: '{{ticket}}', only: HARDCODE },
    { id: 'deploy', source: 'release', target: 'constmap', sourceHandle: 't', targetHandle: 'b', label: '{{days}}', tone: 'bad', only: HARDCODE },

    { id: 'row', source: 'ops', target: 'admin', sourceHandle: 'r', targetHandle: 'l', label: '{{addsRow}}', only: DICTIONARY },
    {
      id: 'poll',
      source: 'admin',
      target: 'memory',
      sourceHandle: 't',
      targetHandle: 'b',
      label: '{{every5min}}',
      tone: 'ok',
      only: ['dictionary', 'storage', 'key', 'unknown'],
    },
    {
      id: 'poll-down',
      source: 'admin',
      target: 'memory',
      sourceHandle: 't',
      targetHandle: 'b',
      label: '502 — {{keepCopy}}',
      tone: 'bad',
      dashed: true,
      only: ['offpath'],
    },
    {
      id: 'poll-invalid',
      source: 'admin',
      target: 'memory',
      sourceHandle: 't',
      targetHandle: 'b',
      label: 'zone "islands" — {{rejected}}',
      tone: 'bad',
      dashed: true,
      only: ['swap'],
    },
    // Общая доставка: админка → Fetch[T] → копия. Прямая стрелка на этом шаге скрыта.
    { id: 'slug', source: 'admin', target: 'loader', sourceHandle: 't', targetHandle: 'b', label: 'slug', only: ['owner'] },
    { id: 'decode', source: 'loader', target: 'memory', sourceHandle: 'r', targetHandle: 'l', label: '[]Country', only: ['owner'] },
  ],
  // Только геометрия: текст пометки переводится и лежит в steps[].note урока.
  annotations: [
    { step: 'hardcode', position: { x: 215, y: 185 }, arrow: 'left', width: 190 },
    { step: 'dictionary', position: { x: 790, y: 320 }, arrow: 'left', width: 190 },
    { step: 'key', position: { x: 790, y: 170 }, arrow: 'left', width: 190 },
    { step: 'offpath', position: { x: 790, y: 320 }, arrow: 'left', width: 190 },
    { step: 'swap', position: { x: 790, y: 170 }, arrow: 'left', width: 190 },
    { step: 'unknown', position: { x: 790, y: 0 }, arrow: 'left', width: 190 },
    { step: 'owner', position: { x: 60, y: 170 }, arrow: 'right', width: 200 },
  ],
};

export default flow;

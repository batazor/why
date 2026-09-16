import type { CodeDeck } from './types';
// Расширение обязательно: колоду импортирует ещё и node-скрипт проверки.
import posterSpec from './idempotency.poster.ts';
import flowSpec from './idempotency.flow.ts';

/**
 * Колода шагов для урока «зачем нужна идемпотентность».
 *
 * ПРАВИЛО: код и вывод общие для всех локалей, поэтому они только на английском
 * и без объясняющих комментариев. Любая проза идёт в `narration` локализованного
 * урока — иначе русский комментарий вылезет на английской странице.
 * Комментарий в коде допустим, только если он часть самого примера.
 *
 * Подсветка задаётся [!code highlight] / [!code ++], а не номерами строк:
 * номера разъезжаются при правке примера, маркеры — нет.
 */
/** Постер: суть проблемы одной схемой — карточка каталога и блок «Проблема». */
export const poster = posterSpec;

/** Схема разбора: что происходит с одним намерением на каждом шаге. */
export const flow = flowSpec;

const deck: CodeDeck = [
  {
    id: 'naive',
    lang: 'ts',
    caption: 'payments.ts',
    code: `app.post('/charge', async (req, res) => {
  const { userId, amountCents } = req.body;

  const charge = await bank.charge(userId, amountCents);
  await db.payments.insert({ id: charge.id, userId, amountCents });

  res.json({ chargeId: charge.id });
});`,
    output: `POST /charge  { userId: "u_42", amountCents: 9900 }
201  { chargeId: "ch_001" }`,
    outputTone: 'ok',
  },
  {
    id: 'timeout',
    lang: 'ts',
    caption: 'client.ts',
    code: `const res = await fetch('/charge', {
  method: 'POST',
  body: JSON.stringify({ userId, amountCents }),
  signal: AbortSignal.timeout(3000), // [!code highlight]
});

if (!res.ok) return retry(); // [!code highlight]`,
    output: `POST /charge   -> timeout after 3s, response lost in transit
POST /charge   -> 201 { chargeId: "ch_002" }

bank: user u_42 charged 99.00 TWICE`,
    outputTone: 'bad',
  },
  {
    id: 'key',
    lang: 'ts',
    caption: 'client.ts',
    code: `const idempotencyKey = crypto.randomUUID(); // [!code ++]

async function charge() {
  return fetch('/charge', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey }, // [!code ++]
    body: JSON.stringify({ userId, amountCents }),
  });
}

await charge().catch(charge);`,
  },
  {
    id: 'store',
    lang: 'sql',
    caption: 'migration.sql',
    code: `create table idempotency_keys (
  key          text primary key,   -- [!code highlight]
  request_hash text        not null,
  response     jsonb,
  created_at   timestamptz not null default now()
);`,
  },
  {
    id: 'handler',
    lang: 'ts',
    caption: 'payments.ts',
    code: `app.post('/charge', async (req, res) => {
  const key = req.header('Idempotency-Key');
  if (!key) return res.status(400).json({ error: 'Idempotency-Key required' });

  const claimed = await db.idempotencyKeys.insertIfAbsent({ // [!code highlight]
    key,
    requestHash: hash(req.body),
  });

  if (!claimed) {
    const prior = await db.idempotencyKeys.get(key);
    if (prior.requestHash !== hash(req.body))          // [!code highlight]
      return res.status(422).json({ error: 'key reused with different body' });
    if (!prior.response) return res.status(409).json({ error: 'in progress' });
    return res.json(prior.response);                   // [!code highlight]
  }

  const charge = await bank.charge(userId, amountCents);
  const response = { chargeId: charge.id };
  await db.idempotencyKeys.setResponse(key, response);
  res.json(response);
});`,
    output: `POST /charge  Idempotency-Key: k_7f3  -> timeout, response lost
POST /charge  Idempotency-Key: k_7f3  -> 200 { chargeId: "ch_003" }

bank: user u_42 charged 99.00 ONCE`,
    outputTone: 'ok',
  },
];

export default deck;

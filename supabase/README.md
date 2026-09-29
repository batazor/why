# Supabase для песочницы

Бэкенд живой сессии собеседования: вход через Google и комната на Supabase
Realtime, где интервьюер видит курсор и доску кандидата. Без настроек ниже
песочница работает как раньше — локально, без кнопок входа.

## 1. Проект

Создать проект на [supabase.com](https://supabase.com). Из **Project Settings →
API** понадобятся `Project URL` и публичный ключ (`anon` / publishable). Ключ
публичный по замыслу: он и так виден в браузере, доступ режут политики RLS.

## 2. Вход через Google

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
   **Create credentials → OAuth client ID → Web application**.
   В **Authorized redirect URIs** — `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → **Authentication → Sign In / Providers → Google**: включить,
   вписать Client ID и Client Secret.
3. Supabase → **Authentication → URL Configuration**:
   - Site URL — адрес сайта на Pages, например `https://<user>.github.io/why/`;
   - Redirect URLs — `http://localhost:4321/**` и `https://<user>.github.io/why/**`.
     После Google человек возвращается на ту же страницу с ролью и комнатой в
     адресе, поэтому нужен шаблон `/**`, а не один адрес.

## 3. Схема и Realtime

1. Применить миграции из [`migrations/`](migrations/) по порядку: через
   `supabase db push` (проект привязан `supabase link`) или по очереди в **SQL Editor**.
2. **Realtime → Settings**: выключить **Allow public access**. Тогда каналы
   бывают только приватными, и без входа в комнату не попасть.

## Модель данных

```
workspaces ── workspace_members (owner / author / interviewer)
    │
    ├── scenarios ──────── scenario_private   ← кандидату недоступно
    │       │
    └── interviews ─┬──── interview_boards    ← пишет только кандидат
                    └──── interview_reviews   ← кандидату недоступно
```

- **Роль выводится из записей**, а не выбирается в списке: член пространства
  с ролью `author` пишет сценарии, `interviewer` ведёт собеседования, `owner`
  ещё и управляет людьми. Кандидат в пространство не входит.
- **Сценарий поделён надвое.** `scenarios` — задание и настройки, их кандидат
  видит. `scenario_private` — эталон, подсказки, критерии, вопросы, заметки;
  ни одна политика не пускает туда кандидата.
- **Приглашение** — `interviews.invite_token` в ссылке. Кандидат входит через
  Google и вызывает `claim_interview(token)`. Принять можно один раз; если
  интервьюер указал `candidate_email`, то только с этой почты.
- **Доска** пишется только кандидатом и только пока собеседование не
  `finished` / `cancelled`; после — заморожена.
- **Комната Realtime** — `room:<interview id>`. Слушать и писать в неё могут
  только участники собеседования: кандидат и люди его пространства.
- Коллегу в пространство добавляет владелец: `add_workspace_member(ws, email, role)`.
  Человек должен хоть раз войти, иначе сервер его не знает.

Содержимое, которое песочница уже описывает типами (`Board`, `Scenario`,
`Session` из `src/playground/model.ts`), лежит в jsonb как есть. Колонками
вынесено только то, по чему работают права.

## Тесты прав

[`tests/interviews_rls.sql`](tests/interviews_rls.sql) проходит собеседование
от лица владельца, интервьюера, кандидата и посторонней и проверяет, кто что
видит и может. Всё в одной транзакции с откатом:

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/interviews_rls.sql
```

## 4. Переменные

Локально — файл `.env` в корне (он в `.gitignore`):

```
PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Для Pages — те же имена в **Settings → Secrets and variables → Actions →
Variables** репозитория (переменные, не секреты: значения всё равно попадут в
собранный JS). Workflow передаёт их в сборку.

## Как пользоваться

> Клиент пока на прежней схеме: кнопка «Живая сессия» создаёт случайную
> комнату, а после миграции `workspaces_and_interviews` сервер пускает только
> в комнаты существующих собеседований. Клиент переезжает на эту схему
> следующим шагом; до тех пор описанное ниже — как было задумано в первой версии.

1. Интервьюер входит через Google и жмёт **Живая сессия** — в адресе
   появляется `?room=…`.
2. **Поделиться → Кандидат**: ссылка несёт задание и ту же комнату.
3. Кандидат открывает ссылку, входит через Google и рисует. Интервьюер видит
   его курсор с подписью и доску по мере правок; кандидат видит курсор
   интервьюера — им удобно показывать «а вот здесь?».

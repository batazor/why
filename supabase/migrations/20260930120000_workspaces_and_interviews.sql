-- Собеседование как сущность на сервере.
--
-- До этой миграции роль человек выбирал в списке, а закрытое от кандидата
-- держалось только на том, что не попало в его ссылку. Здесь роль выводится
-- из записей, а границы проводит RLS:
--
--   workspaces ── workspace_members (owner / author / interviewer)
--       │
--       ├── scenarios ──────── scenario_private   ← кандидату недоступно
--       │       │
--       └── interviews ─┬──── interview_boards    ← пишет только кандидат
--                       └──── interview_reviews   ← кандидату недоступно
--
-- Кандидат в пространство не входит. Он видит ровно одно собеседование — то,
-- на которое принял приглашение, — задание его сценария и свою доску.
--
-- Содержимое, которое песочница уже описывает типами (доска, эталон, оценки),
-- лежит в jsonb в том же виде, что в src/playground/model.ts. Колонками
-- вынесено то, по чему работают права и выборки.

-- ─── Служебная схема ────────────────────────────────────────────────────────
-- Функции проверки прав — security definer: иначе политика members, читающая
-- members, уходила бы в рекурсию. В схеме private их не видно через API.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create extension if not exists pgcrypto with schema extensions;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── Профили ────────────────────────────────────────────────────────────────
-- Имя и аватар из Google. Нужны, чтобы в отчёте и в списке собеседований был
-- человек, а не uuid; заполняются триггером из auth.users.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  avatar_url text,
  updated_at timestamptz not null default now()
);

create index profiles_email on public.profiles (lower(email));

create or replace function private.sync_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do update
    set email = excluded.email,
        name = excluded.name,
        avatar_url = excluded.avatar_url,
        updated_at = now();
  return new;
end;
$$;

create trigger sync_profile
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function private.sync_profile();

-- ─── Пространства и участники ───────────────────────────────────────────────

create type public.workspace_role as enum ('owner', 'author', 'interviewer');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user on public.workspace_members (user_id);

/** Состоит ли текущий пользователь в пространстве — с одной из ролей, если они заданы. */
create or replace function private.is_member(ws uuid, roles public.workspace_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = auth.uid()
      and (roles is null or m.role = any (roles))
  );
$$;

-- ─── Сценарии ───────────────────────────────────────────────────────────────
-- Открытая часть — то, что кандидат видит карточкой задания и в настройках
-- прохождения. Всё, что его не касается, — в scenario_private.

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null default '',
  task text not null default '',
  task_source text not null default '',
  /** CalcState: режим оценок у кандидата и значения калькулятора. */
  calc jsonb not null default '{"mode": "off", "values": {}}',
  /** Показывать ли кандидату проверки схемы. */
  allow_checks boolean not null default false,
  /** Версия формата проекта (Design.version), чтобы migrate() знал, что читает. */
  format_version int not null default 1,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scenarios_workspace on public.scenarios (workspace_id);

create trigger touch_scenarios
before update on public.scenarios
for each row execute function private.touch_updated_at();

create table public.scenario_private (
  scenario_id uuid primary key references public.scenarios (id) on delete cascade,
  /** Scenario без allowChecks: эталон, подсказки, критерии, вопросы, заметки, проверки. */
  content jsonb not null default '{}' check (octet_length(content::text) < 1000000),
  updated_at timestamptz not null default now()
);

create trigger touch_scenario_private
before update on public.scenario_private
for each row execute function private.touch_updated_at();

-- ─── Собеседования ──────────────────────────────────────────────────────────

create type public.interview_status as enum ('scheduled', 'live', 'finished', 'cancelled');

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  scenario_id uuid not null references public.scenarios (id) on delete restrict,
  interviewer_id uuid not null default auth.uid() references auth.users (id),
  /**
   * Кого звали. Пусто — приглашение по ссылке, примет первый вошедший.
   * Задан — принять может только вход с этим адресом.
   */
  candidate_email text,
  /** Кто принял приглашение. До этого кандидата у собеседования нет. */
  candidate_id uuid references auth.users (id),
  /** Секрет ссылки-приглашения. 24 случайных байта: не угадать и не перебрать. */
  invite_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  status public.interview_status not null default 'scheduled',
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  /** Интервьюер открыл калькулятор по ходу (режим «сначала текст»): кандидат это видит. */
  calc_unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (candidate_id is null or candidate_id <> interviewer_id)
);

create index interviews_workspace on public.interviews (workspace_id);
create index interviews_candidate on public.interviews (candidate_id);

create trigger touch_interviews
before update on public.interviews
for each row execute function private.touch_updated_at();

/** Сценарий обязан лежать в том же пространстве, что и собеседование. */
create or replace function private.check_interview_scenario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.scenarios s where s.id = new.scenario_id and s.workspace_id = new.workspace_id
  ) then
    raise exception 'scenario % is not in workspace %', new.scenario_id, new.workspace_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger check_interview_scenario
before insert or update of scenario_id, workspace_id on public.interviews
for each row execute function private.check_interview_scenario();

/** Кандидат ли текущий пользователь в этом собеседовании. */
create or replace function private.is_candidate(interview uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.interviews i where i.id = interview and i.candidate_id = auth.uid()
  );
$$;

/** Интервьюер ли — или кто-то из пространства, кому видно собеседование. */
create or replace function private.is_staff(interview uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.interviews i where i.id = interview and private.is_member(i.workspace_id)
  );
$$;

create or replace function private.is_participant(interview uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_candidate(interview) or private.is_staff(interview);
$$;

-- Доска кандидата: последний снимок. Журнал правок — отдельной таблицей потом.
create table public.interview_boards (
  interview_id uuid primary key references public.interviews (id) on delete cascade,
  /** Board: nodes, edges, requirements, api, estimate. */
  board jsonb not null default '{"nodes": [], "edges": [], "requirements": [], "api": [], "estimate": ""}'
    -- Доска с примером весит десятки килобайт; мегабайт — уже не доска, а мусор.
    check (octet_length(board::text) < 1000000),
  updated_at timestamptz not null default now()
);

create trigger touch_interview_boards
before update on public.interview_boards
for each row execute function private.touch_updated_at();

-- Работа интервьюера: открытые подсказки, заданные вопросы, оценки, заметки.
create table public.interview_reviews (
  interview_id uuid primary key references public.interviews (id) on delete cascade,
  /** Session без сигналов и времени: revealed, asked, scores, notes, estimateSnapshot. */
  session jsonb not null default '{"revealed": [], "asked": [], "scores": {}, "notes": ""}',
  updated_at timestamptz not null default now()
);

create trigger touch_interview_reviews
before update on public.interview_reviews
for each row execute function private.touch_updated_at();

-- ─── Действия, которым мало одной строки таблицы ────────────────────────────

/** Новое пространство сразу с создателем-владельцем. */
create or replace function public.create_workspace(name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  insert into public.workspaces (name, created_by) values (create_workspace.name, auth.uid()) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  return ws;
end;
$$;

/**
 * Позвать коллегу в пространство по адресу почты. Человек должен уже хоть раз
 * войти: пригласить того, кого сервер не знает, пока нечем.
 */
create or replace function public.add_workspace_member(ws uuid, email text, role public.workspace_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  member uuid;
begin
  if not private.is_member(ws, array['owner']::public.workspace_role[]) then
    raise exception 'only the owner adds members' using errcode = 'insufficient_privilege';
  end if;
  -- Почту сравниваем без регистра: Google отдаёт её как записано в аккаунте.
  select p.id into member from public.profiles p where lower(p.email) = lower(add_workspace_member.email);
  if member is null then
    raise exception 'no user with this email has signed in yet' using errcode = 'no_data_found';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, member, add_workspace_member.role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
  return member;
end;
$$;

/**
 * Принять приглашение на собеседование по секрету из ссылки.
 *
 * Принять можно один раз: второй вошедший по той же ссылке получит отказ, а
 * не чужое собеседование. Если интервьюер указал почту — только с неё.
 */
create or replace function public.claim_interview(token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.interviews;
  me uuid := auth.uid();
  my_email text := auth.jwt() ->> 'email';
begin
  if me is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  select * into inv from public.interviews i where i.invite_token = claim_interview.token for update;
  if inv.id is null then
    raise exception 'invitation not found' using errcode = 'no_data_found';
  end if;
  if inv.candidate_id = me then
    return inv.id;
  end if;
  if inv.candidate_id is not null then
    raise exception 'invitation already accepted' using errcode = 'unique_violation';
  end if;
  if inv.status in ('finished', 'cancelled') then
    raise exception 'interview is over' using errcode = 'check_violation';
  end if;
  if inv.interviewer_id = me or private.is_member(inv.workspace_id) then
    raise exception 'staff cannot be the candidate' using errcode = 'check_violation';
  end if;
  if inv.candidate_email is not null
     and lower(inv.candidate_email) <> lower(coalesce(my_email, '')) then
    raise exception 'invitation is for another email' using errcode = 'insufficient_privilege';
  end if;

  update public.interviews set candidate_id = me where id = inv.id;
  insert into public.interview_boards (interview_id) values (inv.id) on conflict do nothing;
  return inv.id;
end;
$$;

revoke execute on function public.create_workspace(text) from public, anon;
revoke execute on function public.add_workspace_member(uuid, text, public.workspace_role) from public, anon;
revoke execute on function public.claim_interview(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.add_workspace_member(uuid, text, public.workspace_role) to authenticated;
grant execute on function public.claim_interview(text) to authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.scenarios enable row level security;
alter table public.scenario_private enable row level security;
alter table public.interviews enable row level security;
alter table public.interview_boards enable row level security;
alter table public.interview_reviews enable row level security;

-- Анонимам здесь нечего делать ни с одной таблицей.
revoke all on public.profiles, public.workspaces, public.workspace_members, public.scenarios,
  public.scenario_private, public.interviews, public.interview_boards, public.interview_reviews
  from anon;

-- Профили: свой, коллег по пространству и того, с кем идёт собеседование.
create policy "profiles: self, colleagues, interview counterpart"
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
  or exists (
    select 1 from public.interviews i
    where (i.candidate_id = profiles.id and private.is_member(i.workspace_id))
       or (i.candidate_id = auth.uid() and i.interviewer_id = profiles.id)
  )
);
-- Пишет профиль только триггер из auth.users.
revoke insert, update, delete on public.profiles from authenticated;

create policy "workspaces: members read"
on public.workspaces for select to authenticated
using (private.is_member(id));

create policy "workspaces: owner renames"
on public.workspaces for update to authenticated
using (private.is_member(id, array['owner']::public.workspace_role[]));

create policy "workspaces: owner deletes"
on public.workspaces for delete to authenticated
using (private.is_member(id, array['owner']::public.workspace_role[]));

-- Создаётся только через create_workspace: вместе с владельцем.
revoke insert on public.workspaces from authenticated;
revoke update on public.workspaces from authenticated;
grant update (name) on public.workspaces to authenticated;

create policy "members: colleagues read"
on public.workspace_members for select to authenticated
using (private.is_member(workspace_id));

create policy "members: owner changes roles"
on public.workspace_members for update to authenticated
using (private.is_member(workspace_id, array['owner']::public.workspace_role[]));

-- Удалить может владелец — или сам человек, уходя из пространства.
create policy "members: owner removes, anyone leaves"
on public.workspace_members for delete to authenticated
using (user_id = auth.uid() or private.is_member(workspace_id, array['owner']::public.workspace_role[]));

-- Добавляются только через add_workspace_member; менять можно лишь роль.
revoke insert on public.workspace_members from authenticated;
revoke update on public.workspace_members from authenticated;
grant update (role) on public.workspace_members to authenticated;

-- Сценарии: читает пространство и кандидат своего собеседования; пишут автор и владелец.
create policy "scenarios: members and own candidate read"
on public.scenarios for select to authenticated
using (
  private.is_member(workspace_id)
  or exists (select 1 from public.interviews i where i.scenario_id = scenarios.id and i.candidate_id = auth.uid())
);

create policy "scenarios: authors write"
on public.scenarios for insert to authenticated
with check (private.is_member(workspace_id, array['owner', 'author']::public.workspace_role[]));

create policy "scenarios: authors update"
on public.scenarios for update to authenticated
using (private.is_member(workspace_id, array['owner', 'author']::public.workspace_role[]))
with check (private.is_member(workspace_id, array['owner', 'author']::public.workspace_role[]));

create policy "scenarios: authors delete"
on public.scenarios for delete to authenticated
using (private.is_member(workspace_id, array['owner', 'author']::public.workspace_role[]));

-- Закрытая часть сценария: только пространство. Кандидата здесь нет ни в одной политике.
create policy "scenario private: members read"
on public.scenario_private for select to authenticated
using (exists (select 1 from public.scenarios s where s.id = scenario_id and private.is_member(s.workspace_id)));

create policy "scenario private: authors write"
on public.scenario_private for all to authenticated
using (exists (
  select 1 from public.scenarios s
  where s.id = scenario_id and private.is_member(s.workspace_id, array['owner', 'author']::public.workspace_role[])
))
with check (exists (
  select 1 from public.scenarios s
  where s.id = scenario_id and private.is_member(s.workspace_id, array['owner', 'author']::public.workspace_role[])
));

-- Собеседования.
create policy "interviews: staff and own candidate read"
on public.interviews for select to authenticated
using (private.is_member(workspace_id) or candidate_id = auth.uid());

create policy "interviews: members schedule their own"
on public.interviews for insert to authenticated
with check (private.is_member(workspace_id) and interviewer_id = auth.uid() and candidate_id is null);

create policy "interviews: interviewer or owner updates"
on public.interviews for update to authenticated
using (interviewer_id = auth.uid() or private.is_member(workspace_id, array['owner']::public.workspace_role[]))
with check (interviewer_id = auth.uid() or private.is_member(workspace_id, array['owner']::public.workspace_role[]));

create policy "interviews: interviewer or owner deletes"
on public.interviews for delete to authenticated
using (interviewer_id = auth.uid() or private.is_member(workspace_id, array['owner']::public.workspace_role[]));

-- Кандидат назначается только через claim_interview; интервьюер меняет ход собеседования.
revoke update on public.interviews from authenticated;
grant update (candidate_email, status, scheduled_at, started_at, finished_at, calc_unlocked_at)
  on public.interviews to authenticated;

-- Доска: видят участники, пишет только кандидат и только пока собеседование не закончено.
create policy "boards: participants read"
on public.interview_boards for select to authenticated
using (private.is_participant(interview_id));

create policy "boards: candidate writes while open"
on public.interview_boards for update to authenticated
using (private.is_candidate(interview_id))
with check (
  private.is_candidate(interview_id)
  and exists (
    select 1 from public.interviews i
    where i.id = interview_id and i.status in ('scheduled', 'live')
  )
);

-- Строку доски создаёт claim_interview; кандидат её только обновляет.
revoke insert, delete on public.interview_boards from authenticated;
revoke update on public.interview_boards from authenticated;
grant update (board) on public.interview_boards to authenticated;

-- Работа интервьюера: пространство читает и пишет, кандидат — никак.
create policy "reviews: staff read"
on public.interview_reviews for select to authenticated
using (private.is_staff(interview_id));

create policy "reviews: staff write"
on public.interview_reviews for insert to authenticated
with check (private.is_staff(interview_id));

create policy "reviews: staff update"
on public.interview_reviews for update to authenticated
using (private.is_staff(interview_id))
with check (private.is_staff(interview_id));

-- ─── Realtime: комната — это собеседование ──────────────────────────────────
-- Раньше в комнату `room:<uuid>` пускали любого вошедшего. Теперь имя комнаты —
-- id собеседования, и пускают только его участников.

drop policy if exists "interview rooms: signed-in users receive" on realtime.messages;
drop policy if exists "interview rooms: signed-in users send" on realtime.messages;

/** id собеседования из имени канала `room:<uuid>`; не uuid — null, а не ошибка приведения. */
create or replace function private.room_interview()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when realtime.topic() ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(realtime.topic(), 6)::uuid
  end;
$$;

grant execute on function private.room_interview() to authenticated;
grant execute on function private.is_participant(uuid) to authenticated;

create policy "interview rooms: participants receive"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.is_participant(private.room_interview())
);

create policy "interview rooms: participants send"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.is_participant(private.room_interview())
);

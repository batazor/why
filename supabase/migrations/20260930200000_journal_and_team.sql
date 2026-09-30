-- Журнал собеседования и приглашения в команду.
--
-- 1. interview_events — журнал прохождения: сигналы честности и снимки доски.
--    Только дописывается: пишет кандидат, пока собеседование открыто; читают
--    люди пространства; менять и удалять записи не может никто. Время записи
--    ставит сервер — поле created_at клиенту недоступно, — так что порядок и
--    время событий задним числом не подделать. Что делал браузер, по-прежнему
--    решает браузер, но стереть уже записанное он не может.
--
-- 2. workspace_invites — позвать коллегу в пространство ссылкой с ролью.
--    Как и приглашение кандидата: срабатывает один раз, можно ограничить почтой.
--    Раньше коллегу добавляли по почте, и только если он уже входил.
--
-- 3. В пространстве всегда остаётся владелец: последнего нельзя ни удалить,
--    ни понизить, иначе пространством некому управлять.

-- ─── Журнал ────────────────────────────────────────────────────────────────

create table public.interview_events (
  id bigint generated always as identity primary key,
  interview_id uuid not null references public.interviews (id) on delete cascade,
  kind text not null check (kind in ('signal', 'board')),
  /** signal — Signal из src/playground/model.ts, board — Board. */
  payload jsonb not null check (octet_length(payload::text) < 1000000),
  /** Время по часам кандидата — для справки; верить стоит created_at. */
  client_at timestamptz,
  created_at timestamptz not null default now()
);

create index interview_events_interview on public.interview_events (interview_id, id);

alter table public.interview_events enable row level security;
revoke all on public.interview_events from anon;

create policy "events: staff read"
on public.interview_events for select to authenticated
using (private.is_staff(interview_id));

create policy "events: candidate appends while open"
on public.interview_events for insert to authenticated
with check (
  private.is_candidate(interview_id)
  and exists (
    select 1 from public.interviews i
    where i.id = interview_id and i.status in ('scheduled', 'live')
  )
);

-- Дописать можно только содержимое: id и время сервера клиенту не достаются.
revoke insert, update, delete on public.interview_events from authenticated;
grant insert (interview_id, kind, payload, client_at) on public.interview_events to authenticated;

-- Новые записи доходят до интервьюера через Realtime; политика чтения та же.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.interview_events;
  end if;
end;
$$;

-- ─── Приглашения в команду ─────────────────────────────────────────────────

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role public.workspace_role not null,
  /** Задана — принять может только вход с этой почтой. */
  email text,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  accepted_by uuid references auth.users (id),
  accepted_at timestamptz
);

create index workspace_invites_workspace on public.workspace_invites (workspace_id);

alter table public.workspace_invites enable row level security;
revoke all on public.workspace_invites from anon;

create policy "team invites: owner reads"
on public.workspace_invites for select to authenticated
using (private.is_member(workspace_id, array['owner']::public.workspace_role[]));

create policy "team invites: owner creates"
on public.workspace_invites for insert to authenticated
with check (
  private.is_member(workspace_id, array['owner']::public.workspace_role[])
  and created_by = auth.uid()
  and accepted_by is null
);

create policy "team invites: owner revokes"
on public.workspace_invites for delete to authenticated
using (private.is_member(workspace_id, array['owner']::public.workspace_role[]));

-- Принимается только через accept_workspace_invite.
revoke update on public.workspace_invites from authenticated;
revoke insert on public.workspace_invites from authenticated;
grant insert (id, workspace_id, role, email) on public.workspace_invites to authenticated;

/**
 * Принять приглашение в команду. Уже состоящего в пространстве не понижает:
 * владелец, открывший ссылку «интервьюер», владельцем и остаётся.
 */
create or replace function public.accept_workspace_invite(token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.workspace_invites;
  me uuid := auth.uid();
  my_email text := auth.jwt() ->> 'email';
begin
  if me is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  select * into inv from public.workspace_invites w where w.token = accept_workspace_invite.token for update;
  if inv.id is null then
    raise exception 'invitation not found' using errcode = 'no_data_found';
  end if;
  if inv.accepted_by = me then
    return inv.workspace_id;
  end if;
  if inv.accepted_by is not null then
    raise exception 'invitation already accepted' using errcode = 'unique_violation';
  end if;
  if inv.email is not null and lower(inv.email) <> lower(coalesce(my_email, '')) then
    raise exception 'invitation is for another email' using errcode = 'insufficient_privilege';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, me, inv.role)
  on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invites set accepted_by = me, accepted_at = now() where id = inv.id;
  return inv.workspace_id;
end;
$$;

revoke execute on function public.accept_workspace_invite(text) from public, anon;
grant execute on function public.accept_workspace_invite(text) to authenticated;

-- ─── Владелец остаётся всегда ──────────────────────────────────────────────

create or replace function private.keep_an_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'owner' or (tg_op = 'UPDATE' and new.role = 'owner') then
    return coalesce(new, old);
  end if;
  -- Пространство или пользователь удаляются целиком — тогда и владелец уходит законно.
  if not exists (select 1 from public.workspaces w where w.id = old.workspace_id)
     or not exists (select 1 from auth.users u where u.id = old.user_id) then
    return coalesce(new, old);
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = old.workspace_id and m.role = 'owner' and m.user_id <> old.user_id
  ) then
    raise exception 'a workspace keeps at least one owner' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger keep_an_owner
before update of role or delete on public.workspace_members
for each row execute function private.keep_an_owner();

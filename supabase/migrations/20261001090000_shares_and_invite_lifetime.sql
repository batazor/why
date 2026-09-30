-- Ссылки и приглашения как записи в базе.
--
-- 1. shares — короткая ссылка `?share=<токен>` вместо проекта в адресе.
--    В ссылке больше нет самого сценария — только токен, поэтому её не режут
--    мессенджеры, а отозвать или ограничить сроком можно после отправки.
--    Открыть может кто угодно с токеном, даже без входа (тренировка); что
--    именно уезжает, решает автор при создании, как и раньше.
--
-- 2. Срок жизни приглашений: на собеседование — 14 дней, в команду — 7.
--    Просроченное не принимается; приглашение на собеседование можно
--    перевыпустить — старая ссылка сразу перестаёт работать.
--
-- 3. invite_preview — что за приглашение, до входа: кто зовёт, куда, до
--    какого числа и не принято ли уже. Человек узнаёт, что ссылка мёртвая,
--    до того как войдёт, а не после.

-- ─── Ссылки ─────────────────────────────────────────────────────────────────

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  scenario_id uuid references public.scenarios (id) on delete cascade,
  /** В какой роли откроется: candidate, trainee, interviewer, author. */
  role text not null check (role in ('candidate', 'trainee', 'interviewer', 'author')),
  title text not null default '',
  /** Проект, как его собрал share.ts: без того, чего этой роли видеть нельзя. */
  payload jsonb not null check (octet_length(payload::text) < 2000000),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  opens int not null default 0,
  last_opened_at timestamptz
);

create index shares_scenario on public.shares (scenario_id);

alter table public.shares enable row level security;
revoke all on public.shares from anon;

create policy "shares: members read"
on public.shares for select to authenticated
using (private.is_member(workspace_id));

create policy "shares: members create"
on public.shares for insert to authenticated
with check (private.is_member(workspace_id) and created_by = auth.uid());

-- Отозвать: тот, кто создал, или владелец.
create policy "shares: creator or owner revokes"
on public.shares for update to authenticated
using (created_by = auth.uid() or private.is_member(workspace_id, array['owner']::public.workspace_role[]))
with check (created_by = auth.uid() or private.is_member(workspace_id, array['owner']::public.workspace_role[]));

revoke insert, update, delete on public.shares from authenticated;
grant insert (id, workspace_id, scenario_id, role, title, payload, expires_at) on public.shares to authenticated;
grant update (revoked_at) on public.shares to authenticated;

/**
 * Открыть ссылку. Доступно и без входа: токен — 16 случайных байт, его не
 * перебрать. Мёртвая ссылка — исключение с причиной, чтобы человек знал,
 * просить новую или нет.
 */
create or replace function public.open_share(token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.shares;
begin
  select * into link from public.shares s where s.token = open_share.token;
  if link.id is null then
    raise exception 'link not found' using errcode = 'no_data_found';
  end if;
  if link.revoked_at is not null then
    raise exception 'link revoked' using errcode = 'check_violation';
  end if;
  if link.expires_at is not null and link.expires_at <= now() then
    raise exception 'link expired' using errcode = 'check_violation';
  end if;
  update public.shares set opens = opens + 1, last_opened_at = now() where id = link.id;
  return jsonb_build_object('role', link.role, 'title', link.title, 'design', link.payload);
end;
$$;

revoke execute on function public.open_share(text) from public;
grant execute on function public.open_share(text) to anon, authenticated;

-- ─── Срок жизни приглашений ─────────────────────────────────────────────────

alter table public.interviews
  add column invite_expires_at timestamptz default now() + interval '14 days';

alter table public.workspace_invites
  add column expires_at timestamptz default now() + interval '7 days';
-- Срок владелец может выбрать сам при создании.
grant insert (expires_at) on public.workspace_invites to authenticated;

-- Перевыпущенное приглашение не должно пережить законченное собеседование.
create or replace function private.freeze_closed_interview()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('finished', 'cancelled')
     and (new.status, new.started_at, new.finished_at, new.calc_unlocked_at,
          new.scheduled_at, new.candidate_email, new.candidate_id,
          new.invite_token, new.invite_expires_at)
         is distinct from
         (old.status, old.started_at, old.finished_at, old.calc_unlocked_at,
          old.scheduled_at, old.candidate_email, old.candidate_id,
          old.invite_token, old.invite_expires_at)
  then
    raise exception 'interview is % and cannot change', old.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

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
  if inv.invite_expires_at is not null and inv.invite_expires_at <= now() then
    raise exception 'invitation expired' using errcode = 'check_violation';
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
  if inv.expires_at is not null and inv.expires_at <= now() then
    raise exception 'invitation expired' using errcode = 'check_violation';
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

/**
 * Новая ссылка на то же собеседование: старый токен перестаёт работать, срок
 * начинается заново. Только пока кандидат не принял приглашение.
 */
create or replace function public.renew_interview_invite(interview uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.interviews;
  fresh text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select * into inv from public.interviews i where i.id = renew_interview_invite.interview for update;
  if inv.id is null
     or not (inv.interviewer_id = auth.uid()
             or private.is_member(inv.workspace_id, array['owner']::public.workspace_role[])) then
    raise exception 'interview not found' using errcode = 'no_data_found';
  end if;
  if inv.candidate_id is not null then
    raise exception 'invitation already accepted' using errcode = 'unique_violation';
  end if;
  if inv.status in ('finished', 'cancelled') then
    raise exception 'interview is over' using errcode = 'check_violation';
  end if;
  update public.interviews
  set invite_token = fresh, invite_expires_at = now() + interval '14 days'
  where id = inv.id;
  return fresh;
end;
$$;

revoke execute on function public.renew_interview_invite(uuid) from public, anon;
grant execute on function public.renew_interview_invite(uuid) to authenticated;

-- ─── Что за приглашение — до входа ─────────────────────────────────────────

/**
 * Предпросмотр приглашения по токену: кто зовёт, куда, до какого числа и
 * живо ли оно. Почту, если приглашение на неё, не раскрывает — только
 * маску, чтобы человек понял, каким аккаунтом входить.
 */
create or replace function public.invite_preview(kind text, token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if kind = 'interview' then
    select jsonb_build_object(
      'kind', 'interview',
      'workspace', w.name,
      'title', s.title,
      'inviter', coalesce(nullif(p.name, ''), '—'),
      'expires_at', i.invite_expires_at,
      'state', case
        when i.status in ('finished', 'cancelled') then 'over'
        when i.candidate_id is not null then 'taken'
        when i.invite_expires_at is not null and i.invite_expires_at <= now() then 'expired'
        else 'open'
      end,
      'email', private.mask_email(i.candidate_email)
    ) into result
    from public.interviews i
    join public.workspaces w on w.id = i.workspace_id
    join public.scenarios s on s.id = i.scenario_id
    left join public.profiles p on p.id = i.interviewer_id
    where i.invite_token = invite_preview.token;
  elsif kind = 'team' then
    select jsonb_build_object(
      'kind', 'team',
      'workspace', w.name,
      'role', v.role,
      'inviter', coalesce(nullif(p.name, ''), '—'),
      'expires_at', v.expires_at,
      'state', case
        when v.accepted_by is not null then 'taken'
        when v.expires_at is not null and v.expires_at <= now() then 'expired'
        else 'open'
      end,
      'email', private.mask_email(v.email)
    ) into result
    from public.workspace_invites v
    join public.workspaces w on w.id = v.workspace_id
    left join public.profiles p on p.id = v.created_by
    where v.token = invite_preview.token;
  end if;
  return result;
end;
$$;

/** d***@mail.test: достаточно, чтобы узнать свою почту, мало, чтобы её прочесть. */
create or replace function private.mask_email(email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when email is null or position('@' in email) = 0 then null
    else left(email, 1) || '***' || substr(email, position('@' in email))
  end;
$$;

revoke execute on function public.invite_preview(text, text) from public;
grant execute on function public.invite_preview(text, text) to anon, authenticated;

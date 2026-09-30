-- Снимок сценария на собеседование и назначение времени.
--
-- 1. Собеседование больше не ссылается на живой сценарий. При создании
--    берётся снимок: открытая часть (задание, настройки) — в interviews.brief,
--    её видит и кандидат; закрытая (эталон, подсказки, критерии, вопросы) — в
--    interview_scenarios, только для людей пространства. Правка сценария
--    потом не трогает уже назначенные и прошедшие собеседования: отчёт и
--    оценки остаются про те критерии, по которым оценивали.
--    Пока собеседование не началось, снимок можно обновить явно —
--    refresh_interview_snapshot; после старта он заморожен.
--
-- 2. Назначение: у собеседования есть время начала (scheduled_at уже был) и
--    длительность. Приглашение не истекает раньше, чем через сутки после
--    назначенного времени, — иначе приглашение на собеседование через три
--    недели умерло бы до него.

-- ─── Снимок ────────────────────────────────────────────────────────────────

alter table public.interviews add column brief jsonb;

create table public.interview_scenarios (
  interview_id uuid primary key references public.interviews (id) on delete cascade,
  /** Scenario без allowChecks — как scenario_private.content на момент снимка. */
  content jsonb not null default '{}',
  taken_at timestamptz not null default now()
);

alter table public.interview_scenarios enable row level security;
revoke all on public.interview_scenarios from anon;
revoke insert, update, delete on public.interview_scenarios from authenticated;

create policy "interview scenarios: staff read"
on public.interview_scenarios for select to authenticated
using (private.is_staff(interview_id));

/** Открытая часть сценария — то, что кандидат видит карточкой задания. */
create or replace function private.scenario_brief(scenario uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', s.title,
    'task', s.task,
    'task_source', s.task_source,
    'calc', s.calc,
    'allow_checks', s.allow_checks,
    'format_version', s.format_version,
    'updated_at', s.updated_at
  )
  from public.scenarios s
  where s.id = scenario;
$$;

create or replace function private.take_snapshot(interview uuid, scenario uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.interview_scenarios (interview_id, content, taken_at)
  select interview, coalesce((select p.content from public.scenario_private p where p.scenario_id = scenario), '{}'), now()
  on conflict (interview_id) do update set content = excluded.content, taken_at = excluded.taken_at;
$$;

create or replace function private.brief_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.brief := private.scenario_brief(new.scenario_id);
  return new;
end;
$$;

create or replace function private.snapshot_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.take_snapshot(new.id, new.scenario_id);
  return new;
end;
$$;

create trigger brief_on_insert
before insert on public.interviews
for each row execute function private.brief_on_insert();

create trigger snapshot_on_insert
after insert on public.interviews
for each row execute function private.snapshot_on_insert();

/** Обновить снимок из текущего сценария — только пока собеседование не началось. */
create or replace function public.refresh_interview_snapshot(interview uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.interviews;
begin
  select * into inv from public.interviews i where i.id = refresh_interview_snapshot.interview for update;
  if inv.id is null or not private.is_member(inv.workspace_id) then
    raise exception 'interview not found' using errcode = 'no_data_found';
  end if;
  if inv.status <> 'scheduled' or inv.started_at is not null then
    raise exception 'interview already started' using errcode = 'check_violation';
  end if;
  update public.interviews set brief = private.scenario_brief(inv.scenario_id) where id = inv.id;
  perform private.take_snapshot(inv.id, inv.scenario_id);
end;
$$;

revoke execute on function public.refresh_interview_snapshot(uuid) from public, anon;
grant execute on function public.refresh_interview_snapshot(uuid) to authenticated;

-- Уже созданные собеседования получают снимок сценария в нынешнем виде:
-- другого у них нет.
update public.interviews set brief = private.scenario_brief(scenario_id) where brief is null;
insert into public.interview_scenarios (interview_id, content)
select i.id, coalesce(p.content, '{}')
from public.interviews i
left join public.scenario_private p on p.scenario_id = i.scenario_id
on conflict (interview_id) do nothing;

-- ─── Назначение ────────────────────────────────────────────────────────────

alter table public.interviews
  add column duration_minutes int not null default 60 check (duration_minutes between 5 and 480);

grant update (duration_minutes) on public.interviews to authenticated;

/** Приглашение живёт хотя бы до конца дня после назначенного времени. */
create or replace function private.invite_outlives_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.scheduled_at is not null and new.candidate_id is null
     and (new.invite_expires_at is null or new.invite_expires_at < new.scheduled_at + interval '1 day') then
    new.invite_expires_at := new.scheduled_at + interval '1 day';
  end if;
  return new;
end;
$$;

create trigger invite_outlives_schedule
before insert or update of scheduled_at on public.interviews
for each row execute function private.invite_outlives_schedule();

-- Законченное собеседование не переназначить, длительность тоже заморожена.
create or replace function private.freeze_closed_interview()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('finished', 'cancelled')
     and (new.status, new.started_at, new.finished_at, new.calc_unlocked_at,
          new.scheduled_at, new.duration_minutes, new.candidate_email, new.candidate_id,
          new.invite_token, new.invite_expires_at, new.brief)
         is distinct from
         (old.status, old.started_at, old.finished_at, old.calc_unlocked_at,
          old.scheduled_at, old.duration_minutes, old.candidate_email, old.candidate_id,
          old.invite_token, old.invite_expires_at, old.brief)
  then
    raise exception 'interview is % and cannot change', old.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Перевыпуск тоже не укорачивает приглашение до назначенного времени.
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
  set invite_token = fresh,
      invite_expires_at = greatest(now() + interval '14 days', coalesce(inv.scheduled_at + interval '1 day', now()))
  where id = inv.id;
  return fresh;
end;
$$;

-- Предпросмотр приглашения теперь говорит и когда собеседование.
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
      'title', coalesce(i.brief ->> 'title', s.title),
      'inviter', coalesce(nullif(p.name, ''), '—'),
      'expires_at', i.invite_expires_at,
      'scheduled_at', i.scheduled_at,
      'duration', i.duration_minutes,
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

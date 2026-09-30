-- Задание кандидату — только после «Старта».
--
-- Раньше текст задания лежал в interviews.brief, и кандидат мог прочитать
-- его сразу после приглашения — хоть за день до собеседования, прямо через
-- API, как бы ни прятал его интерфейс. Скрыть на клиенте нельзя: скрывать
-- надо в базе.
--
-- Теперь текст задания — отдельной строкой в interview_tasks. Люди
-- пространства видят его всегда, кандидат — только когда у собеседования
-- есть started_at. В brief остаётся то, что знать заранее не вредно:
-- название, кто ставит задачу, настройки оценок.
--
-- Заодно закрыта вторая дорога к заданию: кандидат больше не читает живой
-- сценарий (scenarios) — собеседование давно живёт по снимку.

create table public.interview_tasks (
  interview_id uuid primary key references public.interviews (id) on delete cascade,
  task text not null default ''
);

alter table public.interview_tasks enable row level security;
revoke all on public.interview_tasks from anon;
revoke insert, update, delete on public.interview_tasks from authenticated;

create policy "tasks: staff always, candidate after the start"
on public.interview_tasks for select to authenticated
using (
  private.is_staff(interview_id)
  or (
    private.is_candidate(interview_id)
    and exists (select 1 from public.interviews i where i.id = interview_id and i.started_at is not null)
  )
);

-- Открытая часть снимка — без текста задания.
create or replace function private.scenario_brief(scenario uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', s.title,
    'task_source', s.task_source,
    'calc', s.calc,
    'allow_checks', s.allow_checks,
    'format_version', s.format_version,
    'updated_at', s.updated_at
  )
  from public.scenarios s
  where s.id = scenario;
$$;

-- Снимок закрытой части — теперь и с текстом задания.
create or replace function private.take_snapshot(interview uuid, scenario uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.interview_scenarios (interview_id, content, taken_at)
  select interview, coalesce((select p.content from public.scenario_private p where p.scenario_id = scenario), '{}'), now()
  on conflict (interview_id) do update set content = excluded.content, taken_at = excluded.taken_at;

  insert into public.interview_tasks (interview_id, task)
  select interview, coalesce((select s.task from public.scenarios s where s.id = scenario), '')
  on conflict (interview_id) do update set task = excluded.task;
$$;

-- Текст задания из уже выданных brief переезжает в interview_tasks.
insert into public.interview_tasks (interview_id, task)
select i.id, coalesce(i.brief ->> 'task', s.task, '')
from public.interviews i
left join public.scenarios s on s.id = i.scenario_id
on conflict (interview_id) do nothing;

-- Убрать задание из brief — в том числе у законченных, заморозка brief тут
-- мешала бы, поэтому она ненадолго отключается.
alter table public.interviews disable trigger freeze_closed_interview;
update public.interviews set brief = brief - 'task' where brief ? 'task';
alter table public.interviews enable trigger freeze_closed_interview;

-- Кандидат больше не читает живой сценарий.
drop policy "scenarios: members and own candidate read" on public.scenarios;

create policy "scenarios: members read"
on public.scenarios for select to authenticated
using (private.is_member(workspace_id));

-- Предпросмотр приглашения берёт название из brief, а при его отсутствии —
-- из сценария; сценарий кандидату теперь закрыт, но предпросмотр работает с
-- правами владельца функции, так что ему это не мешает.

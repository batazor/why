-- Собеседование не с чистого листа: исходная система сценария.
--
-- Автор рисует в сценарии третью доску — исходную систему (content.start в
-- scenario_private). Кандидат получает её вместе с заданием: только после
-- «Старта», по той же причине, что и текст задания, — по готовой системе
-- задачу легко угадать заранее.
--
-- Снимок кладёт исходную систему рядом с текстом задания (interview_tasks.start):
-- у этой строки уже есть нужная политика — люди пространства всегда,
-- кандидат после старта. Блоки и связи помечаются given: интервьюер и отчёт
-- отличают данное от нарисованного.
--
-- В доску кандидата система доливается дважды, и оба раза слиянием по id,
-- без дублей и без потери того, что кандидат успел нарисовать до старта:
--   * сервером — в момент старта, и при создании доски, если старт уже был
--     (кандидат принял приглашение позже);
--   * клиентом кандидата, когда тот узнал о старте: его автосохранение могло
--     успеть записать доску без системы поверх серверной.

alter table public.interview_tasks add column start jsonb;

-- Список с элементами из extra, которых нет в own по id, — в начале.
create or replace function private.merge_list(own jsonb, extra jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_agg(e order by n)
      from jsonb_array_elements(coalesce(extra, '[]'::jsonb)) with ordinality as x (e, n)
      where not exists (
        select 1 from jsonb_array_elements(coalesce(own, '[]'::jsonb)) o where o ->> 'id' = e ->> 'id'
      )
    ),
    '[]'::jsonb
  ) || coalesce(own, '[]'::jsonb);
$$;

-- То же, что mergeBoards в src/playground/model.ts.
create or replace function private.merge_board(own jsonb, extra jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when extra is null then own
    else own || jsonb_build_object(
      'nodes', private.merge_list(own -> 'nodes', extra -> 'nodes'),
      'edges', private.merge_list(own -> 'edges', extra -> 'edges'),
      'requirements', private.merge_list(own -> 'requirements', extra -> 'requirements'),
      'api', private.merge_list(own -> 'api', extra -> 'api'),
      'estimate',
        case
          when coalesce(btrim(own ->> 'estimate'), '') = '' then coalesce(extra -> 'estimate', '""'::jsonb)
          else own -> 'estimate'
        end
    )
  end;
$$;

-- Блоки и связи исходной системы с пометкой given — как startBoard на клиенте.
create or replace function private.given_board(board jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when board is null
      or (jsonb_array_length(coalesce(board -> 'nodes', '[]')) = 0
          and jsonb_array_length(coalesce(board -> 'edges', '[]')) = 0
          and jsonb_array_length(coalesce(board -> 'requirements', '[]')) = 0
          and jsonb_array_length(coalesce(board -> 'api', '[]')) = 0
          and coalesce(btrim(board ->> 'estimate'), '') = '')
      then null
    else board || jsonb_build_object(
      'nodes', coalesce(
        (select jsonb_agg(e || '{"given": true}'::jsonb order by n)
         from jsonb_array_elements(coalesce(board -> 'nodes', '[]')) with ordinality as x (e, n)),
        '[]'::jsonb),
      'edges', coalesce(
        (select jsonb_agg(e || '{"given": true}'::jsonb order by n)
         from jsonb_array_elements(coalesce(board -> 'edges', '[]')) with ordinality as x (e, n)),
        '[]'::jsonb)
    )
  end;
$$;

-- Снимок: закрытая часть, задание и теперь исходная система.
create or replace function private.take_snapshot(interview uuid, scenario uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.interview_scenarios (interview_id, content, taken_at)
  select interview, coalesce((select p.content from public.scenario_private p where p.scenario_id = scenario), '{}'), now()
  on conflict (interview_id) do update set content = excluded.content, taken_at = excluded.taken_at;

  insert into public.interview_tasks (interview_id, task, start)
  select
    interview,
    coalesce((select s.task from public.scenarios s where s.id = scenario), ''),
    private.given_board((select p.content -> 'start' from public.scenario_private p where p.scenario_id = scenario))
  on conflict (interview_id) do update set task = excluded.task, start = excluded.start;
$$;

-- Старт: исходная система ложится на доску кандидата.
create or replace function private.seed_start_board()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.interview_boards b
  set board = private.merge_board(b.board, t.start)
  from public.interview_tasks t
  where b.interview_id = new.id and t.interview_id = new.id and t.start is not null;
  return null;
end;
$$;

create trigger seed_start_board
after update of started_at on public.interviews
for each row
when (old.started_at is null and new.started_at is not null)
execute function private.seed_start_board();

-- Доска появилась уже после старта (кандидат принял приглашение позже) — сразу с системой.
create or replace function private.seed_board_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.interviews i where i.id = new.interview_id and i.started_at is not null) then
    new.board := coalesce(
      (select private.merge_board(new.board, t.start)
       from public.interview_tasks t
       where t.interview_id = new.interview_id and t.start is not null),
      new.board
    );
  end if;
  return new;
end;
$$;

create trigger seed_board_on_insert
before insert on public.interview_boards
for each row execute function private.seed_board_on_insert();

-- Ещё не начавшиеся собеседования получают исходную систему из сценария.
update public.interview_tasks t
set start = private.given_board(p.content -> 'start')
from public.interviews i
join public.scenario_private p on p.scenario_id = i.scenario_id
where t.interview_id = i.id and i.started_at is null and p.content ? 'start';

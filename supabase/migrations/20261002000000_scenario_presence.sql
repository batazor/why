-- Присутствие над сценарием пространства: приватный канал Realtime
-- `scenario:<scenario id>`.
--
-- Коллеги, открывшие один сценарий, видят курсоры друг друга с именами и
-- аватары в строке инструментов — как в комнате собеседования, только без
-- доски и хода: сценарий каждый сохраняет сам. По каналу ходят только
-- presence и broadcast, в базу ничего не пишется. Пускают людей
-- пространства, которому сценарий принадлежит.

/** id сценария из имени канала `scenario:<uuid>`; не uuid — null, а не ошибка приведения. */
create or replace function private.channel_scenario()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when realtime.topic() ~ '^scenario:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(realtime.topic(), 10)::uuid
  end;
$$;

/**
 * В пространстве ли я, которому принадлежит сценарий. Definer: сценарии под
 * RLS, а проверке нужно видеть строку независимо от политик чтения.
 */
create or replace function private.is_scenario_member(scenario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.scenarios s
    where s.id = scenario
      and private.is_member(s.workspace_id)
  );
$$;

grant execute on function private.channel_scenario() to authenticated;
grant execute on function private.is_scenario_member(uuid) to authenticated;

create policy "scenario presence: members receive"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.is_scenario_member(private.channel_scenario())
);

create policy "scenario presence: members send"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.is_scenario_member(private.channel_scenario())
);

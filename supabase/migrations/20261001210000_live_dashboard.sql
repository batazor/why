-- Живой кабинет: изменения собеседований и оценок доходят до кабинета
-- интервьюера через Realtime, без перезагрузки страницы.
--
-- Кабинет слушает приватный канал `cabinet:<workspace id>` и подписывается в
-- нём на postgres_changes по interviews и interview_reviews. В канал пускают
-- только людей пространства; какие строки доходят, решают те же политики
-- RLS, что и при чтении: Realtime проверяет их для каждого подписчика.

/** id пространства из имени канала `cabinet:<uuid>`; не uuid — null, а не ошибка приведения. */
create or replace function private.cabinet_workspace()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when realtime.topic() ~ '^cabinet:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(realtime.topic(), 9)::uuid
  end;
$$;

grant execute on function private.cabinet_workspace() to authenticated;
grant execute on function private.is_member(uuid, public.workspace_role[]) to authenticated;

-- В канале ничего не шлют — только слушают, поэтому политики на вставку нет.
create policy "cabinet: members receive"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.is_member(private.cabinet_workspace())
);

-- Строки с секретом приглашения и так читают только люди пространства;
-- Realtime отдаёт подписчику лишь то, что тот прочитал бы сам.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.interviews, public.interview_reviews;
  end if;
end;
$$;

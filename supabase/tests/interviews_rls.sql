-- Проверка прав собеседования: кто что видит и что может.
--
-- Запуск против локальной базы Supabase (supabase start):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/interviews_rls.sql
--
-- Всё идёт в одной транзакции и откатывается в конце: база остаётся как была.
-- Любое нарушение — исключение с объяснением, и psql останавливается.
--
-- Действующие лица:
--   alice — владелец пространства;
--   bob   — интервьюер в нём;
--   dana  — кандидат, приглашена по почте;
--   eve   — посторонняя, вошла через Google, но никуда не звана.

\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'alice@corp.test', '{"full_name": "Alice"}'),
  ('00000000-0000-4000-8000-00000000000b', 'bob@corp.test', '{"full_name": "Bob"}'),
  ('00000000-0000-4000-8000-00000000000d', 'Dana@Mail.test', '{"full_name": "Dana"}'),
  ('00000000-0000-4000-8000-00000000000e', 'eve@mail.test', '{"full_name": "Eve"}');

do $$ begin
  assert (select count(*) from public.profiles) >= 4, 'trigger fills profiles from auth.users';
  assert (select name from public.profiles where id = '00000000-0000-4000-8000-00000000000d') = 'Dana', 'profile name from Google';
end $$;

-- ─── alice: пространство, bob в нём, сценарий с эталоном ────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000a", "email": "alice@corp.test", "role": "authenticated"}', false);
set role authenticated;

select set_config('test.ws', public.create_workspace('Acme')::text, false);
select public.add_workspace_member(current_setting('test.ws')::uuid, 'BOB@corp.test', 'interviewer');

do $$
declare
  sc uuid;
begin
  insert into public.scenarios (workspace_id, title, task)
  values (current_setting('test.ws')::uuid, 'URL shortener', 'Design a URL shortener')
  returning id into sc;
  insert into public.scenario_private (scenario_id, content)
  values (sc, '{"reference": {"nodes": [{"id": "secret"}]}, "rubric": [{"id": "r1", "text": "Scale", "weight": 1}]}');
  perform set_config('test.scenario', sc::text, false);
end $$;

-- ─── bob: собеседование для dana; сценарии ему не писать ───────────────────
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000b", "email": "bob@corp.test", "role": "authenticated"}', false);
set role authenticated;

do $$
declare
  iv uuid;
  tok text;
begin
  assert (select count(*) from public.scenario_private) = 1, 'interviewer reads the reference';

  begin
    insert into public.scenarios (workspace_id, title) values (current_setting('test.ws')::uuid, 'Mine');
    raise exception 'FAIL: interviewer created a scenario';
  exception when insufficient_privilege then null;
  end;

  insert into public.interviews (workspace_id, scenario_id, candidate_email)
  values (current_setting('test.ws')::uuid, current_setting('test.scenario')::uuid, 'dana@mail.test')
  returning id, invite_token into iv, tok;
  perform set_config('test.interview', iv::text, false);
  perform set_config('test.token', tok, false);

  begin
    insert into public.interviews (workspace_id, scenario_id, candidate_id)
    values (current_setting('test.ws')::uuid, current_setting('test.scenario')::uuid, '00000000-0000-4000-8000-00000000000e');
    raise exception 'FAIL: interviewer assigned a candidate directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ─── eve: ничего не видит и чужое приглашение не принимает ─────────────────
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000e", "email": "eve@mail.test", "role": "authenticated"}', false);
set role authenticated;

do $$ begin
  assert (select count(*) from public.workspaces) = 0, 'stranger sees no workspaces';
  assert (select count(*) from public.scenarios) = 0, 'stranger sees no scenarios';
  assert (select count(*) from public.interviews) = 0, 'stranger sees no interviews';
  begin
    perform public.claim_interview(current_setting('test.token'));
    raise exception 'FAIL: stranger claimed an invitation addressed to dana';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ─── dana: принимает приглашение, видит задание, но не эталон ──────────────
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000d", "email": "dana@mail.test", "role": "authenticated"}', false);
set role authenticated;

do $$ begin
  assert (select count(*) from public.interviews) = 0, 'candidate sees nothing before accepting';
  assert public.claim_interview(current_setting('test.token')) = current_setting('test.interview')::uuid, 'claim returns the interview';
  assert public.claim_interview(current_setting('test.token')) = current_setting('test.interview')::uuid, 'claim is idempotent';

  assert (select count(*) from public.interviews) = 1, 'candidate sees her interview';
  assert (select task from public.scenarios) = 'Design a URL shortener', 'candidate reads the task';
  assert (select count(*) from public.scenario_private) = 0, 'candidate never reads the reference';
  assert (select count(*) from public.interview_reviews) = 0, 'candidate never reads the review';
  assert (select count(*) from public.workspaces) = 0, 'candidate is not in the workspace';
  assert (select count(*) from public.workspace_members) = 0, 'candidate does not see the staff list';
  assert (select count(*) from public.profiles) = 2, 'candidate sees herself and her interviewer';

  update public.interview_boards set board = '{"nodes": [{"id": "n1"}], "edges": [], "requirements": [], "api": [], "estimate": ""}';
  assert (select jsonb_array_length(board -> 'nodes') from public.interview_boards) = 1, 'candidate draws on her board';

  -- Политики на правку у кандидата нет: запрос проходит, но строк под ним ноль.
  update public.interviews set status = 'finished';
  assert (select status from public.interviews) = 'scheduled', 'candidate cannot change the interview';
  begin
    update public.interviews set candidate_id = null;
    raise exception 'FAIL: candidate released the interview';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ─── eve снова: принятое приглашение второй раз не принять ─────────────────
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000e", "email": "dana@mail.test", "role": "authenticated"}', false);
set role authenticated;

do $$ begin
  begin
    perform public.claim_interview(current_setting('test.token'));
    raise exception 'FAIL: invitation was claimed twice';
  exception when unique_violation then null;
  end;
end $$;

-- ─── Realtime: в комнату пускают только участников ─────────────────────────
reset role;
select set_config('realtime.topic', 'room:' || current_setting('test.interview'), false);

set role authenticated;  -- всё ещё eve
do $$ begin
  begin
    insert into realtime.messages (topic, extension, payload) values (realtime.topic(), 'broadcast', '{}');
    raise exception 'FAIL: stranger sent to the interview room';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from realtime.messages) = 0, 'stranger hears nothing in the room';
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000d", "email": "dana@mail.test", "role": "authenticated"}', false);
set role authenticated;
insert into realtime.messages (topic, extension, payload) values (realtime.topic(), 'broadcast', '{"event": "cursor"}');
do $$ begin
  assert (select count(*) from realtime.messages) = 1, 'candidate hears the room';
end $$;

reset role;
select set_config('realtime.topic', 'room:not-a-uuid', false);
set role authenticated;
do $$ begin
  begin
    insert into realtime.messages (topic, extension, payload) values (realtime.topic(), 'broadcast', '{}');
    raise exception 'FAIL: malformed room name let a message through';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ─── bob: видит доску, но не рисует; пишет отзыв; заканчивает ──────────────
reset role;
select set_config('realtime.topic', 'room:' || current_setting('test.interview'), false);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000b", "email": "bob@corp.test", "role": "authenticated"}', false);
set role authenticated;

do $$ begin
  assert (select count(*) from realtime.messages) = 1, 'interviewer hears the room';
  assert (select jsonb_array_length(board -> 'nodes') from public.interview_boards) = 1, 'interviewer sees the candidate board';

  update public.interview_boards set board = '{"nodes": [], "edges": [], "requirements": [], "api": [], "estimate": ""}';
  assert (select jsonb_array_length(board -> 'nodes') from public.interview_boards) = 1, 'interviewer cannot redraw the board';

  insert into public.interview_reviews (interview_id, session)
  values (current_setting('test.interview')::uuid, '{"revealed": [], "asked": [], "scores": {"r1": 3}, "notes": "strong"}');
  assert (select count(*) from public.profiles) = 3, 'interviewer sees colleagues and the candidate';

  update public.interviews set status = 'finished', finished_at = now();
end $$;

-- ─── dana: после конца собеседования доска заморожена ──────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000d", "email": "dana@mail.test", "role": "authenticated"}', false);
set role authenticated;

do $$ begin
  begin
    update public.interview_boards set board = '{"nodes": [], "edges": [], "requirements": [], "api": [], "estimate": ""}';
    raise exception 'FAIL: candidate edited the board after the interview ended';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.interview_reviews) = 0, 'candidate still cannot read the review';
end $$;

-- ─── anon: никуда ──────────────────────────────────────────────────────────
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from public.interviews;
    raise exception 'FAIL: anonymous read interviews';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_interview('whatever');
    raise exception 'FAIL: anonymous called claim_interview';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
\echo 'interviews_rls: all checks passed'
rollback;

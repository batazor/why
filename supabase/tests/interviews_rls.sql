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

-- ─── Предпросмотр приглашения — до входа ────────────────────────────────────
reset role;
set role anon;
do $$
declare
  preview jsonb;
begin
  preview := public.invite_preview('interview', current_setting('test.token'));
  assert preview ->> 'state' = 'open', 'a fresh invitation is open';
  assert preview ->> 'inviter' = 'Bob', 'the preview names who invites';
  assert preview ->> 'title' = 'URL shortener', 'and to which scenario';
  assert preview ->> 'email' = 'D***@Mail.test' or preview ->> 'email' = 'd***@mail.test', 'the email is masked';
  assert public.invite_preview('interview', 'nope') is null, 'an unknown token previews nothing';
end $$;

-- ─── Срок жизни и перевыпуск приглашения ──────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000b", "email": "bob@corp.test", "role": "authenticated"}', false);
set role authenticated;
do $$
declare
  iv uuid;
  tok text;
  fresh text;
begin
  insert into public.interviews (workspace_id, scenario_id, invite_expires_at)
  values (current_setting('test.ws')::uuid, current_setting('test.scenario')::uuid, now() - interval '1 day')
  returning invite_token into tok;
  perform set_config('test.expired', tok, false);

  insert into public.interviews (workspace_id, scenario_id)
  values (current_setting('test.ws')::uuid, current_setting('test.scenario')::uuid)
  returning id, invite_token into iv, tok;
  fresh := public.renew_interview_invite(iv);
  assert fresh <> tok, 'renewing issues a new token';
  perform set_config('test.stale', tok, false);
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000e", "email": "eve@mail.test", "role": "authenticated"}', false);
set role authenticated;
do $$ begin
  assert public.invite_preview('interview', current_setting('test.expired')) ->> 'state' = 'expired', 'the preview tells an expired invitation';
  begin
    perform public.claim_interview(current_setting('test.expired'));
    raise exception 'FAIL: an expired invitation was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.claim_interview(current_setting('test.stale'));
    raise exception 'FAIL: the token replaced by renewal still works';
  exception when no_data_found then null;
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

  insert into public.interview_events (interview_id, kind, payload, client_at) values
    (current_setting('test.interview')::uuid, 'signal', '{"id": "s1", "type": "away", "at": "2000-01-01T00:00:00Z"}', '2000-01-01T00:00:00Z'),
    (current_setting('test.interview')::uuid, 'board', '{"nodes": [{"id": "n1"}], "edges": []}', now());
  assert (select count(*) from public.interview_events) = 0, 'candidate does not read the journal back';
  begin
    insert into public.interview_events (interview_id, kind, payload, created_at)
    values (current_setting('test.interview')::uuid, 'signal', '{}', '2000-01-01T00:00:00Z');
    raise exception 'FAIL: candidate backdated a journal entry';
  exception when insufficient_privilege then null;
  end;

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
-- Проверяется условие политик, а не вставка в realtime.messages: у свежего
-- проекта у таблицы нет партиций, пока сервис Realtime ни разу не запускался.
reset role;
do $$ begin
  assert (
    select count(*) from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and policyname like 'interview rooms: participants %'
  ) = 2, 'room policies are attached to realtime.messages';
  assert not exists (
    select 1 from pg_policies where schemaname = 'realtime' and policyname like 'interview rooms: signed-in %'
  ), 'the open room policies of the first version are gone';
end $$;

select set_config('realtime.topic', 'room:' || current_setting('test.interview'), false);
set role authenticated;  -- всё ещё eve
do $$ begin
  assert not private.is_participant(private.room_interview()), 'stranger is kept out of the room';
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000d", "email": "dana@mail.test", "role": "authenticated"}', false);
set role authenticated;
do $$ begin
  assert private.is_participant(private.room_interview()), 'candidate enters the room';
end $$;

reset role;
select set_config('realtime.topic', 'room:not-a-uuid', false);
set role authenticated;
do $$ begin
  assert private.room_interview() is null, 'malformed room name maps to no interview';
  assert not coalesce(private.is_participant(private.room_interview()), false), 'malformed room name lets nobody in';
end $$;

-- ─── bob: видит доску, но не рисует; пишет отзыв; заканчивает ──────────────
reset role;
select set_config('realtime.topic', 'room:' || current_setting('test.interview'), false);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000b", "email": "bob@corp.test", "role": "authenticated"}', false);
set role authenticated;

do $$ begin
  assert private.is_participant(private.room_interview()), 'interviewer enters the room';
  assert (select count(*) from public.interview_events) = 2, 'interviewer reads the journal';
  assert (select bool_and(created_at > '2020-01-01') from public.interview_events), 'journal time is the server time, not the client claim';
  begin
    update public.interview_events set payload = '{}';
    raise exception 'FAIL: the journal was edited';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.interview_events;
    raise exception 'FAIL: the journal was erased';
  exception when insufficient_privilege then null;
  end;
  assert (select jsonb_array_length(board -> 'nodes') from public.interview_boards) = 1, 'interviewer sees the candidate board';

  update public.interview_boards set board = '{"nodes": [], "edges": [], "requirements": [], "api": [], "estimate": ""}';
  assert (select jsonb_array_length(board -> 'nodes') from public.interview_boards) = 1, 'interviewer cannot redraw the board';

  insert into public.interview_reviews (interview_id, session)
  values (current_setting('test.interview')::uuid, '{"revealed": [], "asked": [], "scores": {"r1": 3}, "notes": "strong"}');
  assert (select count(*) from public.profiles) = 3, 'interviewer sees colleagues and the candidate';

  update public.interviews set status = 'finished', finished_at = now() where id = current_setting('test.interview')::uuid;
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
  begin
    insert into public.interview_events (interview_id, kind, payload)
    values (current_setting('test.interview')::uuid, 'signal', '{"id": "late"}');
    raise exception 'FAIL: the journal grew after the interview ended';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ─── bob: законченное собеседование не перезапустить ───────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000b", "email": "bob@corp.test", "role": "authenticated"}', false);
set role authenticated;

do $$ begin
  begin
    update public.interviews set status = 'live', finished_at = null where id = current_setting('test.interview')::uuid;
    raise exception 'FAIL: a finished interview was restarted';
  exception when check_violation then null;
  end;
  begin
    update public.interviews set calc_unlocked_at = now() where id = current_setting('test.interview')::uuid;
    raise exception 'FAIL: a finished interview changed its timing';
  exception when check_violation then null;
  end;
  assert (select status from public.interviews where id = current_setting('test.interview')::uuid) = 'finished', 'the interview stays finished';
end $$;

-- ─── Ссылки из базы: открыть без входа, отозвать, срок ─────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000a", "email": "alice@corp.test", "role": "authenticated"}', false);
set role authenticated;
do $$
declare
  tok text;
begin
  insert into public.shares (workspace_id, scenario_id, role, title, payload)
  values (current_setting('test.ws')::uuid, current_setting('test.scenario')::uuid, 'trainee', 'URL shortener', '{"id": "x"}')
  returning token into tok;
  perform set_config('test.share', tok, false);
  insert into public.shares (workspace_id, scenario_id, role, payload, expires_at)
  values (current_setting('test.ws')::uuid, current_setting('test.scenario')::uuid, 'trainee', '{}', now() - interval '1 hour')
  returning token into tok;
  perform set_config('test.deadshare', tok, false);
end $$;

reset role;
set role anon;
do $$ begin
  assert public.open_share(current_setting('test.share')) ->> 'role' = 'trainee', 'anyone with the link opens it, signed in or not';
  begin
    perform public.open_share(current_setting('test.deadshare'));
    raise exception 'FAIL: an expired link opened';
  exception when check_violation then null;
  end;
  begin
    perform count(*) from public.shares;
    raise exception 'FAIL: anonymous listed the links';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000d", "email": "dana@mail.test", "role": "authenticated"}', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.shares) = 0, 'an outsider does not see the links of a workspace';
  begin
    insert into public.shares (workspace_id, role, payload) values (current_setting('test.ws')::uuid, 'author', '{}');
    raise exception 'FAIL: an outsider created a link in someone else''s workspace';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000a", "email": "alice@corp.test", "role": "authenticated"}', false);
set role authenticated;
do $$ begin
  assert (select opens from public.shares where token = current_setting('test.share')) = 1, 'opens are counted';
  update public.shares set revoked_at = now() where token = current_setting('test.share');
  begin
    update public.shares set payload = '{}' where token = current_setting('test.share');
    raise exception 'FAIL: a sent link was rewritten';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set role anon;
do $$ begin
  begin
    perform public.open_share(current_setting('test.share'));
    raise exception 'FAIL: a revoked link opened';
  exception when check_violation then null;
  end;
end $$;

-- ─── Команда: приглашение ссылкой, владелец остаётся всегда ────────────────
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000a", "email": "alice@corp.test", "role": "authenticated"}', false);
set role authenticated;

do $$
declare
  tok text;
begin
  insert into public.workspace_invites (workspace_id, role)
  values (current_setting('test.ws')::uuid, 'author')
  returning token into tok;
  perform set_config('test.team', tok, false);
  insert into public.workspace_invites (workspace_id, role, expires_at)
  values (current_setting('test.ws')::uuid, 'owner', now() - interval '1 day')
  returning token into tok;
  perform set_config('test.oldteam', tok, false);

  begin
    update public.workspace_members set role = 'interviewer' where user_id = auth.uid();
    raise exception 'FAIL: the only owner demoted herself';
  exception when check_violation then null;
  end;
  begin
    delete from public.workspace_members where user_id = auth.uid();
    raise exception 'FAIL: the only owner left the workspace';
  exception when check_violation then null;
  end;
end $$;

-- bob — интервьюер: приглашать в команду не может.
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000b", "email": "bob@corp.test", "role": "authenticated"}', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.workspace_invites) = 0, 'a non-owner does not see team invitations';
  begin
    insert into public.workspace_invites (workspace_id, role) values (current_setting('test.ws')::uuid, 'owner');
    raise exception 'FAIL: an interviewer invited an owner';
  exception when insufficient_privilege then null;
  end;
end $$;

-- eve принимает приглашение и становится автором; второй раз ссылка не сработает.
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000e", "email": "eve@mail.test", "role": "authenticated"}', false);
set role authenticated;
do $$ begin
  assert public.invite_preview('team', current_setting('test.team')) ->> 'role' = 'author', 'the team preview names the role';
  begin
    perform public.accept_workspace_invite(current_setting('test.oldteam'));
    raise exception 'FAIL: an expired team invitation was accepted';
  exception when check_violation then null;
  end;
  assert public.accept_workspace_invite(current_setting('test.team')) = current_setting('test.ws')::uuid, 'eve joins the workspace';
  assert (select role from public.workspace_members where user_id = auth.uid()) = 'author', 'with the role from the invitation';
  assert (select count(*) from public.scenarios) = 1, 'and now sees the scenarios';
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000d", "email": "dana@mail.test", "role": "authenticated"}', false);
set role authenticated;
do $$ begin
  begin
    perform public.accept_workspace_invite(current_setting('test.team'));
    raise exception 'FAIL: a team invitation was accepted twice';
  exception when unique_violation then null;
  end;
end $$;

-- alice делает eve владельцем — теперь можно уйти; удаление пространства не упирается в правило.
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000a", "email": "alice@corp.test", "role": "authenticated"}', false);
set role authenticated;
do $$ begin
  update public.workspace_members set role = 'owner' where user_id = '00000000-0000-4000-8000-00000000000e';
  update public.workspace_members set role = 'author' where user_id = auth.uid();
  assert (select role from public.workspace_members where user_id = auth.uid()) = 'author', 'with a second owner the first can step down';
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000e", "email": "eve@mail.test", "role": "authenticated"}', false);
set role authenticated;
do $$ begin
  delete from public.workspaces where id = current_setting('test.ws')::uuid;
  assert (select count(*) from public.workspaces) = 0, 'the owner deletes the workspace with everything in it';
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

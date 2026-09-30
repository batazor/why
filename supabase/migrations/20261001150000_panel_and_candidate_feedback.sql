-- Несколько интервьюеров в одном собеседовании и отзыв кандидата.
--
-- 1. Оценка — у каждого своя. Раньше interview_reviews была одна строка на
--    собеседование, и двое интервьюеров, открывших его одновременно, молча
--    перетирали оценки друг друга. Теперь строка на пару собеседование +
--    интервьюер: каждый пишет только свою, видят все люди пространства.
--
-- 2. Ход собеседования — общий, и он в самом собеседовании: какие подсказки
--    открыты (с текстом — кандидат должен их увидеть, а сценарий ему
--    закрыт), какие вопросы заданы, что кандидат прикинул до калькулятора.
--    Раньше это лежало в отзыве интервьюера, и открытая подсказка до
--    кандидата не доходила вовсе.
--
-- 3. Вести собеседование может любой из пространства, а не только тот, кто
--    его назначил: панель, подмена, наблюдатель, который начал вместо
--    опоздавшего.
--
-- 4. Отзыв кандидата о собеседовании: оценка от 1 до 5 и комментарий,
--    один раз, после конца. Читают люди пространства.

-- ─── Ход собеседования — в собеседовании ───────────────────────────────────

alter table public.interviews
  add column revealed_hints jsonb not null default '[]'
    check (jsonb_typeof(revealed_hints) = 'array' and octet_length(revealed_hints::text) < 100000),
  add column asked jsonb not null default '[]'
    check (jsonb_typeof(asked) = 'array'),
  add column estimate_snapshot text;

grant update (revealed_hints, asked, estimate_snapshot) on public.interviews to authenticated;

-- ─── Оценка у каждого своя ─────────────────────────────────────────────────

alter table public.interview_reviews add column reviewer_id uuid references auth.users (id);

-- Старые отзывы — того, кто назначил собеседование, а общий ход переезжает в собеседование.
update public.interview_reviews r
set reviewer_id = i.interviewer_id
from public.interviews i
where i.id = r.interview_id and r.reviewer_id is null;

update public.interviews i
set revealed_hints = coalesce((
      select jsonb_agg(jsonb_build_object('id', h ->> 'id', 'text', h ->> 'text'))
      from public.interview_scenarios s, jsonb_array_elements(s.content -> 'hints') h
      where s.interview_id = i.id
        and (h ->> 'id') in (select jsonb_array_elements_text(r.session -> 'revealed'))
    ), '[]'),
    asked = coalesce(r.session -> 'asked', '[]'),
    estimate_snapshot = r.session ->> 'estimateSnapshot'
from public.interview_reviews r
where r.interview_id = i.id;

alter table public.interview_reviews alter column reviewer_id set not null;
alter table public.interview_reviews alter column reviewer_id set default auth.uid();
alter table public.interview_reviews drop constraint interview_reviews_pkey;
alter table public.interview_reviews add primary key (interview_id, reviewer_id);

drop policy "reviews: staff write" on public.interview_reviews;
drop policy "reviews: staff update" on public.interview_reviews;

create policy "reviews: staff write their own"
on public.interview_reviews for insert to authenticated
with check (reviewer_id = auth.uid() and private.is_staff(interview_id));

create policy "reviews: staff update their own"
on public.interview_reviews for update to authenticated
using (reviewer_id = auth.uid() and private.is_staff(interview_id))
with check (reviewer_id = auth.uid() and private.is_staff(interview_id));

revoke insert, update on public.interview_reviews from authenticated;
grant insert (interview_id, session) on public.interview_reviews to authenticated;
grant update (session) on public.interview_reviews to authenticated;

-- ─── Вести может любой из пространства ─────────────────────────────────────

drop policy "interviews: interviewer or owner updates" on public.interviews;

create policy "interviews: staff conduct"
on public.interviews for update to authenticated
using (private.is_member(workspace_id))
with check (private.is_member(workspace_id));

-- Законченное собеседование: заморожен и общий ход.
create or replace function private.freeze_closed_interview()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('finished', 'cancelled')
     and (new.status, new.started_at, new.finished_at, new.calc_unlocked_at,
          new.scheduled_at, new.duration_minutes, new.candidate_email, new.candidate_id,
          new.invite_token, new.invite_expires_at, new.brief,
          new.revealed_hints, new.asked, new.estimate_snapshot)
         is distinct from
         (old.status, old.started_at, old.finished_at, old.calc_unlocked_at,
          old.scheduled_at, old.duration_minutes, old.candidate_email, old.candidate_id,
          old.invite_token, old.invite_expires_at, old.brief,
          old.revealed_hints, old.asked, old.estimate_snapshot)
  then
    raise exception 'interview is % and cannot change', old.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ─── Отзыв кандидата ───────────────────────────────────────────────────────

create table public.interview_feedback (
  interview_id uuid primary key references public.interviews (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (length(comment) <= 2000),
  created_at timestamptz not null default now()
);

alter table public.interview_feedback enable row level security;
revoke all on public.interview_feedback from anon;

create policy "feedback: candidate and staff read"
on public.interview_feedback for select to authenticated
using (private.is_candidate(interview_id) or private.is_staff(interview_id));

-- Один раз и только после конца: отзыв о том, что уже было.
create policy "feedback: candidate leaves once after the end"
on public.interview_feedback for insert to authenticated
with check (
  private.is_candidate(interview_id)
  and exists (select 1 from public.interviews i where i.id = interview_id and i.status = 'finished')
);

revoke insert, update, delete on public.interview_feedback from authenticated;
grant insert (interview_id, rating, comment) on public.interview_feedback to authenticated;

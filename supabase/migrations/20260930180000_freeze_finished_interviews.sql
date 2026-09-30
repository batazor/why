-- Законченное собеседование не перезапускается.
--
-- Раньше «Стоп» можно было отменить «Стартом»: статус возвращался в live, и
-- кандидат снова рисовал на доске, которую интервьюер уже оценил. Оценка
-- должна относиться к той доске, что была на момент конца, поэтому
-- finished и cancelled — конечные состояния: ни статус, ни время, ни
-- приглашение у такого собеседования больше не меняются. Удалить его можно.

create or replace function private.freeze_closed_interview()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('finished', 'cancelled')
     and (new.status, new.started_at, new.finished_at, new.calc_unlocked_at,
          new.scheduled_at, new.candidate_email, new.candidate_id)
         is distinct from
         (old.status, old.started_at, old.finished_at, old.calc_unlocked_at,
          old.scheduled_at, old.candidate_email, old.candidate_id)
  then
    raise exception 'interview is % and cannot change', old.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger freeze_closed_interview
before update on public.interviews
for each row execute function private.freeze_closed_interview();

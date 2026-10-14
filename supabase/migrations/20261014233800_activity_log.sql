-- TSK-016: activity_log (append-only per-user activity, for day streaks).
--
-- STATUS: APPLIED to pjiuquekewnkctpkhiow on 2026-10-14 with Mike's approval.
-- reviewed and approved it. Apply via the normal migration process only, as
-- version 20261014233800 (must match this filename).
-- The app tolerates this table being absent: streaks show as unavailable and quiz
-- submission is unaffected, so the code can deploy before or after this migration.
--
-- Notes:
-- * Append-only: select + insert for the row's owner only. No update or delete
--   policies or grants, so history can't be rewritten from the client.
-- * ref is the permanent lesson id (same format check as lesson_completions).
-- * One index on (user_id, occurred_at): the only query is "my rows, by time".
-- * Identity column: inserts need no sequence privilege.
-- * Rows are written by the app's server action using the signed-in user's
--   session (RLS applies; no service role).
--
-- Backfill (runs once, inside this migration; idempotent via NOT EXISTS):
-- * Passed rows -> one 'lesson_passed' at coalesce(first_passed_at, completed_at),
--   the same date the achievements use (exact when first_passed_at is set,
--   otherwise an upper bound).
-- * Not-passed rows -> one 'quiz_attempt' at completed_at. That is a real attempt
--   time (the best attempt so far), so it is genuine activity.
-- * Passed rows get NO 'quiz_attempt': their completed_at is the best attempt,
--   usually the same event as the pass, and earlier attempts were never recorded.
--   Adding it would double-count one event and invent nothing useful.
-- So each lesson_completions row yields exactly one backfilled row.

create table public.activity_log (
  id          bigint      generated always as identity primary key,
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text        not null,
  ref         text        not null,
  occurred_at timestamptz not null default now(),
  constraint activity_log_kind_check check (kind in ('lesson_passed', 'quiz_attempt')),
  constraint activity_log_ref_format check (ref ~ '^les_[a-z0-9]{4,12}$')
);

comment on table public.activity_log is
  'Append-only user activity (lesson passes, quiz attempts) for day streaks. ref = permanent lesson id.';

create index activity_log_user_id_occurred_at_idx
  on public.activity_log (user_id, occurred_at);

alter table public.activity_log enable row level security;

-- Only signed-in users, only their own rows. Select + insert only; no anon.
revoke all on table public.activity_log from anon, authenticated;
grant select, insert on table public.activity_log to authenticated;

create policy "activity_log_select_own"
  on public.activity_log for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "activity_log_insert_own"
  on public.activity_log for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- Backfill from lesson_completions (see notes above).
insert into public.activity_log (user_id, kind, ref, occurred_at)
select c.user_id,
       case when c.passed then 'lesson_passed' else 'quiz_attempt' end,
       c.lesson_id,
       case when c.passed then coalesce(c.first_passed_at, c.completed_at) else c.completed_at end
from public.lesson_completions c
where not exists (
  select 1
  from public.activity_log a
  where a.user_id = c.user_id
    and a.ref = c.lesson_id
    and a.kind = case when c.passed then 'lesson_passed' else 'quiz_attempt' end
    and a.occurred_at = case when c.passed then coalesce(c.first_passed_at, c.completed_at) else c.completed_at end
);

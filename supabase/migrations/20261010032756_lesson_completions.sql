-- TSK-005: lesson completions (one row per user per lesson, best attempt).
--
-- STATUS: APPLIED to the dev Supabase project on 2026-10-09 with Mike's
-- approval. Apply to any other project only via the normal migration process
-- and with Mike's approval.
--
-- Notes:
-- * Primary key (user_id, lesson_id) replaces a separate unique constraint and
--   also serves as the index for per-user lookups (user_id is the leading column).
-- * score, total and passed are NOT NULL so the pass check can't pass vacuously.
-- * lesson_id is the permanent content id (e.g. les_rr01), never the URL slug.
-- * No delete policy and no anon access. Rows are written by the app's server
--   action using the signed-in user's session (RLS applies; no service role).

create table public.lesson_completions (
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id    text        not null,
  score        integer     not null,
  total        integer     not null,
  passed       boolean     not null,
  completed_at timestamptz not null default now(),
  constraint lesson_completions_pkey primary key (user_id, lesson_id),
  constraint lesson_completions_lesson_id_format check (lesson_id ~ '^les_[a-z0-9]{4,12}$'),
  constraint lesson_completions_total_positive check (total > 0),
  constraint lesson_completions_score_range check (score >= 0 and score <= total),
  constraint lesson_completions_passed_rule check (passed = (score * 10 >= total * 7))
);

comment on table public.lesson_completions is
  'Best quiz attempt per user and lesson. passed = score/total >= 70%. Keyed on permanent lesson ids.';

alter table public.lesson_completions enable row level security;

-- Only signed-in users, only their own rows. No delete, no read-all, no anon.
revoke all on table public.lesson_completions from anon, authenticated;
grant select, insert, update on table public.lesson_completions to authenticated;

create policy "lesson_completions_select_own"
  on public.lesson_completions for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "lesson_completions_insert_own"
  on public.lesson_completions for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "lesson_completions_update_own"
  on public.lesson_completions for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

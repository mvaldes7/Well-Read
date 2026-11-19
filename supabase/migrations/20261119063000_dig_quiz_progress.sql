-- Dig deeper quizzes, step 3 (docs/plans/dig-deeper-quizzes.md, section a): progress rules for generated-lesson quizzes
-- and streak credit (Mike chose option C2, "streaks only", on 2026-11-18). Mastery and achievements are not affected.
--
-- STATUS: UNAPPLIED. Do not run against any hosted Supabase project (production or Preview) until Mike has
-- separately approved applying it. Apply via the normal migration process only. Tested only against a throwaway
-- local Postgres (scripts/test-db-local.sh, tests/db/dig-quiz-progress.test.sql).
-- The app tolerates this migration being absent: saves retry without first_passed_at, and streak logging for
-- Dig deeper (step 4) treats a failed activity insert as non-fatal.
--
-- Changes (new file only; the applied 20261102231600_drilldowns.sql is not edited):
-- 1. generated_lesson_completions.first_passed_at (nullable), mirroring lesson_completions: set once, on the first
--    pass, never changed. No backfill: no app code has written this table before step 2.
-- 2. The insert policy now also requires the user's own lesson_completions row for the generated lesson's PARENT
--    lesson (any submitted attempt, pass or fail): the Dig deeper unlock rule, enforced in SQL as well as in the app.
--    Both subqueries run under the caller's RLS (visible generated lessons only, own completions only).
-- 3. Grants restated: revoke all from public, anon, authenticated, service_role; then select + insert, and update of
--    the score columns plus first_passed_at only, to authenticated. No delete, no anon, no service_role.
-- 4. activity_log.ref also accepts generated lesson ids (gen_ + 8-16 lowercase letters/digits), so Dig deeper
--    attempts and passes can count toward day streaks. kind values and the append-only rules are unchanged.
-- No new functions (grading uses the existing drilldown_quiz_key(), EXECUTE for drilldown_server only).

-- 1. first_passed_at
alter table public.generated_lesson_completions
  add column first_passed_at timestamptz;

alter table public.generated_lesson_completions
  add constraint generated_lesson_completions_first_passed_requires_pass
  check (passed or first_passed_at is null);

comment on column public.generated_lesson_completions.first_passed_at is
  'When the user first passed this Dig deeper quiz. Set once by the app and never changed; null if never passed.';

-- 2. insert only after the parent lesson's quiz was submitted
drop policy "generated_lesson_completions_insert_own_visible" on public.generated_lesson_completions;

create policy "generated_lesson_completions_insert_own_unlocked"
  on public.generated_lesson_completions for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.generated_lessons g
      join public.lesson_completions c
        on c.lesson_id = g.parent_lesson_id
       and c.user_id = (select auth.uid())
      where g.id = generated_lesson_completions.lesson_id
    )
  );

-- 3. grants (restated in full)
revoke all on table public.generated_lesson_completions from public, anon, authenticated, service_role;
grant select, insert on table public.generated_lesson_completions to authenticated;
grant update (score, total, passed, completed_at, first_passed_at) on table public.generated_lesson_completions to authenticated;

comment on table public.generated_lesson_completions is
  'Best quiz attempt per user and generated (Dig deeper) lesson, same rules as lesson_completions. Insert requires a '
  'parent-lesson completion. Counts toward day streaks via activity_log, not toward mastery or achievements.';

-- 4. streak activity may reference a generated lesson
alter table public.activity_log
  drop constraint activity_log_ref_format;

alter table public.activity_log
  add constraint activity_log_ref_format
  check (ref ~ '^les_[a-z0-9]{4,12}$' or ref ~ '^gen_[a-z0-9]{8,16}$');

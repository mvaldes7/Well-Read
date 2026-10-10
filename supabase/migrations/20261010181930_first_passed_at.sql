-- TSK-012: lesson_completions.first_passed_at (when the lesson was FIRST passed).
--
-- STATUS: Applied to dev 2026-10-10 as 20261010181930 with Mike's approval.
-- The app tolerates this column being absent (it falls back to the old select
-- and writes), so the code can deploy before or after this migration.
--
-- Notes:
-- * Nullable: null means "never passed" (or not recorded yet).
-- * Backfill: existing passed rows get first_passed_at = completed_at. For those
--   rows completed_at is the time of the BEST attempt, so the backfilled value is
--   an upper bound on the real first pass, not an exact time. Rows written after
--   this migration by the app are exact (set once, on the first passing attempt).
-- * Check constraint: a row that is not passed has no first_passed_at. Safe with
--   existing data because the backfill only touches passed rows, and the app never
--   downgrades a passed row (no-downgrade rule), so passed rows stay passed.
-- * No grant or RLS changes: 20261010040740_lesson_completions.sql grants
--   select, insert, update ON THE TABLE to authenticated (table-level privileges
--   cover every column, including new ones), and its RLS policies are row-level
--   (user_id = auth.uid()), so the new column inherits both.

alter table public.lesson_completions
  add column first_passed_at timestamptz;

update public.lesson_completions
  set first_passed_at = completed_at
  where passed and first_passed_at is null;

alter table public.lesson_completions
  add constraint lesson_completions_first_passed_requires_pass
  check (passed or first_passed_at is null);

comment on column public.lesson_completions.first_passed_at is
  'When the user first passed this lesson. Set once by the app and never changed; null if never passed. Backfilled rows use completed_at (an upper bound).';

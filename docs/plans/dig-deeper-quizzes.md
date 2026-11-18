# Plan: quizzes on Dig deeper lessons

Status: approved by Mike on Nov 18, 2026 ("Dig deeper quiz credit: streaks only"; "Start the quiz PRs (migration still needs my OK)"). Credit option **C2 (streaks only)** was chosen. The migration in step 3 still needs Mike's separate OK to apply.

## Current state (checked in code and schema)
- `/dig` (`src/app/dig/page.tsx`) renders the sections, key facts, sources, and Report button. It has **no quiz UI**.
- Generation stores 6 questions with 4 options each in `generated_lessons.lesson` (`splitLesson` in `service.mjs`). Answers and explanations go to `generated_quiz_keys` (6 each, CHECK constraints) through `drilldown_save_lesson()`.
- `generated_quiz_keys` is written but **never read**. `drilldown_quiz_key(user, lesson)` exists, with EXECUTE granted to `drilldown_server` only, but `server-db.mjs` has no wrapper for it.
- `lesson_completions.lesson_id` and `activity_log.ref` both CHECK `^les_[a-z0-9]{4,12}$`, so `gen_` ids are rejected.
- **New finding:** an applied progress table already exists. `generated_lesson_completions` (recorded `20261103015240`) has PK (user_id, lesson_id), the same 70% `passed_rule`, own-row RLS, and insert only on a visible generated lesson. Its update grant is column-limited and there is no delete. No app code uses it, and its comment says "Not counted toward mastery."
- Gap: its insert policy does not require the **parent** lesson's quiz to have been submitted.

## (a) Progress table and migration
- No new table is needed. Reuse `generated_lesson_completions`.
- One new migration `<ts>_dig_quiz_progress.sql` (the applied file stays untouched):
  1. `add column first_passed_at timestamptz` (nullable), mirroring `lesson_completions`. It is set once, on the first pass.
  2. Drop `generated_lesson_completions_insert_own_visible`. Recreate it as `..._insert_own_unlocked`:
     - `with check (user_id = (select auth.uid()) and exists (select 1 from public.generated_lessons g join public.lesson_completions c on c.lesson_id = g.parent_lesson_id and c.user_id = (select auth.uid()) where g.id = lesson_id))`.
     - RLS on both joined tables still applies.
  3. Grants: `revoke all ... from public, anon, authenticated, service_role`.
     - Then `grant select, insert` plus `update (score, total, passed, completed_at, first_passed_at)` to authenticated.
     - No delete, no anon.
  4. Only with option C2 below: widen `activity_log_ref_format` to `ref ~ '^les_[a-z0-9]{4,12}$' or ref ~ '^gen_[a-z0-9]{8,16}$'` (drop and re-add the constraint).
- **No new SECURITY DEFINER function.** Grading uses the existing `drilldown_quiz_key()`. If one is ever added, it must follow the rules: `set search_path = ''`, revoke EXECUTE from public, anon, authenticated and service_role, grant it to `drilldown_server` only, and prove it with `has_function_privilege`.
- `tests/db/`:
  - Users see only their own rows.
  - Insert is denied without a parent completion, and on another user's pending lesson.
  - `passed_rule` holds.
  - anon is denied.
  - `activity_log` accepts `gen_` ids and rejects junk.
- Add a unit test for the grant text, and add the migration under "Unapplied" in `supabase/README.md`.

## (b) Grading
- A server action `submitDigQuiz({ lessonId, answers })`:
  1. Calls `getClaims()`. The user id comes only from the claims.
  2. Uses `parseSubmission` and accepts exactly 6 integers from 0 to 3. Any forged score, total or passed value is ignored.
  3. Loads the lesson with the user's session (RLS decides visibility).
  4. Re-checks the parent completion (d).
  5. Fetches the key through a new `server-db.mjs` wrapper `quizKey()` that calls `drilldown_quiz_key`. The key stays in the database and the server.
  6. Grades with the existing `gradeQuiz` and `isPassing`.
- Pass threshold: the same 70% rule (`score*10 >= total*7`). On 6 questions that means **5 of 6** to pass.
- Explanations are returned only after grading.
- Best attempt only, using the existing `shouldReplace` and `improvementCondition` logic, so a pass is never downgraded.
- A per-minute submit limiter.
- Behind `WELL_READ_DRILLDOWNS`.

## (c) Do passes count toward streaks or mastery?
| Option | What it means | Tradeoffs |
| --- | --- | --- |
| C1. Neither (status quo) | The pass shows on `/dig` and next to the parent lesson's Dig deeper choice | No migration needed for credit. But studying Dig deeper earns no streak day. |
| **C2. Streaks only (recommended)** | Log `quiz_attempt` and `lesson_passed` with a `gen_` ref. Streaks already count any activity. | Small `activity_log` CHECK migration. Mastery, achievements and completionist stay static-only, so they stay stable when AI lessons are rejected or deleted (cascade). |
| C3. Streaks and mastery | Gen passes count toward the parent discipline's tier | Unreviewed AI content inflates tiers. Counts drop when a lesson is rejected. Completionist denominators get muddled. |

Recommendation: **C2**. The daily-reminder "finished day" trigger keys on `lesson_completions` passes, so a Dig deeper pass would not mark the day finished unless Mike wants that. That stays a separate choice.

## (d) Unlock stays tied to the parent quiz
- Unchanged: Dig deeper is offered only after the parent quiz has been submitted (pass or fail), through `gate.mjs` `hasCompletedLesson`.
- New: a published lesson can be opened by direct `/dig?id=` link. In that case the quiz shows "Finish the quiz on <parent> first" with a link, and the server action refuses to grade.
- The migration's insert policy enforces the same rule in SQL.
- A Dig deeper pass never unlocks more Dig deeper. Generated lessons have no choices.

## (e) AI quiz quality guards (deterministic checks in `validate.mjs`, run before save)
- **Already in place:** exactly 6 questions; 4 unique, non-empty options; answerIndex from 0 to 3; explanation checks; a cited source for each question; a fact-checker pass that each marked answer is correct against the cited excerpt (at most 1 unconfirmed claim, otherwise flagged).
- **Grounding:** the correct option must be answerable from the lesson text the reader sees. Check term overlap with the sections and key facts, and add the lesson body to the fact-check prompt ("answerable from lesson text; is any other option also correct?").
- **Answer-position balance:** shuffle options on the server with a seed from the lesson id and remap answerIndex. Each position is used, with no position more than 2 of 6 times. Reject explanations that mention letters or positions ("option B").
- **Distractors:**
  - Options must be unique after normalization.
  - No "all/none of the above".
  - The correct option must not be a length outlier (more than 1.75x the longest distractor).
  - No option text may be copied into the question, and no two questions may be duplicates.
- **Fallback:**
  - A failure means regenerating within the existing 4-call budget (raising it needs approval). Otherwise the attempt is rejected and the slot released (`drilldown_release_lesson`), as today.
  - Lessons saved before these guards are re-checked at read time. If one fails, its quiz is hidden ("No quiz for this lesson") and the lesson stays readable.
  - On a flagged lesson whose unconfirmed claim is a quiz item, the quiz is hidden until review.
- Bump `prompt_version` so cached lessons regenerate under the guards.

## (f) Rollout (small PRs; each merge needs Mike's OK)
1. Quality guards, shuffle, read-time quiz check and prompt bump. Gemini is mocked in tests. No migration.
2. `/dig` quiz UI and the grading server action. Saves the best attempt to the existing table. Parent check in the action. No credit (C1 behavior). No migration.
3. Migration: `first_passed_at`, the stricter insert policy and, for C2, the `activity_log` CHECK. **Needs Mike's separate OK to apply.** The code tolerates the migration being absent (the `isMissingColumnError` pattern).
4. After 3 is applied: log streak activity for Dig deeper attempts and passes, and update docs and ROADMAP.

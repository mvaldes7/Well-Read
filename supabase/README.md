# Supabase migrations

Migrations live in `supabase/migrations/` as `<version>_<name>.sql`. The version is the
timestamp the migration was recorded under on the Supabase project, and it must match the
filename. Migrations are applied only through the normal process, with Mike's approval.
App code never applies them and never uses the service role.

## Applied migrations

All of these are applied to the Well-Read project (`pjiuquekewnkctpkhiow`):

| Version          | File                                                | Task    | Adds |
| ---------------- | --------------------------------------------------- | ------- | ---- |
| `20261010040740` | `migrations/20261010040740_lesson_completions.sql`  | TSK-005 | `lesson_completions` (best attempt per lesson, own-row RLS) |
| `20261010181930` | `migrations/20261010181930_first_passed_at.sql`     | TSK-012 | `lesson_completions.first_passed_at` |
| `20261014233800` | `migrations/20261014233800_activity_log.sql`        | TSK-016 | `activity_log` (append-only, for day streaks) + backfill |
| `20261015023134` | `migrations/20261015023134_reading_list_items.sql`  | TSK-017 | `reading_list_items` (own-row CRUD, `completed_at`/`updated_at` trigger) |
| `20261102212005` | `migrations/20261102210548_activity_log_rate_limit.sql` | REV-011 | `activity_log` per-user insert rate limit (20/min, 300/h; trigger, SQLSTATE `WR429`). **Recorded version differs from the filename**, see below |

**Version mismatch (REV-011 rate limit):** this migration was applied to production on 2026-11-02 and recorded in the
project's migration history as `20261102212005`, but the file is named `20261102210548_activity_log_rate_limit.sql`. The
recorded version is authoritative. The file is deliberately **not** renamed or edited, because applied migrations are never touched. Tooling
that matches files to history by version (for example `supabase db push` / `migration list`) may report `20261102210548` as
local-only and `20261102212005` as remote-only. Don't re-apply it. Reconcile with `supabase migration repair` only with Mike's approval.
Its header still says `STATUS: UNAPPLIED`; that is historical, as described below.

## Unapplied migrations

In the repo but **not** applied to any Supabase project yet. Apply only with Mike's approval, then move the row up.

| Version          | File                                       | Task | Adds |
| ---------------- | ------------------------------------------ | ---- | ---- |
| `20261102231600` | `migrations/20261102231600_drilldowns.sql` | Drill-downs P2 | `generated_lessons`, `generated_quiz_keys`, `lesson_reports`, `drilldown_usage_user`/`_global`, `generated_lesson_completions`, SECURITY DEFINER `drilldown_reserve()`/`drilldown_save_lesson()`/`drilldown_quiz_key()`/`drilldown_my_lessons()`, LOGIN role `drilldown_server` (no password; no table privileges). Tested only on a local throwaway Postgres (`pnpm test:db`). No service_role. Password and env setup: see below. |
| `20261104214500` | `migrations/20261104214500_drilldown_review.sql` | Drill-downs P4 (DRAFT) | Owner review: `drilldown_owner` (one row, set by owner SQL), `generated_lessons.fact_check` (not client-readable), SECURITY DEFINER `drilldown_save_fact_check()`/`drilldown_review_queue()`/`drilldown_review_action()` (EXECUTE only for `drilldown_server`, owner checked inside). Apply after `20261102231600`. Tested only on a local throwaway Postgres (`pnpm test:db`). No service_role. |
| `20261105000000` | `migrations/20261105000000_drilldown_release.sql` | Drill-downs cap fix (DRAFT, unapplied) | SECURITY DEFINER `drilldown_release_lesson()` (EXECUTE only for `drilldown_server`) gives back a lesson slot after a failed/rejected attempt, never below kept lessons; calls stay counted. Replaces `drilldown_save_lesson()` (same signature) so rejected drafts don't count as used. Apply after `20261104214500`. Tested only on a local throwaway Postgres (`pnpm test:db`). No service_role. |

| `20261109214457` | `migrations/20261109214457_lesson_reminders.sql` | Daily reminders (DRAFT, unapplied) | Opt-in settings, finished days, atomic daily claims, pass trigger, invoker finish RPC, private sender functions and NOLOGIN `lesson_reminder_sender`. No scheduler or sending enabled. Activation approvals: [lesson reminder runbook](../docs/lesson-reminders.md). |

## `drilldown_server` (after 20261102231600 is applied)

The drill-down server uses this narrow role, **not** the service role, which stays forbidden. The migration creates it as LOGIN, with
`connection limit 5` and **no password**. Mike:

1. **Sets the password without sending it as plaintext SQL.** Never run `alter role ... password '<plain>'` in the dashboard SQL editor, because editor history and statement logs keep it. Use either:
   - a local `psql` connected as `postgres`, running `\password drilldown_server`, which sends a SCRAM verifier computed on the client; or
   - `alter role drilldown_server password 'SCRAM-SHA-256$4096:...'` with a verifier generated locally.
   Hosted requires SCRAM.
2. **Builds the URL for Supavisor.** The username is **`drilldown_server.<project-ref>`**.
   - Session mode uses port **5432**.
   - Transaction mode uses port **6543** and needs prepared statements turned off in the driver.
3. **Stores it only as the Vercel env var `DRILLDOWN_DB_URL`, type Sensitive.** It must never have a `NEXT_PUBLIC_` prefix. Only `src/lib/drilldowns/server-db.mjs` reads it, and that module imports `server-only`. Keep the server's pool at about **5** to match the role's connection limit.
4. **Rotates or disables it.** Repeat step 1 to rotate, or run `alter role drilldown_server nologin;` to disable.

Behaviour P3 must respect:
- **Midnight:** a reservation made before America/Los_Angeles midnight can't be used by a save after midnight. Both use the LA day, so the user loses that one attempt. This is accepted.
- **No wildcard reads:** `generated_lessons` and `lesson_reports` have column-level grants. P3 must not call supabase-js `.select()` with no columns, `select('*')`, or `.insert(...).select()` on `lesson_reports`; all of them fail with "permission denied". A unit test (`tests/unit/client-bundle.test.mjs`) greps `src` for these patterns.
- **Function defaults:** hosted default privileges grant EXECUTE on new functions to anon, authenticated **and service_role**. So every function revoke in this migration includes service_role, and so does the revoke on the `lesson_reports` identity sequence (REV-014).

## The `STATUS:` header comments are historical

Each migration's header comment describes its state **when it was written**. Some applied
migrations still say `STATUS: UNAPPLIED` (currently `20261010040740_lesson_completions.sql`,
`20261015023134_reading_list_items.sql` and `20261102210548_activity_log_rate_limit.sql`). That's stale but deliberate: an applied
migration is never edited, comments included, so the file stays exactly as it was applied.
**The table above is the source of truth.** Check the project's migration history
(`list_migrations`) when in doubt.

When a new migration is applied, add its row here (in the same PR as the code or a
follow-up). Don't touch the migration file itself.

### Drill-downs P3 app wiring

The app calls `drilldown_reserve` and `drilldown_save_lesson` only from `src/lib/drilldowns/server-db.mjs`
(`import "server-only"`, `DRILLDOWN_DB_URL`, `max: 1`, `prepare: false`). Users read `generated_lessons` and insert
`lesson_reports` with their own session and explicit columns. The migration is still not applied anywhere.

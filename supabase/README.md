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

## `drilldown_server` (after 20261102231600 is applied)

The drill-down server uses this narrow role, **not** the service role, which stays forbidden. The migration creates it without a password. Mike:

1. In the SQL editor, sets a password with `alter role drilldown_server with password '<long random>';`. Generate it locally and never commit it or paste it in chat.
2. Builds a connection URL for `drilldown_server` from the project's connection string, using the pooler (session mode) or the direct host.
3. Stores it as the server-only env var `DRILLDOWN_DB_URL`, Sensitive, in Vercel. It must never have a `NEXT_PUBLIC_` prefix. Only `src/lib/drilldowns/server-db.mjs` reads it.
4. Rotates it by running `alter role` again, or disables it with `alter role drilldown_server nologin;`.

## The `STATUS:` header comments are historical

Each migration's header comment describes its state **when it was written**. Some applied
migrations still say `STATUS: UNAPPLIED` (currently `20261010040740_lesson_completions.sql`,
`20261015023134_reading_list_items.sql` and `20261102210548_activity_log_rate_limit.sql`). That's stale but deliberate: an applied
migration is never edited, comments included, so the file stays exactly as it was applied.
**The table above is the source of truth.** Check the project's migration history
(`list_migrations`) when in doubt.

When a new migration is applied, add its row here (in the same PR as the code or a
follow-up). Don't touch the migration file itself.

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

## Unapplied migrations

In the repo but **not** applied to any Supabase project yet. Apply only with Mike's approval, then move the row up.

| Version          | File                                                   | Task    | Adds |
| ---------------- | ------------------------------------------------------ | ------- | ---- |
| `20261102210548` | `migrations/20261102210548_activity_log_rate_limit.sql` | REV-011 | `activity_log` per-user insert rate limit (20/min, 300/h; trigger, SQLSTATE `WR429`) |

## The `STATUS:` header comments are historical

Each migration's header comment describes its state **when it was written**. Some applied
migrations still say `STATUS: UNAPPLIED` (currently `20261010040740_lesson_completions.sql`
and `20261015023134_reading_list_items.sql`). That's stale but deliberate: an applied
migration is never edited, comments included, so the file stays exactly as it was applied.
**The table above is the source of truth.** Check the project's migration history
(`list_migrations`) when in doubt.

When a new migration is applied, add its row here (in the same PR as the code or a
follow-up). Don't touch the migration file itself.

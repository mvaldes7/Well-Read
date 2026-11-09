# Daily lesson reminders — inactive until separately approved

This PR does not apply production migrations, configure any environment, provision
credentials, schedule a job, deploy, or send a notification. Standard Web Push (VAPID),
like Family To-Do. No paid provider, new hosted service, or paid tier is required.

## Behavior and judgment calls

- Account → Daily lesson reminder is an explicit, accessible On/Off switch. No permission
  prompt or subscription on load. Without configuration/the migration it stays unavailable.
- Exactly one active destination per user. Enabling on a new browser replaces the old
  destination. Off is account-wide and saves before local unsubscription. Off still works
  if the feature flag is removed. Browser permission alone is not app opt-in.
- No per-user timezone exists; existing streaks use `America/Los_Angeles`, so reminders do
  too (Pacific time, DST-aware). The UI discloses this. Travel does not change the day.
- “Finished” means a **passed lesson quiz**. New/improved passes are tracked atomically via
  a DB trigger; passing retakes whose best score is kept are recorded by the verified quiz
  Server Action. A failed quiz does not suppress reminders. Historical passes today are
  checked through `first_passed_at` (fallback `completed_at`). Retake bookkeeping failure
  must not break grading; if that RPC alone fails a kept retake might not suppress a reminder.
- Private SQL claims at most 100 opted-in unfinished users per invocation. A durable unique
  `(user_id, Pacific day)` claim is made **before** transport, including concurrent jobs.
  Failed/ambiguous transport/crashes consume the day: no retries, favoring no duplicates
  over guaranteed delivery. Disable/re-enable and replacement devices cannot reset claims.
- Opt-in, endpoint, completion and claim day are rechecked immediately before each send;
  batches crossing Pacific midnight are skipped. A completion/opt-out racing *after* that
  check cannot retract an in-flight/queued notification. One-hour TTL limits stale delivery;
  the provider/OS ultimately controls delivery time.
- 404/410 endpoints are disabled only if still the same endpoint (not a new replacement).
- Generic lock-screen text; tap always opens same-origin `/learn`. Signed-out users follow
  the existing login `next` flow. No offline/authenticated-content caching.
- Endpoint allowlist prevents SSRF: Google FCM, Mozilla, Apple and Windows push hosts only.
  Unknown push providers are rejected. iPhone/iPad requires Home Screen installation and
  permission. Settings use the user's session and RLS; sender never uses service-role keys.

## Exact items requiring Mike's explicit approval (none performed)

1. Apply **only** `supabase/migrations/20261109214457_lesson_reminders.sql` through the normal
   migration process after review. Three RLS tables, pass trigger, invoker completion RPC,
   private sender functions and a **NOLOGIN** role. Depends only on already-applied lesson
   completion/first-pass migrations, not drill-down migrations. Never edit/reapply old files.
   The historical version mismatch in `supabase/README.md` means blind `supabase db push`
   is not an activation instruction.
2. Provision login for `lesson_reminder_sender` with connection limit 2 and a securely set
   SCRAM password (interactive psql password setup; never plaintext SQL/editor history).
   No direct table grants, only EXECUTE on three functions in `reminder_private`.
3. Add each environment variable/secret (names only):
   - `VAPID_PUBLIC_KEY` — application and sender; public key passed as an Account prop.
   - `VAPID_PRIVATE_KEY` — server/sender secret, never `NEXT_PUBLIC_`.
   - `VAPID_SUBJECT` — server/sender VAPID contact URI.
   - `LESSON_REMINDER_DB_URL` — **sender only**, sensitive narrow-role URL. One TLS connection
     per process, prepared statements off for Supavisor transaction pooling.
   - `WELL_READ_LESSON_REMINDERS` — application and sender flag; OFF unless exactly `1`.
   Dedicated Well-Read VAPID keys must be generated only after approval, not reused from Family To-Do.
4. Add/enable a scheduler **separately**: proposed free GitHub Actions scheduled workflow
   running the CLI once daily at **6 PM PST / 7 PM PDT** (same instant year-round).
   No scheduled workflow or cron is added. Mike must approve platform, cadence, secret
   placement and permissions. Confirm private-repo Actions allowances; stay within free
   minutes and disable if unavailable, never upgrade. No public cron endpoint/auth secret.
5. Turn on real sending by setting **`WELL_READ_LESSON_REMINDERS=1`**, with all VAPID settings
   and `LESSON_REMINDER_DB_URL` present in the sender, then invoking/scheduling the CLI.
   Feature activation, credential setup, scheduler setup, a real send test and deployment
   each need approval; approving/merging the PR alone is not approval for those actions.

After all relevant approvals only: `node scripts/send-lesson-reminders.mjs`.
Without the exact flag or any required setting it exits without connecting or sending.
It never reads `DATABASE_URL`. Logs aggregate counts only, not ids/endpoints/keys/errors.
A single invocation handles 100 candidates; larger usage needs separately reviewed batching
rather than silent free-tier expansion.

## Verification and rollback

Unit tests inject DB/transport and never contact push providers. SQL/RLS/concurrency tests
use the repo's throwaway Unix-socket Postgres cluster. Unset `DATABASE_URL` before tooling;
use a clean environment for `pnpm test:db`.

Before production activation, separately approve and verify actual browser opt-in, Off,
permission denial, expiration cleanup, signed-out Learn deep link, device replacement,
DST/day rollover, and real phone delivery. Offline mocks cannot establish real delivery.

Emergency stop: remove/set `WELL_READ_LESSON_REMINDERS=0` in the sender **and** stop the job;
application flag removal disables new opt-in but still permits Off. Disable sender login
if needed. Accepted push messages cannot be recalled. Preserve claims so restart/re-enable
cannot duplicate today's sends. Data cascade-deletes with accounts; no destructive rollback
or retention job is part of this PR.

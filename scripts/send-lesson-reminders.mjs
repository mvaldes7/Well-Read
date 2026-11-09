// Sender CLI, run daily by .github/workflows/lesson-reminders.yml (see docs/lesson-reminders.md).
// `--check` connects and runs one read-only query: it never claims, imports web-push, or sends.
import { reminderConfig } from "../src/lib/reminders/logic.mjs";
import { sendLessonReminders } from "../src/lib/reminders/send.mjs";
import { checkReminderConnection } from "../src/lib/reminders/check.mjs";

const checkOnly = process.argv.includes("--check");
const pgOptions = { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10, ssl: "require" };

if (checkOnly) {
  if (!process.env.LESSON_REMINDER_DB_URL) {
    console.error("Check failed: LESSON_REMINDER_DB_URL is not set.");
    process.exit(1);
  }
  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.LESSON_REMINDER_DB_URL, pgOptions);
  try {
    const result = await checkReminderConnection(sql);
    const configured = reminderConfig(process.env) !== null;
    console.log(JSON.stringify({ check: true, ...result, sendingEnabled: configured, claimed: 0, sent: 0 }));
    if (!result.senderRole || !result.canClaim) process.exitCode = 1;
  } catch {
    console.error("Check failed: could not connect or query. No claim or push attempted.");
    process.exitCode = 1;
  } finally { await sql.end({ timeout: 5 }); }
  process.exit(process.exitCode ?? 0);
}


// Fail closed before importing transport or connecting. Never fall back to shared DATABASE_URL.
if (!reminderConfig(process.env) || !process.env.LESSON_REMINDER_DB_URL) {
  console.log("Lesson reminders disabled; no database connection or push attempted.");
} else {
  const { default: postgres } = await import("postgres");
  // web-push v4 is ESM with named exports only (no default export).
  const webpush = await import("web-push");
  const sql = postgres(process.env.LESSON_REMINDER_DB_URL, pgOptions);
  try {
    const result = await sendLessonReminders({
      env: process.env,
      claim: async () => [...await sql`select * from reminder_private.lesson_reminder_claim_batch()`],
      canSend: async (row) => {
        const [result] = await sql`select reminder_private.lesson_reminder_ready(${row.user_id}::uuid, ${row.endpoint}, ${row.claim_day}::date) as ready`;
        return result.ready === true;
      },
      expire: (user, endpoint) => sql`select reminder_private.lesson_reminder_expire(${user}::uuid, ${endpoint})`,
      send: (sub, payload, options) => webpush.sendNotification(sub, payload, options),
    });
    // Aggregate counts only: never log endpoints, user ids, subscription keys or DB errors.
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode = 1;
  } catch {
    console.error("Lesson reminder job failed. No automatic retry; inspect configuration privately.");
    process.exitCode = 1;
  } finally { await sql.end({ timeout: 5 }); }
}

// Manual CLI entry point only. NO scheduler/cron is installed or enabled by this PR.
// Run only after the migration/configuration/sending approvals in docs/lesson-reminders.md.
import { reminderConfig } from "../src/lib/reminders/logic.mjs";
import { sendLessonReminders } from "../src/lib/reminders/send.mjs";

// Fail closed before importing transport or connecting. Never fall back to shared DATABASE_URL.
if (!reminderConfig(process.env) || !process.env.LESSON_REMINDER_DB_URL) {
  console.log("Lesson reminders disabled; no database connection or push attempted.");
} else {
  const { default: postgres } = await import("postgres");
  const { default: webpush } = await import("web-push");
  const sql = postgres(process.env.LESSON_REMINDER_DB_URL, {
    max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10, ssl: "require",
  });
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

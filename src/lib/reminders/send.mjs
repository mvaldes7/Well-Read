// @ts-check
// CLI-only worker; never imported by a Client Component. No side effects at import time.
import { parseSubscription, reminderConfig, REMINDER_PAYLOAD } from "./logic.mjs";

/** @typedef {{user_id: string, endpoint: string, p256dh: string, auth: string, claim_day: string}} Destination */
/** Dependency injection keeps tests entirely offline: no DB, credentials, or push service.
 * @param {{env: Record<string, string | undefined>,
 * claim: () => Promise<Destination[]>,
 * canSend: (row: Destination) => Promise<boolean>,
 * expire: (userId: string, endpoint: string) => Promise<unknown>,
 * send: (subscription: {endpoint: string, keys: {p256dh: string, auth: string}}, payload: string,
 *   options: {vapidDetails: {publicKey: string, privateKey: string, subject: string}, TTL: number, timeout: number}) => Promise<unknown>}} deps
 */
export async function sendLessonReminders({env, claim, canSend, expire, send}) {
  const config = reminderConfig(env);
  if (!config || !env.LESSON_REMINDER_DB_URL) return { disabled: true, claimed: 0, sent: 0, failed: 0 };
  const rows = await claim();
  let sent = 0, failed = 0;
  for (const row of rows) {
    const sub = parseSubscription(row);
    if (!sub) { failed++; continue; } // Revalidate even if a client bypassed the Server Action/RLS writes.
    try {
      if (!await canSend(row)) continue;
      await send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(REMINDER_PAYLOAD), {
        vapidDetails: config, TTL: 60 * 60, timeout: 10_000,
      });
      sent++;
    } catch (error) {
      failed++;
      const code = /** @type {{statusCode?: number}} */ (error)?.statusCode;
      if (code === 404 || code === 410) await expire(row.user_id, row.endpoint);
      // No retries: a failure may have been accepted by the push provider. Today's claim stays consumed.
    }
  }
  return { disabled: false, claimed: rows.length, sent, failed };
}

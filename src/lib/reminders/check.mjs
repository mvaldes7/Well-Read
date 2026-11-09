// @ts-check
// Connectivity check for the scheduled sender. It never claims, sends, or changes data:
// one read-only query proves the URL, TLS, pooler and narrow role work from the runner.
/** @param {(strings: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>} sql */
export async function checkReminderConnection(sql) {
  const [row] = await sql`select current_user = 'lesson_reminder_sender' as sender_role,
    pg_catalog.has_function_privilege('reminder_private.lesson_reminder_claim_batch()', 'execute') as can_claim`;
  return { connected: true, senderRole: row?.sender_role === true, canClaim: row?.can_claim === true };
}

// LOCAL ONLY: receives the throwaway cluster's Unix socket, never reads any database URL.
import assert from "node:assert/strict";
import postgres from "postgres";
const socket = process.env.WR_TEST_PG_SOCKET;
if (!socket || !socket.startsWith("/tmp/")) throw new Error("local test socket required");
const sql = postgres({ host: socket, user: "postgres", database: "postgres", max: 2, prepare: false, ssl: false });
const user = "10000000-0000-0000-0000-0000000000e4";
try {
  await sql`insert into auth.users(id) values (${user}::uuid)`;
  await sql`insert into public.lesson_reminder_settings(user_id, enabled, endpoint, p256dh, auth)
    values(${user}::uuid, true, 'https://fcm.googleapis.com/race', ${"B" + "a".repeat(86)}, ${"a".repeat(22)})`;
  let unlock, started;
  const locked = new Promise(resolve => { started = resolve; });
  const release = new Promise(resolve => { unlock = resolve; });
  // Hold the first claim transaction open while the second sender tries the same user.
  const first = sql.begin(async tx => {
    await tx`set local role lesson_reminder_sender`;
    const rows = await tx`select * from reminder_private.lesson_reminder_claim_batch()`;
    assert.equal(rows.length, 1);
    started();
    await release;
    return rows;
  });
  await locked;
  let second;
  try {
    second = await sql.begin(async tx => {
      await tx`set local role lesson_reminder_sender`;
      return tx`select * from reminder_private.lesson_reminder_claim_batch()`;
    });
  } finally { unlock(); }
  await first;
  assert.equal(second.length, 0, "concurrent sender skips locked user");
  assert.equal((await sql`select * from reminder_private.lesson_reminder_claim_batch()`).length, 0, "committed claim cannot repeat");
  const [claim] = await sql`select day::text as day from public.lesson_reminder_claims where user_id = ${user}::uuid`;
  const ready = async () => (await sql`select reminder_private.lesson_reminder_ready(${user}::uuid, 'https://fcm.googleapis.com/race', ${claim.day}::date) as ready`)[0].ready;
  assert.equal(await ready(), true);
  await sql`update public.lesson_reminder_settings set enabled = false where user_id = ${user}::uuid`;
  assert.equal(await ready(), false, "opt-out after claim stops transport");
  await sql`update public.lesson_reminder_settings set enabled = true where user_id = ${user}::uuid`;
  await sql`insert into public.lesson_reminder_finished_days values (${user}::uuid, ${claim.day}::date)`;
  assert.equal(await ready(), false, "completion after claim stops transport");
  console.log("reminders.node.mjs: 6 concurrency/pre-send assertions passed");
} finally { await sql.end({ timeout: 5 }); }

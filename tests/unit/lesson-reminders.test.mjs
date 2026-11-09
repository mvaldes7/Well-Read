import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { reminderConfig, reminderDay, shouldRemind, parseSubscription, validPushEndpoint, LEARN_PATH, REMINDER_PAYLOAD } from "../../src/lib/reminders/logic.mjs";
import { sendLessonReminders } from "../../src/lib/reminders/send.mjs";
import { classifyPath } from "../../src/lib/auth/logic.mjs";

const env = { WELL_READ_LESSON_REMINDERS: "1", VAPID_PUBLIC_KEY: "test-public", VAPID_PRIVATE_KEY: "test-private", VAPID_SUBJECT: "mailto:test@example.com", LESSON_REMINDER_DB_URL: "test-only" };
const sub = { user_id: "test-user", claim_day: "2026-11-09", endpoint: "https://fcm.googleapis.com/fcm/send/test", p256dh: "B" + "a".repeat(86), auth: "a".repeat(22) };
const now = "2026-11-09T22:00:00Z";
const today = "2026-11-09";
const source = f => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("flag is exact opt-in, all VAPID config required", () => {
  for (const value of [undefined, "0", "true", " 1"]) assert.equal(reminderConfig({ ...env, WELL_READ_LESSON_REMINDERS: value }), null);
  for (const key of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]) assert.equal(reminderConfig({ ...env, [key]: "" }), null);
  assert.ok(reminderConfig(env));
});
test("off, already finished and already claimed days suppress; yesterday doesn't", () => {
  const base = { enabled: true, now, finishedDays: [], claimedDays: [] };
  assert.equal(shouldRemind(base), true);
  assert.equal(shouldRemind({ ...base, enabled: false }), false);
  assert.equal(shouldRemind({ ...base, finishedDays: [today] }), false);
  assert.equal(shouldRemind({ ...base, claimedDays: [today] }), false);
  assert.equal(shouldRemind({ ...base, finishedDays: ["2026-11-08"], claimedDays: ["2026-11-08"] }), true);
});
test("Pacific midnight, spring/fall DST use calendar days, not 24-hour intervals", () => {
  assert.equal(reminderDay("2026-11-10T07:59:59Z"), today);
  assert.equal(reminderDay("2026-11-10T08:00:00Z"), "2026-11-10");
  assert.equal(reminderDay("2026-03-09T06:59:59Z"), "2026-03-08");
  assert.equal(reminderDay("2026-03-09T07:00:00Z"), "2026-03-09");
  assert.equal(reminderDay("2026-11-01T08:30:00Z"), reminderDay("2026-11-01T09:30:00Z"));
});
test("subscription validation rejects malformed keys and SSRF destinations", () => {
  assert.ok(parseSubscription(sub));
  for (const raw of [null, {}, { ...sub, auth: "bad" }, { ...sub, p256dh: "bad" }]) assert.equal(parseSubscription(raw), null);
  for (const url of ["http://fcm.googleapis.com/a", "https://127.0.0.1/a", "https://localhost/a", "https://fcm.googleapis.com.evil.test/a", "https://fcm.googleapis.com@evil.test/a", "https://fcm.googleapis.com:123/a", "https://fcm.googleapis.com/a#x", "https://evil.test"]) assert.equal(validPushEndpoint(url), false, url);
  for (const host of ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "wns2.notify.windows.com"]) assert.equal(validPushEndpoint(`https://${host}/test`), true);
});
test("disabled or unconfigured worker never claims or sends", async () => {
  for (const e of [{}, { ...env, WELL_READ_LESSON_REMINDERS: "0" }, { ...env, LESSON_REMINDER_DB_URL: "" }]) {
    const fail = () => { throw Error("must not call dependencies"); };
    assert.equal((await sendLessonReminders({ env: e, claim: fail, canSend: fail, expire: fail, send: fail })).disabled, true);
  }
});
test("claim precedes transport, fixed /learn payload, no transport retries", async () => {
  const calls = [];
  const result = await sendLessonReminders({ env,
    claim: async () => { calls.push("claim"); return [sub]; },
    canSend: async () => true, expire: async () => assert.fail("not expired"),
    send: async (_s, payload, opts) => { calls.push("send"); assert.equal(JSON.parse(payload).notification.navigate, "https://well-read-learn.vercel.app/learn"); assert.equal(opts.TTL, 3600); },
  });
  assert.deepEqual(calls, ["claim", "send"]);
  assert.deepEqual(result, { disabled: false, claimed: 1, sent: 1, failed: 0 });
});
test("404/410 clean up matching endpoint; transient failures consume claim without retry", async () => {
  for (const statusCode of [404, 410, 429, 503]) {
    let sends = 0, expires = 0;
    const result = await sendLessonReminders({ env, claim: async () => [sub],
      canSend: async () => true, expire: async (user, endpoint) => { expires++; assert.equal(user, sub.user_id); assert.equal(endpoint, sub.endpoint); },
      send: async () => { sends++; throw { statusCode }; },
    });
    assert.equal(sends, 1); assert.equal(expires, [404, 410].includes(statusCode) ? 1 : 0);
    assert.equal(result.failed, 1);
  }
});
test("revalidate DB endpoints before transport", async () => {
  const result = await sendLessonReminders({ env, claim: async () => [{ ...sub, endpoint: "https://127.0.0.1" }],
    canSend: async () => true, expire: async () => {}, send: async () => assert.fail("SSRF"),
  });
  assert.equal(result.failed, 1);
});
test("service worker ignores injected URLs and navigates to same-origin Learn", async () => {
  const listeners = {}, shown = [], opened = [];
  const context = { URL, self: { location: { origin: "https://well-read.test" },
    addEventListener: (name, cb) => { listeners[name] = cb; },
    registration: { showNotification: async (...args) => shown.push(args) },
    clients: { matchAll: async () => [], openWindow: async url => opened.push(url) },
  } };
  vm.runInNewContext(source("public/sw.js"), context);
  let done;
  listeners.push({ data: { json: () => ({url: "https://evil.test"}) }, waitUntil: p => { done = p; } });
  await done;
  assert.equal(shown[0][1].data.url, "/learn");
  listeners.notificationclick({ notification: { close() {}, data: {url: "https://evil.test"} }, waitUntil: p => { done = p; } });
  await done;
  assert.deepEqual(opened, ["https://well-read.test/learn"]);
  assert.equal(classifyPath("/sw.js"), "public");
  assert.equal(classifyPath("/api/reminders"), "protected");
  // Declarative push: the browser's proposed notification is left alone (no replacement).
  shown.length = 0; let waited = false;
  listeners.push({ notification: { title: "Well-Read" }, data: null, waitUntil: () => { waited = true; } });
  assert.equal(shown.length, 0);
  assert.equal(waited, false);
});
test("account control and auth wiring: opt-in only, Off persists before unsubscribe", () => {
  const ui = source("src/components/LessonReminder.tsx"), actions = source("src/lib/reminders/actions.ts");
  assert.match(ui, /role="switch"/); assert.match(ui, /Daily reminder/);
  assert.ok(ui.indexOf("setLessonReminder(false)") < ui.indexOf("unsubscribe()"));
  assert.ok(ui.indexOf("async function toggle") < ui.indexOf("Notification.requestPermission()"));
  assert.match(actions, /auth.getClaims/); assert.doesNotMatch(actions, /SERVICE_ROLE|DATABASE_URL/);
  assert.match(source("src/app/account/page.tsx"), /<LessonReminder/);
  assert.match(source("src/lib/quiz/actions.ts"), /passed && save !== "failed"/);
});
test("migration has RLS, locked claims, narrow sender and no credentials/scheduler", () => {
  const sql = source("supabase/migrations/20261109214457_lesson_reminders.sql");
  assert.equal((sql.match(/enable row level security/g) || []).length, 3);
  assert.match(sql, /primary key\(user_id, day\)/);
  assert.match(sql, /for update of s skip locked/);
  assert.match(sql, /create role lesson_reminder_sender nologin/);
  assert.match(sql, /coalesce\(c.first_passed_at, c.completed_at\)/);
  assert.doesNotMatch(sql, /cron.schedule|password '/i);
});

test("completion/opt-out after claim wins before transport", async () => {
  const result = await sendLessonReminders({ env, claim: async () => [sub],
    canSend: async () => false, expire: async () => {}, send: async () => assert.fail("no send"),
  });
  assert.equal(result.claimed, 1); assert.equal(result.sent, 0);
});

test("reminder payload is Declarative Web Push with a fixed same-site /learn navigate", () => {
  assert.equal(REMINDER_PAYLOAD.web_push, 8030);
  const n = REMINDER_PAYLOAD.notification;
  assert.equal(n.title, "Well-Read");
  assert.equal(n.navigate, "https://well-read-learn.vercel.app" + LEARN_PATH);
  assert.equal(new URL(n.navigate).protocol, "https:");
  assert.ok(Object.isFrozen(REMINDER_PAYLOAD) && Object.isFrozen(n));
  assert.deepEqual(Object.keys(REMINDER_PAYLOAD).sort(), ["notification", "web_push"]);
});

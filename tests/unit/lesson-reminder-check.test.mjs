import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkReminderConnection } from "../../src/lib/reminders/check.mjs";

test("connectivity check runs one read-only query and never claims", async () => {
  const queries = [];
  const sql = async (strings) => { queries.push(strings.join("?")); return [{ sender_role: true, can_claim: true }]; };
  assert.deepEqual(await checkReminderConnection(sql), { connected: true, senderRole: true, canClaim: true });
  assert.equal(queries.length, 1);
  assert.doesNotMatch(queries[0], /from\s+reminder_private\./i);
  assert.doesNotMatch(queries[0], /lesson_reminder_(ready|expire)\(/);
});

test("connectivity check reports a wrong role or missing grant", async () => {
  const sql = async () => [{ sender_role: false, can_claim: false }];
  assert.deepEqual(await checkReminderConnection(sql), { connected: true, senderRole: false, canClaim: false });
});

test("CLI --check exits before web-push import or claim", () => {
  const src = readFileSync(new URL("../../scripts/send-lesson-reminders.mjs", import.meta.url), "utf8");
  const checkBlock = src.slice(src.indexOf("if (checkOnly)"), src.indexOf("process.exit(process.exitCode ?? 0);"));
  assert.ok(checkBlock.length > 0);
  assert.doesNotMatch(checkBlock, /web-push|claim_batch\(\)`|sendLessonReminders/);
});

test("scheduled workflow: hourly 11-23 and 0-2 UTC, check-only on PRs, flag from repo variable", () => {
  const wf = readFileSync(new URL("../../.github/workflows/lesson-reminders.yml", import.meta.url), "utf8");
  assert.match(wf, /cron: "0 11-23,0-2 \* \* \*"/);
  assert.doesNotMatch(wf, /\*\/15/);
  assert.match(wf, /WELL_READ_LESSON_REMINDERS: \$\{\{ vars\.WELL_READ_LESSON_REMINDERS \}\}/);
  assert.match(wf, /github\.event_name == 'schedule' \|\| inputs\.mode == 'send'/);
  assert.doesNotMatch(wf, /DATABASE_URL: /);
});

test("CLI send path checks the Pacific window before importing postgres or web-push", () => {
  const src = readFileSync(new URL("../../scripts/send-lesson-reminders.mjs", import.meta.url), "utf8");
  const afterCheck = src.slice(src.indexOf("process.exit(process.exitCode ?? 0);"));
  const guardAt = afterCheck.indexOf("isInReminderSendWindow()");
  const postgresAt = afterCheck.indexOf("import(\"postgres\")");
  const webPushAt = afterCheck.indexOf("import(\"web-push\")");
  const claimAt = afterCheck.indexOf("sendLessonReminders");
  assert.ok(guardAt >= 0, "send path must call isInReminderSendWindow");
  assert.ok(postgresAt > guardAt, "window guard must run before importing postgres");
  assert.ok(webPushAt > guardAt, "window guard must run before importing web-push");
  assert.ok(claimAt > guardAt, "window guard must run before sendLessonReminders");
});

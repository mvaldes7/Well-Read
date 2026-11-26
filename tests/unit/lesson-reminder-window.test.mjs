import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isInReminderSendWindow, reminderDay, shouldRemind,
  REMINDER_WINDOW_START_HOUR, REMINDER_WINDOW_END_HOUR,
} from "../../src/lib/reminders/logic.mjs";
import { sendLessonReminders } from "../../src/lib/reminders/send.mjs";

const env = {
  WELL_READ_LESSON_REMINDERS: "1",
  VAPID_PUBLIC_KEY: "test-public",
  VAPID_PRIVATE_KEY: "test-private",
  VAPID_SUBJECT: "mailto:test@example.com",
  LESSON_REMINDER_DB_URL: "test-only",
};
const fail = () => { throw Error("must not call dependencies"); };

test("send window constants are 2 PM inclusive to 6 PM exclusive Pacific", () => {
  assert.equal(REMINDER_WINDOW_START_HOUR, 14);
  assert.equal(REMINDER_WINDOW_END_HOUR, 18);
});

test("send window: before 2 PM Pacific is closed", () => {
  // 1:59 PM PST on 2026-12-15 and 1:59 PM PDT on 2026-07-15.
  assert.equal(isInReminderSendWindow("2026-12-15T21:59:00Z"), false);
  assert.equal(isInReminderSendWindow("2026-07-15T20:59:00Z"), false);
});

test("send window: inside 2-6 PM Pacific is open", () => {
  // 2:00 PM and 5:59 PM on both DST sides.
  assert.equal(isInReminderSendWindow("2026-12-15T22:00:00Z"), true); // 2:00 PM PST
  assert.equal(isInReminderSendWindow("2026-12-16T01:59:00Z"), true); // 5:59 PM PST
  assert.equal(isInReminderSendWindow("2026-07-15T21:00:00Z"), true); // 2:00 PM PDT
  assert.equal(isInReminderSendWindow("2026-07-16T00:59:00Z"), true); // 5:59 PM PDT
});

test("send window: at and after 6 PM Pacific is closed", () => {
  assert.equal(isInReminderSendWindow("2026-12-16T02:00:00Z"), false); // 6:00 PM PST
  assert.equal(isInReminderSendWindow("2026-12-16T03:30:00Z"), false); // 7:30 PM PST
  assert.equal(isInReminderSendWindow("2026-07-16T01:00:00Z"), false); // 6:00 PM PDT
  assert.equal(isInReminderSendWindow("2026-07-16T04:00:00Z"), false); // 9:00 PM PDT
});

test("send window: a 3 AM Pacific late run is closed", () => {
  // The failure mode since Nov 10: a 02:00 UTC cron starting 7-10 hours late.
  assert.equal(isInReminderSendWindow("2026-11-25T10:55:00Z"), false); // 2:55 AM PST
  assert.equal(isInReminderSendWindow("2026-12-16T11:00:00Z"), false); // 3:00 AM PST
  assert.equal(isInReminderSendWindow("2026-07-16T10:00:00Z"), false); // 3:00 AM PDT
});

test("send window: July PDT and December PST", () => {
  // Same clock time, different UTC offsets.
  assert.equal(isInReminderSendWindow("2026-07-15T21:00:00Z"), true);  // 2 PM PDT
  assert.equal(isInReminderSendWindow("2026-07-15T22:00:00Z"), true);  // 3 PM PDT
  assert.equal(isInReminderSendWindow("2026-07-15T20:00:00Z"), false); // 1 PM PDT
  assert.equal(isInReminderSendWindow("2026-12-15T22:00:00Z"), true);  // 2 PM PST
  assert.equal(isInReminderSendWindow("2026-12-15T21:00:00Z"), false); // 1 PM PST (the PDT 2 PM UTC slot)
  assert.equal(isInReminderSendWindow("2026-12-16T01:45:00Z"), true);  // 5:45 PM PST
  assert.equal(isInReminderSendWindow("2026-12-16T02:00:00Z"), false); // 6:00 PM PST
});

test("send window: near the March and November DST transitions", () => {
  // 2026-03-08 spring forward (02:00 PST -> 03:00 PDT). Afternoon is PDT.
  assert.equal(isInReminderSendWindow("2026-03-08T10:00:00Z"), false); // 3:00 AM PDT
  assert.equal(isInReminderSendWindow("2026-03-08T20:59:00Z"), false); // 1:59 PM PDT
  assert.equal(isInReminderSendWindow("2026-03-08T21:00:00Z"), true);  // 2:00 PM PDT
  assert.equal(isInReminderSendWindow("2026-03-09T00:59:00Z"), true);  // 5:59 PM PDT
  assert.equal(isInReminderSendWindow("2026-03-09T01:00:00Z"), false); // 6:00 PM PDT
  // 2026-11-01 fall back (02:00 PDT -> 01:00 PST). Afternoon is PST.
  assert.equal(isInReminderSendWindow("2026-11-01T11:00:00Z"), false); // 3:00 AM PST
  assert.equal(isInReminderSendWindow("2026-11-01T21:59:00Z"), false); // 1:59 PM PST
  assert.equal(isInReminderSendWindow("2026-11-01T22:00:00Z"), true);  // 2:00 PM PST
  assert.equal(isInReminderSendWindow("2026-11-02T01:59:00Z"), true);  // 5:59 PM PST
  assert.equal(isInReminderSendWindow("2026-11-02T02:00:00Z"), false); // 6:00 PM PST
});

test("sender does not claim on a 3 AM Pacific late run", async () => {
  const result = await sendLessonReminders({
    env, now: "2026-11-25T10:55:00Z", claim: fail, canSend: fail, expire: fail, send: fail,
  });
  assert.deepEqual(result, { disabled: false, claimed: 0, sent: 0, failed: 0, skipped: "outside_send_window" });
});

test("sender does not claim before 2 PM or after 6 PM Pacific", async () => {
  for (const now of ["2026-12-15T21:59:00Z", "2026-12-16T02:00:00Z", "2026-07-16T01:00:00Z"]) {
    const result = await sendLessonReminders({
      env, now, claim: fail, canSend: fail, expire: fail, send: fail,
    });
    assert.equal(result.skipped, "outside_send_window");
    assert.equal(result.claimed, 0);
  }
});

test("sender claims inside the window and skips an already-claimed day", async () => {
  const inside = "2026-12-15T22:00:00Z"; // 2:00 PM PST
  const day = reminderDay(inside);
  assert.equal(shouldRemind({ enabled: true, now: inside, finishedDays: [], claimedDays: [day] }), false);
  assert.equal(shouldRemind({ enabled: true, now: inside, finishedDays: [], claimedDays: [] }), true);

  let claimed = 0;
  const empty = await sendLessonReminders({
    env, now: inside,
    claim: async () => { claimed++; return []; },
    canSend: fail, expire: fail, send: fail,
  });
  assert.equal(claimed, 1);
  assert.deepEqual(empty, { disabled: false, claimed: 0, sent: 0, failed: 0 });

  // A late run the following morning must still not claim, even though the Pacific day changed.
  const late = await sendLessonReminders({
    env, now: "2026-12-16T11:00:00Z", claim: fail, canSend: fail, expire: fail, send: fail,
  });
  assert.equal(late.skipped, "outside_send_window");
  assert.notEqual(reminderDay("2026-12-16T11:00:00Z"), day);
});

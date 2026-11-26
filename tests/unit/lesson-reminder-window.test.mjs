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

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
// Hourly slots matching `0 11-23,0-2 * * *` (16 runs a day).
const CRON_HOURS = [0, 1, 2, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

function cronSlotsFromTo(startUtcMs, endUtcMs) {
  const slots = [];
  const start = new Date(startUtcMs);
  start.setUTCMinutes(0, 0, 0);
  if (start.getTime() < startUtcMs) start.setUTCHours(start.getUTCHours() + 1);
  for (let t = start.getTime(); t < endUtcMs; t += HOUR) {
    if (CRON_HOURS.includes(new Date(t).getUTCHours())) slots.push(t);
  }
  return slots;
}

function measuredLags() {
  const lags = new Set([0, 4 * HOUR, (6 * 60 + 40) * MINUTE, (10 * 60 + 4) * MINUTE]);
  for (let minutes = 6 * 60 + 40; minutes <= 10 * 60 + 4; minutes += 5) lags.add(minutes * MINUTE);
  lags.add((10 * 60 + 4) * MINUTE);
  return [...lags].sort((a, b) => a - b);
}

test("send window constants are 2 PM inclusive to 9 PM exclusive Pacific", () => {
  assert.equal(REMINDER_WINDOW_START_HOUR, 14);
  assert.equal(REMINDER_WINDOW_END_HOUR, 21);
});

test("send window: before 2 PM Pacific is closed", () => {
  // 1:59 PM PST on 2026-12-15 and 1:59 PM PDT on 2026-07-15.
  assert.equal(isInReminderSendWindow("2026-12-15T21:59:00Z"), false);
  assert.equal(isInReminderSendWindow("2026-07-15T20:59:00Z"), false);
});

test("send window: inside 2-9 PM Pacific is open", () => {
  // 2:00 PM, mid-afternoon, 8:59 PM on both DST sides.
  assert.equal(isInReminderSendWindow("2026-12-15T22:00:00Z"), true); // 2:00 PM PST
  assert.equal(isInReminderSendWindow("2026-12-16T02:00:00Z"), true); // 6:00 PM PST
  assert.equal(isInReminderSendWindow("2026-12-16T04:59:00Z"), true); // 8:59 PM PST
  assert.equal(isInReminderSendWindow("2026-07-15T21:00:00Z"), true); // 2:00 PM PDT
  assert.equal(isInReminderSendWindow("2026-07-16T01:00:00Z"), true); // 6:00 PM PDT
  assert.equal(isInReminderSendWindow("2026-07-16T03:59:00Z"), true); // 8:59 PM PDT
});

test("send window: at and after 9 PM Pacific is closed", () => {
  assert.equal(isInReminderSendWindow("2026-12-16T05:00:00Z"), false); // 9:00 PM PST
  assert.equal(isInReminderSendWindow("2026-12-16T06:30:00Z"), false); // 10:30 PM PST
  assert.equal(isInReminderSendWindow("2026-07-16T04:00:00Z"), false); // 9:00 PM PDT
  assert.equal(isInReminderSendWindow("2026-07-16T07:00:00Z"), false); // 12:00 AM PDT
});

test("send window: a 3 AM Pacific late run is closed", () => {
  // The failure mode since Nov 10: a cron starting 7-10 hours late into the next morning.
  assert.equal(isInReminderSendWindow("2026-11-25T10:55:00Z"), false); // 2:55 AM PST
  assert.equal(isInReminderSendWindow("2026-12-16T11:00:00Z"), false); // 3:00 AM PST
  assert.equal(isInReminderSendWindow("2026-07-16T10:00:00Z"), false); // 3:00 AM PDT
});

test("send window: July PDT and December PST", () => {
  // Same clock time, different UTC offsets (PDT = UTC-7, PST = UTC-8).
  assert.equal(isInReminderSendWindow("2026-07-15T21:00:00Z"), true);  // 2 PM PDT
  assert.equal(isInReminderSendWindow("2026-07-15T22:00:00Z"), true);  // 3 PM PDT
  assert.equal(isInReminderSendWindow("2026-07-15T20:00:00Z"), false); // 1 PM PDT
  assert.equal(isInReminderSendWindow("2026-07-16T03:59:00Z"), true);  // 8:59 PM PDT
  assert.equal(isInReminderSendWindow("2026-07-16T04:00:00Z"), false); // 9:00 PM PDT
  assert.equal(isInReminderSendWindow("2026-12-15T22:00:00Z"), true);  // 2 PM PST
  assert.equal(isInReminderSendWindow("2026-12-15T21:00:00Z"), false); // 1 PM PST (the PDT 2 PM UTC slot)
  assert.equal(isInReminderSendWindow("2026-12-16T04:59:00Z"), true);  // 8:59 PM PST
  assert.equal(isInReminderSendWindow("2026-12-16T05:00:00Z"), false); // 9:00 PM PST
});

test("send window: near the March and November DST transitions", () => {
  // 2026-03-08 spring forward (02:00 PST -> 03:00 PDT). Afternoon is PDT.
  assert.equal(isInReminderSendWindow("2026-03-08T10:00:00Z"), false); // 3:00 AM PDT
  assert.equal(isInReminderSendWindow("2026-03-08T20:59:00Z"), false); // 1:59 PM PDT
  assert.equal(isInReminderSendWindow("2026-03-08T21:00:00Z"), true);  // 2:00 PM PDT
  assert.equal(isInReminderSendWindow("2026-03-09T03:59:00Z"), true);  // 8:59 PM PDT
  assert.equal(isInReminderSendWindow("2026-03-09T04:00:00Z"), false); // 9:00 PM PDT
  // 2026-11-01 fall back (02:00 PDT -> 01:00 PST). Afternoon is PST.
  assert.equal(isInReminderSendWindow("2026-11-01T11:00:00Z"), false); // 3:00 AM PST
  assert.equal(isInReminderSendWindow("2026-11-01T21:59:00Z"), false); // 1:59 PM PST
  assert.equal(isInReminderSendWindow("2026-11-01T22:00:00Z"), true);  // 2:00 PM PST
  assert.equal(isInReminderSendWindow("2026-11-02T04:59:00Z"), true);  // 8:59 PM PST
  assert.equal(isInReminderSendWindow("2026-11-02T05:00:00Z"), false); // 9:00 PM PST
});

test("sender does not claim on a 3 AM Pacific late run", async () => {
  const result = await sendLessonReminders({
    env, now: "2026-11-25T10:55:00Z", claim: fail, canSend: fail, expire: fail, send: fail,
  });
  assert.deepEqual(result, { disabled: false, claimed: 0, sent: 0, failed: 0, skipped: "outside_send_window" });
});

test("sender does not claim before 2 PM or at/after 9 PM Pacific", async () => {
  for (const now of ["2026-12-15T21:59:00Z", "2026-12-16T05:00:00Z", "2026-07-16T04:00:00Z"]) {
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

  // 8:59 PM Pacific is still inside the window; an already-claimed day sends nothing.
  const lateEvening = await sendLessonReminders({
    env, now: "2026-12-16T04:59:00Z",
    claim: async () => { claimed++; return []; },
    canSend: fail, expire: fail, send: fail,
  });
  assert.equal(claimed, 2);
  assert.equal(lateEvening.claimed, 0);

  // A late run the following morning must still not claim, even though the Pacific day changed.
  const late = await sendLessonReminders({
    env, now: "2026-12-16T11:00:00Z", claim: fail, canSend: fail, expire: fail, send: fail,
  });
  assert.equal(late.skipped, "outside_send_window");
  assert.notEqual(reminderDay("2026-12-16T11:00:00Z"), day);
});

test("cron slots plus measured GitHub lag still land in the 2-9 PM Pacific window every day (PST and PDT)", () => {
  // Measured lag on lesson-reminders.yml, 16 runs, Nov 10-25: min 6h40m, max 10h04m.
  // Also cover 0h and 4h, plus a 5-minute sweep across the measured range.
  const lags = measuredLags();
  const days = ["2026-07-15", "2026-12-15"]; // PDT and PST
  for (const day of days) {
    const start = Date.parse(`${day}T00:00:00Z`) - 2 * 24 * HOUR;
    const end = Date.parse(`${day}T00:00:00Z`) + 3 * 24 * HOUR;
    const slots = cronSlotsFromTo(start, end);
    assert.ok(slots.length >= 16, `expected a full day of slots around ${day}`);
    for (const lag of lags) {
      const hits = slots.filter((slot) => {
        const started = slot + lag;
        return reminderDay(started) === day && isInReminderSendWindow(started);
      });
      assert.ok(hits.length >= 1, `lag ${lag / MINUTE}m on ${day}: no slot landed in [14:00, 21:00) LA`);
    }
  }
});

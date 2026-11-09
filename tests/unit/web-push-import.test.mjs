import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("installed web-push exposes sendNotification as a named export", async () => {
  const webpush = await import("web-push");
  assert.equal(typeof webpush.sendNotification, "function");
});

test("send-lesson-reminders uses the web-push namespace, not a default export", () => {
  const src = readFileSync(new URL("../../scripts/send-lesson-reminders.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\{\s*default:\s*webpush\s*\}\s*=\s*await import\("web-push"\)/);
  assert.match(src, /const webpush = await import\("web-push"\)/);
});

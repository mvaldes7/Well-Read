// @ts-check
// Well-Read currently uses America/Los_Angeles for streaks and has no user timezone setting.
export const REMINDER_TIME_ZONE = "America/Los_Angeles";
// Send window in America/Los_Angeles local time: 2 PM inclusive to 6 PM exclusive.
export const REMINDER_WINDOW_START_HOUR = 14;
export const REMINDER_WINDOW_END_HOUR = 18;
// Web Push TTL: how long a provider may hold a notification (4 hours).
export const REMINDER_PUSH_TTL_SECONDS = 4 * 60 * 60;
export const LEARN_PATH = "/learn";
export const APP_ORIGIN = "https://well-read-learn.vercel.app";
export const LEARN_URL = new URL(LEARN_PATH, APP_ORIGIN).href;
// Declarative Web Push format (RFC 8030 magic value). On iOS/iPadOS 18.4+ and macOS Safari the
// browser shows this notification itself and opens `navigate` on tap, with no service worker
// involved; Home Screen apps ignore WindowClient.navigate()/openWindow from notificationclick.
// Other browsers still run public/sw.js, which shows the same fixed text and opens /learn.
export const REMINDER_PAYLOAD = Object.freeze({
  web_push: 8030,
  notification: Object.freeze({
    title: "Well-Read", body: "Take a moment to learn a lesson.", lang: "en-US", dir: "ltr",
    navigate: LEARN_URL, silent: false,
  }),
});

/** @param {Record<string, string | undefined>} env */
export function reminderConfig(env) {
  if (env.WELL_READ_LESSON_REMINDERS !== "1") return null;
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/** @param {Date | string | number} instant */
export function reminderDay(instant) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REMINDER_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(instant));
}

/** Local minutes from midnight in America/Los_Angeles. Pure; pass `now` to inject a clock.
 * @param {Date | string | number} [now] */
export function reminderLocalMinutes(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REMINDER_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(now));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

/** True when `now` is in the 2 PM (inclusive) to 6 PM (exclusive) Pacific send window.
 * @param {Date | string | number} [now] */
export function isInReminderSendWindow(now = Date.now()) {
  const minutes = reminderLocalMinutes(now);
  return minutes >= REMINDER_WINDOW_START_HOUR * 60 && minutes < REMINDER_WINDOW_END_HOUR * 60;
}

/** Mirrors SQL eligibility for unit tests; SQL remains authoritative and reserves before transport.
 * @param {{enabled: boolean, finishedDays: string[], claimedDays: string[], now: Date | string | number}} p */
export function shouldRemind(p) {
  const day = reminderDay(p.now);
  return p.enabled && !p.finishedDays.includes(day) && !p.claimedDays.includes(day);
}

/** Allow only known browser push providers: stored endpoints must never turn the sender into an SSRF proxy.
 * @param {unknown} raw */
export function validPushEndpoint(raw) {
  if (typeof raw !== "string" || raw.length > 2048) return false;
  try {
    const u = new URL(raw);
    const host = u.hostname;
    return u.protocol === "https:" && !u.username && !u.password && !u.port && !u.hash &&
      (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
       host === "web.push.apple.com" || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host));
  } catch { return false; }
}

/** @param {unknown} raw
 * @returns {{endpoint: string, p256dh: string, auth: string} | null} */
export function parseSubscription(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (raw);
  if (!validPushEndpoint(r.endpoint) || typeof r.p256dh !== "string" || typeof r.auth !== "string") return null;
  // Uncompressed P-256 public key (65 bytes) and auth secret (16 bytes), base64url.
  if (!/^B[A-Za-z0-9_-]{86}$/.test(r.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(r.auth)) return null;
  return { endpoint: /** @type {string} */ (r.endpoint), p256dh: r.p256dh, auth: r.auth };
}

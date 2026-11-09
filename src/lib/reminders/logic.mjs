// @ts-check
// Well-Read currently uses America/Los_Angeles for streaks and has no user timezone setting.
export const REMINDER_TIME_ZONE = "America/Los_Angeles";
export const LEARN_PATH = "/learn";
export const REMINDER_PAYLOAD = Object.freeze({
  title: "Well-Read", body: "Take a moment to learn a lesson.", url: LEARN_PATH,
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

// @ts-check
// Friendly, user-facing messages for every Dig deeper outcome (P3). Pure; shared by the route, the page and tests.
// Codes never leak provider or database details.

export const DRILLDOWN_MESSAGES = Object.freeze({
  disabled: "Dig deeper isn't available yet.",
  signed_out: "Sign in to dig deeper.",
  forbidden: "That request wasn't allowed. Reload the page and try again.",
  bad_request: "That request wasn't valid. Reload the page and try again.",
  not_completed: "Finish this lesson's quiz first, then dig deeper.",
  email_unverified: "Confirm your email address to use Dig deeper. Check your inbox for the link.",
  user_cap: "You've used today's Dig deeper lessons. Come back tomorrow for more.",
  global_cap: "Dig deeper is resting for today. Please try again tomorrow.",
  per_minute: "Lots of people are digging deeper right now. Try again in a minute.",
  generation_timeout: "Writing and checking this lesson took too long. No lesson was saved. Please try again later.",
  provider_busy: "The lesson writer is busy right now. Please try again later.",
  billing_stop: "Dig deeper is paused for now. Please try again later.",
  no_sources: "Dig deeper isn't available for this lesson yet: its sources can't be checked automatically.",
  generation_failed: "We couldn't write a lesson we could check against trusted sources this time. Please try a different choice.",
  unavailable: "Dig deeper is unavailable right now. Please try again later.",
});

/** HTTP status per code (the route's response status). */
export const DRILLDOWN_STATUS = Object.freeze({
  disabled: 404, signed_out: 401, forbidden: 403, bad_request: 400, not_completed: 403, email_unverified: 403,
  user_cap: 429, global_cap: 429, per_minute: 429, provider_busy: 503, generation_timeout: 504, billing_stop: 503,
  no_sources: 422, generation_failed: 422, unavailable: 503,
});

/**
 * Map a database error from the drilldown_server functions to a code.
 * WR403 = email not verified; WR429 = a cap ("drilldown cap: user_cap" / user_calls / global_cap / hard_stop / no reservation).
 * @param {unknown} e
 * @returns {keyof typeof DRILLDOWN_MESSAGES}
 */
export function dbErrorCode(e) {
  const err = /** @type {{ code?: unknown, message?: unknown } | null} */ (e && typeof e === "object" ? e : null);
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "");
  if (code === "WR403") return "email_unverified";
  if (code === "WR429") return /user_cap|user_calls|no reservation/.test(msg) ? "user_cap" : "global_cap";
  return "unavailable";
}

/** @param {keyof typeof DRILLDOWN_MESSAGES} code */
export function failure(code) {
  return { status: DRILLDOWN_STATUS[code], body: { ok: false, code, message: DRILLDOWN_MESSAGES[code] } };
}

/**
 * Same-origin check for the route handler (no built-in CSRF check there). Never throws: a missing, "null" or
 * unparseable Origin, or Sec-Fetch-Site: cross-site, is simply not allowed (403).
 * @param {{ get: (name: string) => string | null }} headers @param {string} requestUrl
 */
export function isSameOriginRequest(headers, requestUrl) {
  if (headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    const o = new URL(origin), r = new URL(requestUrl);
    return (o.protocol === "https:" || o.protocol === "http:") && o.host === r.host;
  } catch {
    return false;
  }
}

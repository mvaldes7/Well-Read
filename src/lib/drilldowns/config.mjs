// @ts-check
// Topic drill-downs, P0 groundwork (docs/plans/topic-drilldowns.md). Nothing here calls a provider,
// reads a key, or touches the database. The feature is OFF unless WELL_READ_DRILLDOWNS is exactly "1".
// Server-side only: never expose this flag or any provider key with a NEXT_PUBLIC_ prefix.

/** Free-tier caps (plan section 8). Lowering these is free; raising them needs Mike's approval. */
export const DRILLDOWN_CAPS = Object.freeze({
  perUserLessonsPerDay: 2,
  globalLessonsPerDay: 30,
  /** Hard stop on provider calls per LA day: 20% of the assumed 500 RPD free quota. */
  globalCallsPerDayHardStop: 100,
  globalCallsPerMinute: 4,
  /** Worst-case calls per lesson: generate + fact-check + one retry. */
  callsPerLessonMax: 3,
  maxPromptChars: 200,
});

/**
 * True only when explicitly enabled. Any other value (unset, "true", "0", " 1") is off.
 * @param {Record<string, string | undefined>} env
 */
export function drilldownsEnabled(env) {
  return env.WELL_READ_DRILLDOWNS === "1";
}

/**
 * Graceful hard stop: may another lesson be generated right now?
 * Returns a reason instead of throwing so the UI can show "resting for today".
 * @param {{ userLessonsToday: number, globalLessonsToday: number, globalCallsToday: number, globalCallsThisMinute: number, providerQuotaHit?: boolean }} usage
 * @returns {{ ok: true } | { ok: false, reason: "user_cap" | "global_cap" | "hard_stop" | "per_minute" | "provider_quota" }}
 */
export function canGenerateLesson(usage) {
  const c = DRILLDOWN_CAPS;
  if (usage.providerQuotaHit) return { ok: false, reason: "provider_quota" };
  if (usage.globalCallsToday + c.callsPerLessonMax > c.globalCallsPerDayHardStop) return { ok: false, reason: "hard_stop" };
  if (usage.globalLessonsToday >= c.globalLessonsPerDay) return { ok: false, reason: "global_cap" };
  if (usage.userLessonsToday >= c.perUserLessonsPerDay) return { ok: false, reason: "user_cap" };
  if (usage.globalCallsThisMinute + c.callsPerLessonMax > c.globalCallsPerMinute) return { ok: false, reason: "per_minute" };
  return { ok: true };
}

/** Visible label on every generated lesson (plan section 4.6). */
export const AI_GENERATED_LABEL = "AI-generated";

/** Lifecycle (plan section 4.6): only Mike moves a lesson to "published". */
export const GENERATED_STATUSES = Object.freeze(["private", "published", "rejected", "flagged"]);

/**
 * Fact-check pass rule (plan section 4.3), decided by Mike 2026-11-02:
 * - 0 unconfirmed key facts / quiz answers: "pass".
 * - exactly 1 unconfirmed: "pass_flagged": delivered to the requesting user (private, AI-generated label) and
 *   flagged for Mike's review, recording which claim and why.
 * - 2 or more: "reject": regenerate only within callsPerLessonMax, otherwise fail gracefully.
 */
export const FACTCHECK_RULE = Object.freeze({ maxUnconfirmedToDeliver: 1 });

/**
 * @param {number} unconfirmed count of unconfirmed items (an incomplete fact check counts as rejected by the caller)
 * @returns {"pass" | "pass_flagged" | "reject"}
 */
export function factCheckOutcome(unconfirmed) {
  if (!Number.isInteger(unconfirmed) || unconfirmed < 0) return "reject";
  if (unconfirmed === 0) return "pass";
  return unconfirmed <= FACTCHECK_RULE.maxUnconfirmedToDeliver ? "pass_flagged" : "reject";
}

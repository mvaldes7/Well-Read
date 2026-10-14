// @ts-check
// Day streaks (TSK-016). Pure. Activity instants are bucketed into calendar days in the fixed
// America/Los_Angeles zone (laDayKey, the same zone as achievement dates and the 7-day chart),
// on the server. Day arithmetic is done on the "YYYY-MM-DD" key in UTC, so DST never shifts it.

import { laDayKey } from "../progress/dashboard.mjs";

export const ACTIVITY_TABLE = "activity_log";

/** @param {string} key "YYYY-MM-DD" @returns {number} days since the epoch */
const dayNumber = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

/**
 * Current and best streak from activity instants.
 * - A day is active if it has at least one activity (any kind).
 * - current: consecutive active days ending TODAY, or ending YESTERDAY when today has no
 *   activity yet (the streak is still alive until today ends); otherwise 0.
 * - best: the longest run of consecutive active days ever (>= current).
 * Unparseable or missing instants are ignored. Activity dated after today (clock skew) counts
 * on its own day but can't extend "current" past today.
 * @param {ReadonlyArray<string | number | null | undefined>} instants ISO strings or epoch ms
 * @param {number} [now] epoch ms; defaults to the current time (tests pass a fixed value)
 * @returns {{ current: number, best: number, activeToday: boolean }}
 */
export function computeStreaks(instants, now = Date.now()) {
  const days = new Set();
  for (const at of instants) {
    const key = laDayKey(at);
    if (key) days.add(dayNumber(key));
  }
  const today = dayNumber(/** @type {string} */ (laDayKey(now)));
  const sorted = [...days].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  const activeToday = days.has(today);
  let current = 0;
  for (let d = activeToday ? today : today - 1; days.has(d); d--) current++;
  return { current, best, activeToday };
}

/**
 * True when a PostgREST/Postgres error means "this table doesn't exist" (migration not applied):
 * PGRST205 (table not in PostgREST's schema cache) or 42P01 (undefined_table). When the error
 * has a message it must name the table, so unrelated errors aren't mistaken for it.
 * @param {{ code?: string | null, message?: string | null } | null | undefined} error
 * @param {string} [table]
 */
export function isMissingTableError(error, table = ACTIVITY_TABLE) {
  if (!error || (error.code !== "PGRST205" && error.code !== "42P01")) return false;
  return typeof error.message !== "string" || error.message === "" || error.message.includes(table);
}

/** @param {number} n */
export const daysLabel = (n) => `${n} ${n === 1 ? "day" : "days"}`;

/**
 * Append one activity row with the given (user's own session) client. Never throws: a missing
 * table (migration not applied) returns "unavailable" without logging; any other error or
 * exception is logged by code only and returns "failed". `rethrow` lets the server wrapper
 * re-throw Next's internal control-flow errors (unstable_rethrow) before swallowing.
 * @param {{ from: (table: string) => { insert: (row: object) => PromiseLike<{ error: { code?: string | null, message?: string | null } | null }> } }} supabase
 * @param {string} userId
 * @param {"lesson_passed" | "quiz_attempt"} kind
 * @param {string} ref permanent lesson id
 * @param {(err: unknown) => void} [rethrow]
 * @returns {Promise<"logged" | "unavailable" | "failed">}
 */
export async function insertActivity(supabase, userId, kind, ref, rethrow = () => {}) {
  try {
    const { error } = await supabase.from(ACTIVITY_TABLE).insert({ user_id: userId, kind, ref });
    if (!error) return "logged";
    if (isMissingTableError(error)) return "unavailable";
    console.error(`activity_log insert failed (${error.code ?? "unknown"})`);
    return "failed";
  } catch (err) {
    rethrow(err);
    console.error("activity_log insert failed (exception)");
    return "failed";
  }
}

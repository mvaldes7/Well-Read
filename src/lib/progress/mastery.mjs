// @ts-check
// Per-discipline mastery (TSK-019). Pure. n = the discipline's count of DISTINCT passed lessons
// whose ids exist in content, across all its topics. Computed from content + completions on every
// request, so lessons added to content count automatically. Nothing is stored (REV-007).

/** Tiers in order; `min` is the passed-lesson count that reaches the tier. */
export const MASTERY_TIERS = Object.freeze([
  Object.freeze({ name: "Novice", min: 1 }),
  Object.freeze({ name: "Apprentice", min: 5 }),
  Object.freeze({ name: "Scholar", min: 10 }),
  Object.freeze({ name: "Luminary", min: 20 }),
]);

/** Shown instead of a tier name below Novice. */
export const NOT_STARTED = "Not started";

/**
 * @typedef {{
 *   passed: number,             // n after clamping
 *   tier: string | null,        // current tier name; null below Novice
 *   tierIndex: number,          // 0 = not started, 1..4 = Novice..Luminary
 *   next: { name: string, min: number } | null, // next tier; null at Luminary
 *   toward: number,             // n, counted toward next.min (0 when next is null)
 *   needed: number,             // next.min (0 when next is null)
 *   remaining: number           // lessons still needed for the next tier (0 when next is null)
 * }} MasteryInfo
 */

/**
 * Tier for n distinct passed lessons. Bad input is clamped, never thrown on: non-numbers, NaN,
 * ±Infinity and negatives count as 0; fractions are floored.
 * @param {unknown} n
 * @returns {MasteryInfo}
 */
export function masteryFor(n) {
  const k = typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  let tierIndex = 0;
  for (const [i, t] of MASTERY_TIERS.entries()) if (k >= t.min) tierIndex = i + 1;
  const next = MASTERY_TIERS[tierIndex] ?? null;
  return {
    passed: k,
    tier: tierIndex === 0 ? null : MASTERY_TIERS[tierIndex - 1].name,
    tierIndex,
    next: next ? { name: next.name, min: next.min } : null,
    toward: next ? k : 0,
    needed: next ? next.min : 0,
    remaining: next ? next.min - k : 0,
  };
}

/**
 * The card line: "0 lessons · Not started", "1 lesson · Novice", "12 lessons · Scholar".
 * @param {MasteryInfo} info
 */
export function masteryLine(info) {
  return `${info.passed} ${info.passed === 1 ? "lesson" : "lessons"} · ${info.tier ?? NOT_STARTED}`;
}

/**
 * Next-tier hint: "3/5 to Apprentice"; "Highest tier reached" at Luminary.
 * @param {MasteryInfo} info
 */
export function nextTierText(info) {
  if (!info.next) return "Highest tier reached";
  return `${info.toward}/${info.needed} to ${info.next.name}`;
}

/**
 * Distinct passed lessons of one discipline (all topics), counting only content lessons.
 * @param {{ topics: ReadonlyArray<{ lessons: ReadonlyArray<{ id: string }> }> }} discipline
 * @param {ReadonlyMap<string, { passed: boolean }>} lookup per-lesson best (completionLookup / bestCompletions)
 */
export function passedInDiscipline(discipline, lookup) {
  let n = 0;
  for (const t of discipline.topics) for (const l of t.lessons) if (lookup.get(l.id)?.passed === true) n++;
  return n;
}

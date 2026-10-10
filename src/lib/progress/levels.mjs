// @ts-check
// Per-topic levels (AC-4). Pure; n = the topic's count of DISTINCT passed lessons whose
// ids exist in content (see passedInTopic / buildBookshelf, which use the deduped lookup).

export const LESSONS_PER_LEVEL = 5;

/**
 * @typedef {{
 *   level: number | null,   // null = no level yet (n = 0)
 *   passed: number,         // n after clamping
 *   toward: number,         // lessons counted toward the next level
 *   needed: number,         // lessons the next level needs in this step
 *   nextLevel: number
 * }} LevelInfo
 */

/**
 * Level for n distinct passed lessons: n = 0 -> null, else 1 + floor(n / 5).
 * Progress toward the next level is n % 5 out of 5 (n = 3 -> 3/5 to Level 2; n = 5 -> 0/5 to Level 3).
 * At n = 0 the next step is a single lesson: toward 0, needed 1, next Level 1.
 * Inputs are clamped, never thrown on: non-numbers, NaN, ±Infinity and negatives count
 * as 0; fractions are floored (so 4.9 -> 4).
 * @param {unknown} n
 * @returns {LevelInfo}
 */
export function levelFor(n) {
  const k = typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (k === 0) return { level: null, passed: 0, toward: 0, needed: 1, nextLevel: 1 };
  const level = 1 + Math.floor(k / LESSONS_PER_LEVEL);
  return { level, passed: k, toward: k % LESSONS_PER_LEVEL, needed: LESSONS_PER_LEVEL, nextLevel: level + 1 };
}

/**
 * Progress line for the topic page. n = 0 reads "Pass a lesson to reach Level 1"
 * (clearer than "0/1 to Level 1"); otherwise "3/5 to Level 2".
 * @param {LevelInfo} info
 */
export function levelProgressText(info) {
  if (info.level === null) return "Pass a lesson to reach Level 1";
  return `${info.toward}/${info.needed} to Level ${info.nextLevel}`;
}

/**
 * Distinct passed lessons of one topic, counting only the topic's content lessons.
 * @param {{ lessons: ReadonlyArray<{ id: string }> }} topic
 * @param {ReadonlyMap<string, { passed: boolean }>} lookup per-lesson best (completionLookup)
 */
export function passedInTopic(topic, lookup) {
  return topic.lessons.filter((l) => lookup.get(l.id)?.passed === true).length;
}

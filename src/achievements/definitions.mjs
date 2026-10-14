// @ts-check
// Achievements (AC-6): the ONE place they are defined. Each definition is data plus a pure
// evaluator over the user's best completions (from lesson_completions) and static content.
// Nothing is stored: achievements are recomputed on the server for every request.
//
// To add one: append a definition to ACHIEVEMENTS (kind "single"), or a generator over
// disciplines (kind "perDiscipline"). Ids must stay unique.
// Ids are UI-only keys derived from content slugs (e.g. "mastery:art-history", "completionist:art-history"); they are never
// stored or sent to the database (REV-007).
//
// Mastery (TSK-019): one achievement per discipline, at its current tier (see
// lib/progress/mastery.mjs). Its date is the date of the Nth lesson first passed in that
// discipline, N = the tier's threshold (Novice 1st, Apprentice 5th, Scholar 10th, Luminary 20th).
//
// Dates. Each passed lesson is dated by:
// - first_passed_at when present: the EXACT time of the first pass (TSK-012), or else
// - completed_at: rewritten whenever a better attempt is saved, so it is the time of the BEST
//   attempt, never earlier than the real pass: an upper bound.
// An achievement needing k passed lessons uses the k-th earliest date among the qualifying
// lessons ("pass any" = earliest; "all of" = latest). The result is exact only when EVERY
// qualifying lesson has an exact first_passed_at (an upper-bound row could really be earlier and
// change the order); otherwise it is an upper bound. Rows without any date are skipped; if fewer
// than k dated rows qualify, there is no date.
// Perfect Score is the exception: its event is the first perfect attempt, not the first pass, so
// it keeps using completed_at (shown as an upper bound).
// The UI says "Earned <date>" when exact and "Earned by <date>" for an upper bound, formatted on
// the server in America/Los_Angeles.

import { bestCompletions } from "../lib/progress/logic.mjs";
import { MASTERY_TIERS, masteryFor, nextTierText, passedInDiscipline } from "../lib/progress/mastery.mjs";

/** @typedef {import("../lib/progress/logic.mjs").ContentDiscipline} ContentDiscipline */
/** @typedef {import("../lib/progress/logic.mjs").DatedCompletion} DatedCompletion */

/**
 * Evaluation context, built once per request by evaluateAchievements.
 * @typedef {{
 *   disciplines: ReadonlyArray<ContentDiscipline>,
 *   best: ReadonlyMap<string, DatedCompletion>
 * }} Ctx
 */

/**
 * @typedef {{
 *   id: string,
 *   group: "milestones" | "mastery" | "completionist",
 *   title: string,
 *   requirement: string,
 *   earned: boolean,
 *   earnedAt: string | null,  // ISO date (see top of file), or null when not derivable
 *   earnedExact: boolean,     // true: exact moment ("Earned"); false: upper bound ("Earned by")
 *   tier: number | null,      // mastery: current tier index 1..4 (Novice..Luminary); else null
 *   progress: string | null   // short progress hint for locked or tiered ones
 * }} AchievementResult
 */

/**
 * @typedef {{ kind: "single", id: string, group: AchievementResult["group"], evaluate: (ctx: Ctx) => Omit<AchievementResult, "id" | "group"> }
 *   | { kind: "perDiscipline", id: (d: ContentDiscipline) => string, group: AchievementResult["group"], evaluate: (ctx: Ctx, d: ContentDiscipline) => Omit<AchievementResult, "id" | "group"> }
 * } AchievementDef
 */

// ---------- helpers (pure) ----------

/** @param {ContentDiscipline} d */
const lessonsOf = (d) => d.topics.flatMap((t) => t.lessons);

/**
 * Passed best completions for the given lesson ids.
 * @param {Ctx} ctx
 * @param {ReadonlyArray<{ id: string }>} lessons
 */
function passedAmong(ctx, lessons) {
  /** @type {DatedCompletion[]} */
  const out = [];
  for (const l of lessons) {
    const c = ctx.best.get(l.id);
    if (c?.passed) out.push(c);
  }
  return out;
}

/** @typedef {{ at: string | null, exact: boolean }} EarnedDate */
const NO_DATE = Object.freeze({ at: null, exact: false });

/**
 * A passed completion's date: exact first pass when recorded, else the completed_at upper bound.
 * @param {{ completedAt: string | null, firstPassedAt?: string | null }} c
 * @returns {EarnedDate}
 */
export function passDate(c) {
  if (c.firstPassedAt) return { at: c.firstPassedAt, exact: true };
  return { at: c.completedAt, exact: false };
}

/**
 * k-th earliest date (1-based) among the given dates; exact only if every date is exact.
 * Undated entries are skipped (and make the result inexact); fewer than k dated gives no date.
 * @param {ReadonlyArray<EarnedDate>} dates
 * @param {number} k
 * @returns {EarnedDate}
 */
export function kthEarliestDate(dates, k) {
  const dated = dates.filter((d) => d.at !== null).map((d) => /** @type {string} */ (d.at)).sort();
  if (k < 1 || dated.length < k) return NO_DATE;
  return { at: dated[k - 1], exact: dates.every((d) => d.exact && d.at !== null) };
}

/**
 * k-th earliest pass among completions (see top of file).
 * @param {ReadonlyArray<{ completedAt: string | null, firstPassedAt?: string | null }>} completions
 * @param {number} k
 */
export const kthEarliest = (completions, k) => kthEarliestDate(completions.map(passDate), k);

/**
 * Latest of several dates; no date if any is missing (can't bound the "all of" moment).
 * @param {ReadonlyArray<EarnedDate>} dates
 * @returns {EarnedDate}
 */
function latestOf(dates) {
  if (dates.length === 0 || dates.some((d) => d.at === null)) return NO_DATE;
  return kthEarliestDate(dates, dates.length);
}

/** @param {boolean} earned @param {EarnedDate} date @param {string} title @param {string} requirement @param {string | null} [progress] */
const result = (earned, date, title, requirement, progress = null) => ({
  earned,
  earnedAt: earned ? date.at : null,
  earnedExact: earned && date.at !== null ? date.exact : false,
  title,
  requirement,
  tier: null,
  progress,
});

/** @param {number} tierIndex 1-based @param {string} title */
function tierRequirement(tierIndex, title) {
  const n = MASTERY_TIERS[tierIndex - 1].min;
  return `Pass ${n} ${n === 1 ? "lesson" : "lessons"} in ${title}.`;
}

/**
 * Completionist: every lesson in the set passed; date = latest pass (no date if any is undated).
 * @param {Ctx} ctx @param {ReadonlyArray<{ id: string }>} lessons @param {string} title
 */
function completionist(ctx, lessons, title) {
  const passed = passedAmong(ctx, lessons);
  const earned = lessons.length > 0 && passed.length === lessons.length;
  return result(earned, latestOf(passed.map(passDate)), `Completionist: ${title}`, `Pass every lesson in ${title}.`, earned ? null : `${passed.length}/${lessons.length} lessons`);
}

// ---------- definitions ----------

/** @type {ReadonlyArray<AchievementDef>} */
export const ACHIEVEMENTS = Object.freeze([
  {
    kind: "single",
    id: "first-lesson",
    group: "milestones",
    evaluate: (ctx) => {
      const passed = passedAmong(ctx, ctx.disciplines.flatMap(lessonsOf));
      return result(passed.length > 0, kthEarliest(passed, 1), "First Lesson", "Pass any lesson.");
    },
  },
  {
    kind: "single",
    id: "perfect-score",
    group: "milestones",
    evaluate: (ctx) => {
      const perfect = passedAmong(ctx, ctx.disciplines.flatMap(lessonsOf)).filter((c) => c.score === c.total);
      // completed_at, not first_passed_at: the event is the first perfect attempt (see top of file).
      const date = kthEarliestDate(perfect.map((c) => ({ at: c.completedAt, exact: false })), 1);
      return result(perfect.length > 0, date, "Perfect Score", "Get every question right on a lesson quiz.");
    },
  },
  {
    kind: "single",
    id: "discipline-explorer",
    group: "milestones",
    evaluate: (ctx) => {
      const perDiscipline = ctx.disciplines.map((d) => passedAmong(ctx, lessonsOf(d)));
      const reached = perDiscipline.filter((p) => p.length > 0).length;
      const earned = ctx.disciplines.length > 0 && reached === ctx.disciplines.length;
      // Earned once the last discipline got its first pass: latest of each discipline's earliest.
      const date = latestOf(perDiscipline.map((p) => kthEarliest(p, 1)));
      return result(earned, date, "Discipline Explorer", "Pass a lesson in every discipline.", earned ? null : `${reached}/${ctx.disciplines.length} disciplines`);
    },
  },
  {
    kind: "perDiscipline",
    id: (d) => `mastery:${d.slug}`,
    group: "mastery",
    evaluate: (ctx, d) => {
      const passed = passedAmong(ctx, lessonsOf(d));
      const info = masteryFor(passedInDiscipline(d, ctx.best));
      const first = MASTERY_TIERS[0].name;
      if (info.tier === null) {
        return result(false, NO_DATE, `${d.title}: ${first}`, `Pass a lesson in ${d.title}.`, nextTierText(info));
      }
      // Tier date: the Nth earliest first pass in the discipline, N = the tier's threshold.
      const date = kthEarliest(passed, MASTERY_TIERS[info.tierIndex - 1].min);
      return {
        ...result(true, date, `${d.title}: ${info.tier}`, tierRequirement(info.tierIndex, d.title), nextTierText(info)),
        tier: info.tierIndex,
      };
    },
  },
  {
    kind: "perDiscipline",
    id: (d) => `completionist:${d.slug}`,
    group: "completionist",
    evaluate: (ctx, d) => completionist(ctx, lessonsOf(d), d.title),
  },
]);

/**
 * Evaluate every achievement for the user's rows. Pure: same input, same output.
 * Order: definition order; generated ones follow content order.
 * @param {ReadonlyArray<unknown>} rows raw lesson_completions rows (malformed/unknown ignored)
 * @param {ReadonlyArray<ContentDiscipline>} disciplines
 * @param {ReadonlyArray<AchievementDef>} [defs]
 * @returns {AchievementResult[]}
 */
export function evaluateAchievements(rows, disciplines, defs = ACHIEVEMENTS) {
  /** @type {Ctx} */
  const ctx = { disciplines, best: bestCompletions(rows, disciplines) };
  /** @type {AchievementResult[]} */
  const out = [];
  for (const def of defs) {
    if (def.kind === "single") out.push({ id: def.id, group: def.group, ...def.evaluate(ctx) });
    else for (const d of disciplines) out.push({ id: def.id(d), group: def.group, ...def.evaluate(ctx, d) });
  }
  return out;
}

/** Display time zone for achievement dates (rendered on the server). */
export const DATE_TIME_ZONE = "America/Los_Angeles";

/**
 * "Oct 10, 2026" in en-US, in America/Los_Angeles, independent of the server's TZ.
 * @param {string | null} iso
 * @returns {string | null}
 */
export function formatEarnedDate(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: DATE_TIME_ZONE, year: "numeric", month: "short", day: "numeric" }).format(new Date(t));
}

/**
 * The visible date line for an achievement: "Earned <date>" when exact, "Earned by <date>"
 * for an upper bound, "Earned" without a date, "Locked" when not earned.
 * @param {Pick<AchievementResult, "earned" | "earnedAt" | "earnedExact">} a
 */
export function earnedLabel(a) {
  if (!a.earned) return "Locked";
  const date = formatEarnedDate(a.earnedAt);
  if (!date) return "Earned";
  return a.earnedExact ? `Earned ${date}` : `Earned by ${date}`;
}

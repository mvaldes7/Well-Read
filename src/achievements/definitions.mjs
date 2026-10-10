// @ts-check
// Achievements (AC-6): the ONE place they are defined. Each definition is data plus a pure
// evaluator over the user's best completions (from lesson_completions) and static content.
// Nothing is stored: achievements are recomputed on the server for every request.
//
// To add one: append a definition to ACHIEVEMENTS (kind "single"), or a generator over
// topics/disciplines (kind "perTopic" / "perDiscipline"). Ids must stay unique.
//
// Dates ("Earned by"): lesson_completions.completed_at is rewritten whenever a better attempt
// is saved, so it is the time of the BEST attempt, never earlier than the real pass. Each
// date below is therefore an upper bound on when the achievement was really earned:
// - needs k passed lessons -> the k-th earliest completed_at among the qualifying lessons
//   ("pass any" = earliest; "all of" = latest). Rows without a date are skipped; if fewer
//   than k dated rows qualify, there is no date.
// The UI says "Earned by <date>", formatted on the server in America/Los_Angeles.

import { bestCompletions } from "../lib/progress/logic.mjs";
import { levelFor, passedInTopic } from "../lib/progress/levels.mjs";

/** @typedef {import("../lib/progress/logic.mjs").ContentDiscipline} ContentDiscipline */
/** @typedef {import("../lib/progress/logic.mjs").DatedCompletion} DatedCompletion */
/** @typedef {ContentDiscipline["topics"][number]} ContentTopic */

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
 *   group: "milestones" | "topics" | "disciplines",
 *   title: string,
 *   requirement: string,
 *   earned: boolean,
 *   earnedBy: string | null,  // ISO upper bound (see top of file), or null when not derivable
 *   tier: number | null,      // current tier for tiered achievements (topic level)
 *   progress: string | null   // short progress hint for locked or tiered ones
 * }} AchievementResult
 */

/**
 * @typedef {{ kind: "single", id: string, group: AchievementResult["group"], evaluate: (ctx: Ctx) => Omit<AchievementResult, "id" | "group"> }
 *   | { kind: "perTopic", id: (d: ContentDiscipline, t: ContentTopic) => string, group: AchievementResult["group"], evaluate: (ctx: Ctx, d: ContentDiscipline, t: ContentTopic) => Omit<AchievementResult, "id" | "group"> }
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

/**
 * k-th earliest completedAt (1-based) among completions; null if fewer than k are dated.
 * @param {ReadonlyArray<{ completedAt: string | null }>} completions
 * @param {number} k
 * @returns {string | null}
 */
export function kthEarliest(completions, k) {
  const dates = completions.map((c) => c.completedAt).filter((d) => d !== null).sort();
  return k >= 1 && dates.length >= k ? /** @type {string} */ (dates[k - 1]) : null;
}

/** Latest of several ISO dates; null if any is null (can't bound the "all of" moment). */
/** @param {ReadonlyArray<string | null>} dates */
function latestOf(dates) {
  if (dates.length === 0 || dates.some((d) => d === null)) return null;
  return /** @type {string[]} */ (dates).slice().sort().at(-1) ?? null;
}

/** @param {boolean} earned @param {string | null} earnedBy @param {string} title @param {string} requirement @param {string | null} [progress] */
const result = (earned, earnedBy, title, requirement, progress = null) => ({ earned, earnedBy: earned ? earnedBy : null, title, requirement, tier: null, progress });

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
      return result(perfect.length > 0, kthEarliest(perfect, 1), "Perfect Score", "Get every question right on a lesson quiz.");
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
    kind: "perTopic",
    id: (d, t) => `topic-level:${d.slug}/${t.slug}`,
    group: "topics",
    evaluate: (ctx, _d, t) => {
      const passed = passedAmong(ctx, t.lessons);
      const info = levelFor(passedInTopic(t, ctx.best));
      if (info.level === null) return { ...result(false, null, `${t.title}: Level 1`, `Pass a lesson in ${t.title}`), progress: `0/${t.lessons.length} lessons` };
      // The current tier needed max(1, 5 * (level - 1)) passed lessons.
      const k = Math.max(1, 5 * (info.level - 1));
      return {
        earned: true,
        earnedBy: kthEarliest(passed, k),
        title: `${t.title}: Level ${info.level}`,
        requirement: `Pass a lesson in ${t.title}`,
        tier: info.level,
        progress: `${info.toward}/${info.needed} to Level ${info.nextLevel}`,
      };
    },
  },
  {
    kind: "perDiscipline",
    id: (d) => `completionist:${d.slug}`,
    group: "disciplines",
    evaluate: (ctx, d) => {
      const lessons = lessonsOf(d);
      const passed = passedAmong(ctx, lessons);
      const earned = lessons.length > 0 && passed.length === lessons.length;
      return result(earned, latestOf(passed.map((c) => c.completedAt)), `Completionist: ${d.title}`, `Pass every lesson in ${d.title}.`, earned ? null : `${passed.length}/${lessons.length} lessons`);
    },
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
    else if (def.kind === "perTopic") {
      for (const d of disciplines) for (const t of d.topics) out.push({ id: def.id(d, t), group: def.group, ...def.evaluate(ctx, d, t) });
    } else {
      for (const d of disciplines) out.push({ id: def.id(d), group: def.group, ...def.evaluate(ctx, d) });
    }
  }
  return out;
}

/** Display time zone for "Earned by" dates (rendered on the server). */
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

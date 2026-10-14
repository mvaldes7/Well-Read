// @ts-check
// Dashboard + progress-page data (TSK-015). Pure: content + the user's completion rows in,
// plain numbers out. Nothing is stored. Day buckets use the same fixed zone as achievement
// dates (DATE_TIME_ZONE, America/Los_Angeles), so a lesson's day matches its "Earned" date.

import { DATE_TIME_ZONE, evaluateAchievements, passDate } from "../../achievements/definitions.mjs";
import { bestCompletions } from "./logic.mjs";
import { masteryFor, passedInDiscipline } from "./mastery.mjs";

/** @typedef {import("./logic.mjs").ContentDiscipline} ContentDiscipline */
/**
 * Content shape used here: lessons need a slug and title for links.
 * @typedef {{ slug: string, title: string, color: string, topics: ReadonlyArray<{ slug: string, title: string, lessons: ReadonlyArray<{ id: string, slug: string, title: string }> }> }} LinkedDiscipline
 */

/**
 * The next lesson to open for a discipline: the first unpassed lesson in content order
 * ("continue"; "start" when nothing in it is passed yet), or, when every lesson is passed,
 * the discipline page ("review"). A discipline with no lessons gets its page ("review").
 * @param {LinkedDiscipline} d
 * @param {ReadonlyMap<string, { passed: boolean }>} lookup
 * @returns {{ kind: "start" | "continue" | "review", href: string, lessonTitle: string | null }}
 */
export function nextStep(d, lookup) {
  let anyPassed = false;
  /** @type {{ href: string, title: string } | null} */
  let first = null;
  for (const t of d.topics) {
    for (const l of t.lessons) {
      if (lookup.get(l.id)?.passed === true) anyPassed = true;
      else if (!first) first = { href: `/d/${d.slug}/${t.slug}/${l.slug}`, title: l.title };
    }
  }
  if (!first) return { kind: "review", href: `/d/${d.slug}`, lessonTitle: null };
  return { kind: anyPassed ? "continue" : "start", href: first.href, lessonTitle: first.title };
}

/**
 * Stat cards + one card per discipline.
 * @param {ReadonlyArray<unknown>} rows raw lesson_completions rows
 * @param {ReadonlyArray<LinkedDiscipline>} disciplines
 */
export function dashboardData(rows, disciplines) {
  const best = bestCompletions(rows, /** @type {ReadonlyArray<ContentDiscipline>} */ (disciplines));
  const achievements = evaluateAchievements(rows, /** @type {ReadonlyArray<ContentDiscipline>} */ (disciplines));
  const perDiscipline = disciplines.map((d) => {
    const total = d.topics.reduce((n, t) => n + t.lessons.length, 0);
    const passed = passedInDiscipline(d, best);
    return { slug: d.slug, title: d.title, color: d.color, passed, total, mastery: masteryFor(passed), next: nextStep(d, best) };
  });
  return {
    lessons: { passed: perDiscipline.reduce((n, d) => n + d.passed, 0), total: perDiscipline.reduce((n, d) => n + d.total, 0) },
    badges: { earned: achievements.filter((a) => a.earned).length, total: achievements.length },
    disciplines: { started: perDiscipline.filter((d) => d.passed > 0).length, total: disciplines.length },
    perDiscipline,
    achievements,
  };
}

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: DATE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * Calendar day ("YYYY-MM-DD") of an instant in America/Los_Angeles; null when unparseable.
 * @param {string | number | null | undefined} at ISO string or epoch ms
 */
export function laDayKey(at) {
  if (at === null || at === undefined) return null;
  const t = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(t)) return null;
  return dayKeyFormat.format(new Date(t));
}

/**
 * The last 7 LA calendar days ending today (oldest first), each with the number of lessons
 * FIRST passed that day. Each lesson counts once, on its pass date (first_passed_at when
 * recorded, else completed_at: the same date the achievements use). Calendar arithmetic is
 * done on the date key, so DST changes don't shift buckets.
 * @param {ReadonlyArray<unknown>} rows
 * @param {ReadonlyArray<ContentDiscipline>} disciplines
 * @param {number} [now] epoch ms; defaults to the current time (tests pass a fixed value)
 * @returns {{ key: string, label: string, count: number, isToday: boolean }[]}
 */
export function last7Days(rows, disciplines, now = Date.now()) {
  const today = /** @type {string} */ (laDayKey(now));
  const [y, m, d] = today.split("-").map(Number);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1, d - (6 - i)));
    const key = date.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(date);
    return { key, label, count: 0, isToday: i === 6 };
  });
  const index = new Map(days.map((x, i) => [x.key, i]));
  for (const c of bestCompletions(rows, disciplines).values()) {
    if (!c.passed) continue;
    const key = laDayKey(passDate(c).at);
    const i = key === null ? undefined : index.get(key);
    if (i !== undefined) days[i].count++;
  }
  return days;
}

/**
 * Bar heights: each value as a percentage of the largest (0 when all are 0).
 * @param {ReadonlyArray<number>} values
 */
export function barPercents(values) {
  const max = Math.max(0, ...values);
  return values.map((v) => (max === 0 ? 0 : Math.round((v / max) * 100)));
}

// @ts-check
// Pure progress logic: completion rows (from Supabase, RLS-scoped to the user)
// + static content -> per-lesson lookup and bookshelf. Plain ESM + JSDoc so
// node:test can import it; type-checked by tsc via allowJs.

import { shouldReplace } from "../quiz/logic.mjs";

/** @typedef {{ lesson_id: string, score: number, total: number, passed: boolean }} CompletionRow */
/** @typedef {{ score: number, total: number, passed: boolean }} Completion */
/** @typedef {{ id: string }} ContentLesson */
/** @typedef {{ slug: string, title: string, lessons: ReadonlyArray<ContentLesson> }} ContentTopic */
/** @typedef {{ slug: string, title: string, color: string, topics: ReadonlyArray<ContentTopic> }} ContentDiscipline */
/**
 * @typedef {{
 *   disciplineSlug: string, disciplineTitle: string,
 *   topicSlug: string, topicTitle: string,
 *   passedCount: number, lessonCount: number, href: string
 * }} Book
 */
/**
 * @typedef {{
 *   discipline: { slug: string, title: string, color: string },
 *   books: Book[]
 * }} BookshelfGroup
 */

/**
 * Keep only well-formed rows. Anything else from the DB is dropped, not trusted.
 * @param {unknown} row
 * @returns {row is CompletionRow}
 */
export function isCompletionRow(row) {
  if (!row || typeof row !== "object") return false;
  const r = /** @type {Record<string, unknown>} */ (row);
  return (
    typeof r.lesson_id === "string" &&
    Number.isInteger(r.score) &&
    Number.isInteger(r.total) &&
    typeof r.passed === "boolean" &&
    /** @type {number} */ (r.total) > 0
  );
}

/**
 * Per-lesson best completion, restricted to lesson ids that exist in content.
 * Duplicate rows for one lesson (shouldn't happen given the PK) are merged
 * defensively with the same best-attempt rule used when saving.
 * @param {ReadonlyArray<unknown>} rows
 * @param {ReadonlyArray<ContentDiscipline>} disciplines
 * @returns {Map<string, Completion>}
 */
export function completionLookup(rows, disciplines) {
  const known = new Set(disciplines.flatMap((d) => d.topics.flatMap((t) => t.lessons.map((l) => l.id))));
  /** @type {Map<string, Completion>} */
  const map = new Map();
  for (const row of rows) {
    if (!isCompletionRow(row) || !known.has(row.lesson_id)) continue;
    const attempt = { score: row.score, total: row.total, passed: row.passed };
    if (shouldReplace(map.get(row.lesson_id), attempt)) map.set(row.lesson_id, attempt);
  }
  return map;
}

/**
 * Bookshelf grouped by discipline: one book per topic with at least one passed
 * lesson. Groups follow discipline content order and books follow topic content
 * order (same as the browse pages). Disciplines with nothing passed are omitted.
 * Every book in a group shares the discipline's cover color token.
 * @param {ReadonlyArray<unknown>} rows
 * @param {ReadonlyArray<ContentDiscipline>} disciplines
 * @returns {BookshelfGroup[]}
 */
export function buildBookshelf(rows, disciplines) {
  const lookup = completionLookup(rows, disciplines);
  /** @type {BookshelfGroup[]} */
  const groups = [];
  for (const d of disciplines) {
    /** @type {Book[]} */
    const books = [];
    for (const t of d.topics) {
      const passedCount = t.lessons.filter((l) => lookup.get(l.id)?.passed === true).length;
      if (passedCount === 0) continue;
      books.push({
        disciplineSlug: d.slug,
        disciplineTitle: d.title,
        topicSlug: t.slug,
        topicTitle: t.title,
        passedCount,
        lessonCount: t.lessons.length,
        href: `/d/${d.slug}/${t.slug}`,
      });
    }
    if (books.length) groups.push({ discipline: { slug: d.slug, title: d.title, color: d.color }, books });
  }
  return groups;
}

/**
 * Accessible label for a book link, including the count.
 * @param {Book} book
 */
export function bookLabel(book) {
  const n = book.passedCount;
  return `${book.topicTitle} (${book.disciplineTitle}): ${n} ${n === 1 ? "lesson" : "lessons"} completed`;
}

/**
 * Message shown after a quiz save.
 * @param {"saved" | "kept" | "failed"} save
 * @param {boolean} passed
 */
export function saveMessage(save, passed) {
  if (save === "failed") {
    return "Your result couldn't be saved, so this attempt won't count toward your progress yet. Please try again later.";
  }
  if (save === "kept") return "Your earlier best result is kept.";
  return passed ? "Progress saved." : "Attempt saved.";
}

/** Bounds for deterministic spine sizes (px) and the number of shades per color family. */
export const SPINE = /** @type {const} */ ({ minWidth: 56, maxWidth: 76, minHeight: 236, maxHeight: 290, shades: 3 });

/**
 * FNV-1a 32-bit hash of a string. Pure and stable across runs and platforms.
 * @param {string} s
 * @returns {number} unsigned 32-bit integer
 */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic spine look for a book key (e.g. "philosophy/stoicism"): width,
 * height and shade index within the discipline's color family. Different bits of
 * the hash drive each value so they vary independently.
 * @param {string} key
 * @returns {{ width: number, height: number, shade: number }}
 */
export function spineStyle(key) {
  const h = hash32(key);
  const span = (/** @type {number} */ bits, /** @type {number} */ min, /** @type {number} */ max) =>
    min + (bits % (max - min + 1));
  return {
    width: span(h & 0xff, SPINE.minWidth, SPINE.maxWidth),
    height: span((h >>> 8) & 0xffff, SPINE.minHeight, SPINE.maxHeight),
    shade: (h >>> 24) % SPINE.shades,
  };
}

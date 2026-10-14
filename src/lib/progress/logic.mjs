// @ts-check
// Pure progress logic: completion rows (from Supabase, RLS-scoped to the user)
// + static content -> per-lesson lookup and bookshelf. Plain ESM + JSDoc so
// node:test can import it; type-checked by tsc via allowJs.

import { shouldReplace } from "../quiz/logic.mjs";

/** @typedef {{ lesson_id: string, score: number, total: number, passed: boolean }} CompletionRow */
/** @typedef {{ score: number, total: number, passed: boolean }} Completion */
/** Best attempt plus when it was stored (ISO string, or null when missing/unparseable). */
/**
 * completedAt: time of the best attempt (upper bound on the first pass).
 * firstPassedAt: exact time of the first pass (TSK-012), null when not recorded (column
 * not migrated yet, row never passed, or written before the migration and not backfilled).
 * @typedef {Completion & { completedAt: string | null, firstPassedAt: string | null }} DatedCompletion
 */
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
 *   position: number,
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
 * Columns read from lesson_completions. first_passed_at only exists once the TSK-012
 * migration is applied; callers retry with withFirstPass=false on a missing-column error.
 * @param {boolean} withFirstPass
 */
export function progressColumns(withFirstPass) {
  return withFirstPass ? "lesson_id, score, total, passed, completed_at, first_passed_at" : "lesson_id, score, total, passed, completed_at";
}

/**
 * A timestamp column from a row as a normalised ISO string, or null if missing or unparseable.
 * @param {unknown} v
 * @returns {string | null}
 */
function isoOrNull(v) {
  if (typeof v !== "string" || v === "") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Per-lesson best attempt with its `completed_at`, restricted to lesson ids that exist in
 * content. Duplicate rows for one lesson (shouldn't happen given the PK) are merged
 * defensively with the same best-attempt rule used when saving; the kept row's date wins.
 * @param {ReadonlyArray<unknown>} rows
 * @param {ReadonlyArray<ContentDiscipline>} disciplines
 * @returns {Map<string, DatedCompletion>}
 */
export function bestCompletions(rows, disciplines) {
  const known = new Set(disciplines.flatMap((d) => d.topics.flatMap((t) => t.lessons.map((l) => l.id))));
  /** @type {Map<string, DatedCompletion>} */
  const map = new Map();
  for (const row of rows) {
    if (!isCompletionRow(row) || !known.has(row.lesson_id)) continue;
    const attempt = { score: row.score, total: row.total, passed: row.passed };
    const r = /** @type {Record<string, unknown>} */ (row);
    const prev = map.get(row.lesson_id);
    // first_passed_at only counts on a passed row; across defensive duplicates keep the earliest.
    const ownFirst = attempt.passed ? isoOrNull(r.first_passed_at) : null;
    const firsts = [ownFirst, prev?.firstPassedAt ?? null].filter((d) => d !== null).sort();
    const firstPassedAt = attempt.passed || prev?.passed ? (firsts[0] ?? null) : null;
    if (shouldReplace(prev, attempt)) {
      map.set(row.lesson_id, { ...attempt, completedAt: isoOrNull(r.completed_at), firstPassedAt });
    } else if (prev) {
      map.set(row.lesson_id, { ...prev, firstPassedAt: prev.passed ? firstPassedAt : null });
    }
  }
  return map;
}

/**
 * Per-lesson best completion, restricted to lesson ids that exist in content.
 * @param {ReadonlyArray<unknown>} rows
 * @param {ReadonlyArray<ContentDiscipline>} disciplines
 * @returns {Map<string, Completion>}
 */
export function completionLookup(rows, disciplines) {
  /** @type {Map<string, Completion>} */
  const map = new Map();
  for (const [id, c] of bestCompletions(rows, disciplines)) map.set(id, { score: c.score, total: c.total, passed: c.passed });
  return map;
}

/**
 * Distinct passed lessons of one topic (the bookshelf's brass-tag count), counting only the
 * topic's content lessons.
 * @param {{ lessons: ReadonlyArray<{ id: string }> }} topic
 * @param {ReadonlyMap<string, { passed: boolean }>} lookup per-lesson best (completionLookup)
 */
export function passedInTopic(topic, lookup) {
  return topic.lessons.filter((l) => lookup.get(l.id)?.passed === true).length;
}

/**
 * Bookshelf grouped by discipline: one book per topic with at least one passed
 * lesson. Groups follow discipline content order and books follow topic content
 * order (same as the browse pages). Disciplines with nothing passed are omitted.
 * Every book in a group shares the discipline's cover color token. `position` is
 * the discipline's 1-based place in content order (for "Gallery I", "Gallery II"),
 * so it stays the same whether or not earlier disciplines have books.
 * @param {ReadonlyArray<unknown>} rows
 * @param {ReadonlyArray<ContentDiscipline>} disciplines
 * @returns {BookshelfGroup[]}
 */
export function buildBookshelf(rows, disciplines) {
  const lookup = completionLookup(rows, disciplines);
  /** @type {BookshelfGroup[]} */
  const groups = [];
  for (const [di, d] of disciplines.entries()) {
    /** @type {Book[]} */
    const books = [];
    for (const t of d.topics) {
      const passedCount = passedInTopic(t, lookup);
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
    if (books.length) groups.push({ discipline: { slug: d.slug, title: d.title, color: d.color }, position: di + 1, books });
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

/** Bounds for deterministic spine sizes (px), title font sizes (px) and shades per color family. */
export const SPINE = /** @type {const} */ ({
  // Measured from mockup C2 (TSK-008 v2): spines are 60-74px wide and 250-286px tall in a
  // 340px case (0.735-0.841 of the case height). As in C2, mobile keeps the same px in its 310px case.
  caseHeight: 340,
  minWidth: 60, maxWidth: 74, minHeight: 250, maxHeight: 286,
  maxFont: 19, minFont: 13, shades: 3,
  /** Vertical space outside the title text: caps, tag, margins and the title's own padding (px, measured). */
  chrome: 105,
  /** Advance per character as a fraction of the font size (measured worst case in C2: 0.62). */
  charEm: 0.62,
});

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
 * Split a title into at most two lines for the spine: one line when it fits on the tallest
 * spine at the smallest font, otherwise the word break that minimises the longer line.
 * @param {string} title
 * @returns {string[]}
 */
export function spineLines(title) {
  const t = typeof title === "string" ? title.trim().replace(/\s+/g, " ") : "";
  if (!t) return [];
  const len = (/** @type {string} */ x) => [...x].length;
  const oneLineMax = Math.floor((SPINE.maxHeight - SPINE.chrome) / (SPINE.minFont * SPINE.charEm));
  const words = t.split(" ");
  if (len(t) <= oneLineMax || words.length < 2) return [t];
  let best = [t];
  let bestLen = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const longest = Math.max(len(a), len(b));
    if (longest < bestLen) [best, bestLen] = [[a, b], longest];
  }
  return best;
}

/**
 * Deterministic spine look for a book key (e.g. "philosophy/stoicism"): width,
 * height and shade index within the discipline's color family, from different
 * bits of the hash. With a title, the spine grows (up to C2's max height) so the
 * vertical title fits, and the font shrinks (to minFont) if it still wouldn't.
 * Titles too long for one line at minFont wrap onto two lines (see spineLines);
 * the fit is computed on the longer line.
 * @param {string} key
 * @param {string} [title]
 * @returns {{ width: number, height: number, shade: number, fontSize: number, lines: string[] }}
 */
export function spineStyle(key, title = "") {
  const h = hash32(key);
  const span = (/** @type {number} */ bits, /** @type {number} */ min, /** @type {number} */ max) =>
    min + (bits % (max - min + 1));
  const lines = spineLines(title);
  const chars = lines.reduce((m, l) => Math.max(m, [...l].length), 0);
  const wanted = SPINE.chrome + Math.ceil(chars * SPINE.maxFont * SPINE.charEm);
  const height = Math.min(SPINE.maxHeight, Math.max(span((h >>> 8) & 0xffff, SPINE.minHeight, SPINE.maxHeight), wanted));
  const fit = chars ? Math.floor((height - SPINE.chrome) / (chars * SPINE.charEm)) : SPINE.maxFont;
  return {
    width: span(h & 0xff, SPINE.minWidth, SPINE.maxWidth),
    height,
    shade: (h >>> 24) % SPINE.shades,
    fontSize: Math.max(SPINE.minFont, Math.min(SPINE.maxFont, fit)),
    lines,
  };
}

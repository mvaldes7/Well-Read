// @ts-check
// Pure validator for AI-generated lessons (drill-downs P0). Generated lessons must match the shape of the
// long hand-written lessons and pass the same source, explanation and citation-marker checks as seed content.
import { lessonSourceProblems, citationMarkerProblems, explanationProblems, textFields } from "../../content/sources.mjs";

/** Generated ids never collide with hand-assigned les_ ids (REV-001). */
export const GENERATED_LESSON_ID_PATTERN = /^gen_[a-z0-9]{8,16}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEYS = new Set(["id", "slug", "title", "sections", "keyFacts", "quiz", "sources"]);
/** @param {unknown} v */
const str = (v) => typeof v === "string" && v.trim() !== "";

/**
 * Problems with one generated lesson (empty when valid).
 * @param {any} l raw lesson object from the model
 * @returns {string[]}
 */
export function generatedLessonProblems(l) {
  const where = "generated";
  if (!l || typeof l !== "object" || Array.isArray(l)) return [`${where}: expected an object`];
  /** @type {string[]} */
  const p = [];
  for (const k of Object.keys(l)) if (!KEYS.has(k)) p.push(`${where}: unknown field "${k}"`);
  if (typeof l.id !== "string" || !GENERATED_LESSON_ID_PATTERN.test(l.id)) p.push(`${where}.id: expected gen_ + 8-16 lowercase letters/digits`);
  if (typeof l.slug !== "string" || !SLUG.test(l.slug)) p.push(`${where}.slug: bad slug`);
  if (!str(l.title)) p.push(`${where}.title: expected non-empty string`);
  if (!Array.isArray(l.sections) || l.sections.length !== 4) p.push(`${where}.sections: expected exactly 4`);
  else l.sections.forEach((/** @type {any} */ s, /** @type {number} */ i) => { if (!s || !str(s.heading) || !str(s.body)) p.push(`${where}.sections[${i}]: heading and body required`); });
  if (!Array.isArray(l.keyFacts) || l.keyFacts.length !== 6 || !l.keyFacts.every(str)) p.push(`${where}.keyFacts: expected exactly 6 non-empty strings`);
  if (!Array.isArray(l.quiz) || l.quiz.length !== 6) p.push(`${where}.quiz: expected exactly 6 questions`);
  else l.quiz.forEach((/** @type {any} */ q, /** @type {number} */ i) => {
    const at = `${where}.quiz[${i}]`;
    if (!q || !str(q.question)) p.push(`${at}.question: required`);
    if (!q || !Array.isArray(q.options) || q.options.length !== 4 || !q.options.every(str)) p.push(`${at}.options: expected 4 non-empty strings`);
    else if (new Set(q.options).size !== 4) p.push(`${at}.options: duplicates`);
    if (!q || !Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) p.push(`${at}.answerIndex: expected 0-3`);
  });
  if (!Array.isArray(l.sources) || l.sources.length < 1) p.push(`${where}.sources: at least one source required`);
  p.push(...lessonSourceProblems(l.sources, where));
  // Reuse the seed-content checks by wrapping the lesson in a one-lesson fixture.
  const fx = [{ slug: "d", topics: [{ slug: "t", lessons: [l] }] }];
  if (Array.isArray(l.quiz) && l.quiz.every((/** @type {any} */ q) => q && typeof q === "object")) p.push(...explanationProblems(fx));
  if (Array.isArray(l.sections) && l.sections.every((/** @type {any} */ s) => s && typeof s === "object")) p.push(...citationMarkerProblems(fx));
  // Models often emit numeric markers like [1]; seed content had them stripped by hand.
  for (const [at, v] of textFields(fx)) if (typeof v === "string" && /\[\d+\]/.test(v)) p.push(`${at}: numeric citation marker`);
  return p;
}

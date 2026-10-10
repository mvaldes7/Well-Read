// @ts-check
// Permanent lesson ids (REV-001). Ids are hand-assigned, never derived from the
// slug, never reused, and are what lesson completions are keyed on in the DB.
// Plain ESM + JSDoc so both the TS loader and node:test use the same checks.

/** `les_` + 4-12 lowercase letters/digits, e.g. `les_rr01`. */
export const LESSON_ID_PATTERN = /^les_[a-z0-9]{4,12}$/;

/**
 * Check every lesson in the raw content tree has a well-formed, globally unique id.
 * @param {unknown} disciplines raw parsed JSON
 * @returns {string[]} problems found (empty when valid)
 */
export function lessonIdProblems(disciplines) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<string, string>} */
  const seen = new Map();
  if (!Array.isArray(disciplines)) return ["content must be an array of disciplines"];
  disciplines.forEach((d, i) => {
    const topics = d && typeof d === "object" && Array.isArray(d.topics) ? d.topics : [];
    topics.forEach((/** @type {any} */ t, /** @type {number} */ j) => {
      const lessons = t && typeof t === "object" && Array.isArray(t.lessons) ? t.lessons : [];
      lessons.forEach((/** @type {any} */ l, /** @type {number} */ k) => {
        const where = `disciplines[${i}].topics[${j}].lessons[${k}]`;
        const id = l && typeof l === "object" ? l.id : undefined;
        if (id === undefined || id === null || id === "") {
          problems.push(`${where}: missing id`);
        } else if (typeof id !== "string" || !LESSON_ID_PATTERN.test(id)) {
          problems.push(`${where}: bad id format ${JSON.stringify(id)} (expected ${LESSON_ID_PATTERN})`);
        } else if (seen.has(id)) {
          problems.push(`${where}: duplicate id "${id}" (also at ${seen.get(id)})`);
        } else {
          seen.set(id, where);
          if (l.slug === id) problems.push(`${where}: id must not equal the slug`);
        }
      });
    });
  });
  return problems;
}

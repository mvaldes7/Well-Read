// @ts-check
// "Dig deeper" choices (drill-downs P0, docs/plans/topic-drilldowns.md). Each lesson may carry 3-4
// precomputed, hand-reviewed choices drawn from its own content. The server accepts only one of these
// stored ids, never free text, so a user's input can't steer generation beyond what is listed here.
//
// Shape: digDeeper?: [{ id, label, kind }]
// - id: lowercase slug, unique within the lesson; label: 1-80 chars; kind: one of DIG_DEEPER_KINDS.

export const DIG_DEEPER_KINDS = Object.freeze(["person", "place", "event", "idea", "subtopic"]);
export const DIG_DEEPER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEYS = new Set(["id", "label", "kind"]);

/**
 * Problems with one lesson's optional digDeeper list.
 * @param {unknown} list
 * @param {string} where
 * @returns {string[]}
 */
export function lessonDigDeeperProblems(list, where) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length < 3 || list.length > 4) return [`${where}.digDeeper: expected 3-4 choices`];
  /** @type {string[]} */
  const p = [];
  const seen = new Set();
  list.forEach((c, i) => {
    const at = `${where}.digDeeper[${i}]`;
    if (!c || typeof c !== "object" || Array.isArray(c)) { p.push(`${at}: expected an object`); return; }
    for (const k of Object.keys(c)) if (!KEYS.has(k)) p.push(`${at}: unknown field "${k}"`);
    if (typeof c.id !== "string" || !DIG_DEEPER_ID.test(c.id) || c.id.length > 60) p.push(`${at}.id: expected a slug`);
    else if (seen.has(c.id)) p.push(`${at}.id: duplicate "${c.id}"`);
    else seen.add(c.id);
    if (typeof c.label !== "string" || c.label.trim() === "" || c.label.length > 80) p.push(`${at}.label: expected 1-80 chars`);
    if (!DIG_DEEPER_KINDS.includes(c.kind)) p.push(`${at}.kind: expected one of ${DIG_DEEPER_KINDS.join(", ")}`);
  });
  return p;
}

/**
 * digDeeper problems across all content.
 * @param {unknown} disciplines raw parsed JSON
 * @returns {string[]}
 */
export function digDeeperProblems(disciplines) {
  /** @type {string[]} */
  const p = [];
  if (!Array.isArray(disciplines)) return p;
  disciplines.forEach((d, i) => (Array.isArray(d?.topics) ? d.topics : []).forEach((/** @type {any} */ t, /** @type {number} */ j) =>
    (Array.isArray(t?.lessons) ? t.lessons : []).forEach((/** @type {any} */ l, /** @type {number} */ k) =>
      p.push(...lessonDigDeeperProblems(l?.digDeeper, `disciplines[${i}].topics[${j}].lessons[${k}]`)))));
  return p;
}

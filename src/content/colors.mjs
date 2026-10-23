// @ts-check
// Discipline cover colors (REV-002). Content names a token from this small set;
// the actual colors live in one place: the `.cover-<token>` rules in globals.css.

export const DISCIPLINE_COLORS = /** @type {const} */ (["crimson", "navy", "forest", "amber", "plum", "slate", "teal"]);

/**
 * Check every discipline has a `color` from DISCIPLINE_COLORS.
 * @param {unknown} disciplines raw parsed JSON
 * @returns {string[]} problems found (empty when valid)
 */
export function disciplineColorProblems(disciplines) {
  if (!Array.isArray(disciplines)) return ["content must be an array of disciplines"];
  /** @type {string[]} */
  const problems = [];
  disciplines.forEach((d, i) => {
    const color = d && typeof d === "object" ? d.color : undefined;
    const where = `disciplines[${i}]`;
    if (color === undefined || color === null || color === "") problems.push(`${where}: missing color`);
    else if (!DISCIPLINE_COLORS.includes(color)) {
      problems.push(`${where}: invalid color ${JSON.stringify(color)} (expected one of ${DISCIPLINE_COLORS.join(", ")})`);
    }
  });
  return problems;
}

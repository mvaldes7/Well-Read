// @ts-check
// Upper-case Roman numerals for decorative numbering (1..3999). Pure, for node:test.

/** @type {Array<[number, string]>} */
const TABLE = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

/**
 * @param {number} n integer 1..3999
 * @returns {string} e.g. 4 -> "IV"; out-of-range or non-integer -> String(n)
 */
export function toRoman(n) {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n);
  let out = "";
  let rest = n;
  for (const [v, s] of TABLE) {
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  }
  return out;
}

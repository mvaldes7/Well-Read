// @ts-check
// Section bodies are plain text; paragraphs are separated by a blank line ("\n\n").

/**
 * Split a section body into trimmed, non-empty paragraphs.
 * @param {string} body
 * @returns {string[]}
 */
export function paragraphs(body) {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter((p) => p !== "");
}

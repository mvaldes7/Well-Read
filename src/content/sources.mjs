// @ts-check
// Lesson sources, quiz explanations and citation-marker checks (TSK-012).
// Plain ESM + JSDoc so the TS loader (src/content/index.ts) and node:test share one implementation.
//
// Source shape: { publisher: string, title: string, url: string, note?: string }
// - publisher, title: non-empty strings; note: optional non-empty string; no other keys.
// - url: a valid absolute URL with the https: protocol (http:, javascript:, relative or
//   malformed URLs are rejected), unique within its lesson (compared after URL parsing).
// Every quiz question needs a non-empty `explanation` (shown only after grading).
// No text field may keep citation markup from the markdown sources ("[S1]", "([", raw
// markdown links, bare URLs or ** emphasis); citations live only in `sources`.

const SOURCE_KEYS = new Set(["publisher", "title", "url", "note"]);

/**
 * True for a well-formed absolute https URL with a host.
 * @param {unknown} v
 */
export function isHttpsUrl(v) {
  if (typeof v !== "string" || v.trim() !== v || v === "") return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname !== "";
  } catch {
    return false;
  }
}

/** @param {unknown} v */
const nonEmpty = (v) => typeof v === "string" && v.trim() !== "";

/**
 * Walk every lesson in raw content, with a readable path.
 * @param {unknown} disciplines
 * @param {(lesson: any, where: string) => void} visit
 */
function eachLesson(disciplines, visit) {
  if (!Array.isArray(disciplines)) return;
  disciplines.forEach((d, i) => {
    const topics = d && typeof d === "object" && Array.isArray(d.topics) ? d.topics : [];
    topics.forEach((/** @type {any} */ t, /** @type {number} */ j) => {
      const lessons = t && typeof t === "object" && Array.isArray(t.lessons) ? t.lessons : [];
      lessons.forEach((/** @type {any} */ l, /** @type {number} */ k) => {
        if (l && typeof l === "object") visit(l, `disciplines[${i}].topics[${j}].lessons[${k}]`);
      });
    });
  });
}

/**
 * Problems with one lesson's optional `sources` list.
 * @param {unknown} sources
 * @param {string} where path of the lesson
 * @returns {string[]}
 */
export function lessonSourceProblems(sources, where) {
  if (sources === undefined) return [];
  if (!Array.isArray(sources)) return [`${where}.sources: expected an array`];
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<string, number>} */
  const seen = new Map();
  sources.forEach((s, i) => {
    const at = `${where}.sources[${i}]`;
    if (!s || typeof s !== "object" || Array.isArray(s)) {
      problems.push(`${at}: expected an object`);
      return;
    }
    for (const key of Object.keys(s)) if (!SOURCE_KEYS.has(key)) problems.push(`${at}: unknown field "${key}"`);
    if (!nonEmpty(s.publisher)) problems.push(`${at}.publisher: expected non-empty string`);
    if (!nonEmpty(s.title)) problems.push(`${at}.title: expected non-empty string`);
    if (s.note !== undefined && !nonEmpty(s.note)) problems.push(`${at}.note: expected non-empty string when present`);
    if (!isHttpsUrl(s.url)) {
      problems.push(`${at}.url: expected a valid https URL, got ${JSON.stringify(s.url)}`);
    } else {
      const key = new URL(s.url).href;
      if (seen.has(key)) problems.push(`${at}.url: duplicate of sources[${seen.get(key)}] (${key})`);
      else seen.set(key, i);
    }
  });
  return problems;
}

/**
 * Source problems across all lessons.
 * @param {unknown} disciplines raw parsed JSON
 * @returns {string[]}
 */
export function sourceProblems(disciplines) {
  /** @type {string[]} */
  const problems = [];
  eachLesson(disciplines, (l, where) => problems.push(...lessonSourceProblems(l.sources, where)));
  return problems;
}

/**
 * Every quiz question must carry a non-empty explanation.
 * @param {unknown} disciplines raw parsed JSON
 * @returns {string[]}
 */
export function explanationProblems(disciplines) {
  /** @type {string[]} */
  const problems = [];
  eachLesson(disciplines, (l, where) => {
    if (!Array.isArray(l.quiz)) return;
    l.quiz.forEach((/** @type {any} */ q, /** @type {number} */ i) => {
      if (!q || typeof q !== "object" || !nonEmpty(q.explanation)) problems.push(`${where}.quiz[${i}].explanation: expected non-empty string`);
    });
  });
  return problems;
}

/** Citation markup that must never survive into rendered text. */
export const CITATION_PATTERNS = Object.freeze([
  { name: "[S#] marker", re: /\[S\d+\]/ },
  { name: "inline citation '(['", re: /\(\[/ },
  { name: "markdown link", re: /\]\(/ },
  { name: "bare URL", re: /https?:\/\//i },
  { name: "markdown emphasis", re: /\*\*/ },
]);

/**
 * Every rendered text field in the raw content tree, with its path.
 * (Source fields are excluded: their URLs are meant to be URLs.)
 * @param {unknown} disciplines
 * @returns {Array<[string, unknown]>}
 */
export function textFields(disciplines) {
  /** @type {Array<[string, unknown]>} */
  const out = [];
  if (!Array.isArray(disciplines)) return out;
  disciplines.forEach((d, i) => {
    if (!d || typeof d !== "object") return;
    const dp = `disciplines[${i}]`;
    out.push([`${dp}.title`, d.title], [`${dp}.description`, d.description]);
    (Array.isArray(d.topics) ? d.topics : []).forEach((/** @type {any} */ t, /** @type {number} */ j) => {
      if (!t || typeof t !== "object") return;
      const tp = `${dp}.topics[${j}]`;
      out.push([`${tp}.title`, t.title], [`${tp}.summary`, t.summary]);
      (Array.isArray(t.lessons) ? t.lessons : []).forEach((/** @type {any} */ l, /** @type {number} */ k) => {
        if (!l || typeof l !== "object") return;
        const lp = `${tp}.lessons[${k}]`;
        out.push([`${lp}.title`, l.title]);
        (Array.isArray(l.sections) ? l.sections : []).forEach((/** @type {any} */ s, /** @type {number} */ m) => {
          out.push([`${lp}.sections[${m}].heading`, s?.heading], [`${lp}.sections[${m}].body`, s?.body]);
        });
        (Array.isArray(l.keyFacts) ? l.keyFacts : []).forEach((/** @type {unknown} */ f, /** @type {number} */ m) => out.push([`${lp}.keyFacts[${m}]`, f]));
        (Array.isArray(l.quiz) ? l.quiz : []).forEach((/** @type {any} */ q, /** @type {number} */ m) => {
          const qp = `${lp}.quiz[${m}]`;
          out.push([`${qp}.question`, q?.question], [`${qp}.explanation`, q?.explanation]);
          (Array.isArray(q?.options) ? q.options : []).forEach((/** @type {unknown} */ o, /** @type {number} */ n) => out.push([`${qp}.options[${n}]`, o]));
        });
      });
    });
  });
  return out;
}

/**
 * Text fields that still contain citation markup.
 * @param {unknown} disciplines raw parsed JSON
 * @returns {string[]}
 */
export function citationMarkerProblems(disciplines) {
  /** @type {string[]} */
  const problems = [];
  for (const [path, value] of textFields(disciplines)) {
    if (typeof value !== "string") continue;
    for (const { name, re } of CITATION_PATTERNS) if (re.test(value)) problems.push(`${path}: contains ${name}`);
  }
  return problems;
}

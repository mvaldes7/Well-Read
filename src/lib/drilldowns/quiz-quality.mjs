// @ts-check
// Quality guards for AI-generated Dig deeper quizzes (docs/plans/dig-deeper-quizzes.md, section e). Pure: no env,
// no DB, no provider calls. Used by the generator before a lesson is saved (generate.mjs) and, without the
// position-balance rule, as a read-time check on lessons saved before these guards existed.

/** Words that never count as evidence that an answer is grounded in the lesson text. */
const STOP = new Set(("about above after again against also among because been before being below between both could " +
  "does doing down during each from further have having here into itself just more most much must only other over same " +
  "should some such than that their them then there these they this those through under until very were what when where " +
  "which while whom with would your").split(" "));

/**
 * Options that refer to the other options ("all of the above", "none of these", ...). A bare "None", "All" or "Both" is
 * NOT flagged: it is often a literal answer (for example "How many vetoes were overridden? None").
 */
const META_OPTION = /\b(?:all|none|both|neither) of (?:the )?(?:above|these|those|the options|them)\b/i;
/** Explanations must not depend on option order, because options are shuffled before saving. */
const POSITIONAL = /\b(?:option|answer|choice)\s+[A-D]\b|\([A-D]\)|\b(?:first|second|third|fourth|last)\s+(?:option|answer|choice)\b/i;

/**
 * Correct answers far longer than every distractor are a giveaway. Calibrated on the hand-written lessons: their
 * correct option is often the longest (median 1.3x the longest distractor, 99th percentile 2.5x), so only a
 * clear outlier is rejected. Rejecting more would spend scarce free-tier calls on regenerations.
 */
export const LENGTH_OUTLIER_RATIO = 2.5;
const LENGTH_OUTLIER_MIN_CHARS = 40;
/** An option this long (normalized) appearing verbatim in its question gives the answer away; short ones ("Eight") may not. */
const COPIED_OPTION_MIN_CHARS = 12;

/** @param {unknown} s */
export function normalizeOption(s) {
  return String(s ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Content words of a string: 4+ letters (not a stop word), or any token containing a digit (years, counts).
 * @param {unknown} s
 */
export function contentWords(s) {
  return normalizeOption(s).split(" ").filter((w) => w && (/\d/.test(w) || (w.length >= 4 && !STOP.has(w))));
}

/** @param {any} lesson */
function lessonText(lesson) {
  const sections = Array.isArray(lesson?.sections) ? lesson.sections.map((/** @type {any} */ s) => `${s?.heading ?? ""} ${s?.body ?? ""}`) : [];
  const facts = Array.isArray(lesson?.keyFacts) ? lesson.keyFacts : [];
  return new Set(contentWords(`${lesson?.title ?? ""} ${sections.join(" ")} ${facts.join(" ")}`));
}

/** Loose stem match so "elected" grounds "elect" and "empires" grounds "empire". @param {Set<string>} text @param {string} w */
function grounded(text, w) {
  if (text.has(w)) return true;
  if (/\d/.test(w) || w.length < 5) return false;
  const stem = w.slice(0, Math.max(4, w.length - 3));
  for (const t of text) if (t.startsWith(stem)) return true;
  return false;
}

/**
 * Answer-position balance: with n >= 4 questions every position is used, and none more than ceil(n/4) times.
 * @param {ReadonlyArray<number>} answers
 * @returns {string[]}
 */
export function positionBalanceProblems(answers) {
  if (!Array.isArray(answers) || answers.length < 4) return [];
  const counts = [0, 0, 0, 0];
  for (const a of answers) if (Number.isInteger(a) && a >= 0 && a <= 3) counts[a] += 1;
  const max = Math.ceil(answers.length / 4);
  const p = [];
  if (counts.some((c) => c === 0)) p.push(`quiz: answer positions unbalanced (unused position; counts ${counts.join("/")})`);
  if (counts.some((c) => c > max)) p.push(`quiz: answer positions unbalanced (a position used more than ${max} times; counts ${counts.join("/")})`);
  return p;
}

/**
 * Problems with a generated quiz (empty when it is fit to show and grade).
 * Expects the shape generatedLessonProblems already accepts (6 questions, 4 options, answerIndex 0-3).
 * @param {any} lesson generated lesson with quiz[].answerIndex and quiz[].explanation
 * @param {{ checkBalance?: boolean }} [opts] checkBalance=false for the read-time check on older saved lessons
 * @returns {string[]}
 */
export function quizQualityProblems(lesson, opts = {}) {
  const quiz = Array.isArray(lesson?.quiz) ? lesson.quiz : [];
  const text = lessonText(lesson);
  /** @type {string[]} */
  const p = [];
  const questions = new Set();
  quiz.forEach((/** @type {any} */ q, /** @type {number} */ i) => {
    const at = `quiz${i + 1}`;
    /** @type {string[]} */
    const options = Array.isArray(q?.options) ? q.options.map(String) : [];
    /** @type {string[]} */
    const norm = options.map(normalizeOption);
    const qn = normalizeOption(q?.question);
    if (questions.has(qn)) p.push(`${at}: duplicate question`);
    questions.add(qn);
    if (new Set(norm).size !== norm.length || norm.some((o) => !o)) p.push(`${at}: options repeat after normalizing case and punctuation`);
    if (options.some((o) => META_OPTION.test(o.trim()))) p.push(`${at}: "all/none of the above" style option`);
    const correct = Number.isInteger(q?.answerIndex) ? options[q.answerIndex] : undefined;
    if (correct === undefined) return;
    const distractors = options.filter((_, j) => j !== q.answerIndex);
    const longest = Math.max(...distractors.map((d) => d.trim().length), 0);
    if (correct.trim().length >= LENGTH_OUTLIER_MIN_CHARS && correct.trim().length > longest * LENGTH_OUTLIER_RATIO) p.push(`${at}: correct option is a length outlier`);
    if (norm.some((o) => o.length >= COPIED_OPTION_MIN_CHARS && qn.includes(o))) p.push(`${at}: an option is copied into the question`);
    const words = contentWords(correct);
    if (words.length && !words.some((w) => grounded(text, w))) p.push(`${at}: correct answer is not grounded in the lesson text`);
    if (POSITIONAL.test(String(q?.explanation ?? ""))) p.push(`${at}: explanation refers to an option letter or position`);
  });
  if (opts.checkBalance !== false) p.push(...positionBalanceProblems(quiz.map((/** @type {any} */ q) => q?.answerIndex)));
  return p;
}

/** FNV-1a string hash -> 32-bit seed. @param {string} s */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** mulberry32 PRNG: deterministic per seed, so the same lesson id always gets the same order. @param {number} a */
function rng(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @template T @param {T[]} arr @param {() => number} rand */
function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

/**
 * Move each correct option to a balanced target position (targets cycle 0..3, then shuffle), shuffling the
 * distractors around it. Deterministic for a given seed (the lesson id). Questions, explanations and citation
 * order are unchanged; only options and answerIndex move. Returns a new array.
 * @param {ReadonlyArray<any>} quiz
 * @param {string} seed
 */
export function balanceAnswerPositions(quiz, seed) {
  if (!Array.isArray(quiz)) return quiz;
  const rand = rng(hash(String(seed)));
  const targets = shuffle(quiz.map((_, i) => i % 4), rand);
  return quiz.map((q, i) => {
    if (!q || !Array.isArray(q.options) || q.options.length !== 4 || !Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) return q;
    const correct = q.options[q.answerIndex];
    const rest = shuffle(q.options.filter((/** @type {unknown} */ _, /** @type {number} */ j) => j !== q.answerIndex), rand);
    const options = [...rest];
    options.splice(targets[i], 0, correct);
    return { ...q, options, answerIndex: targets[i] };
  });
}

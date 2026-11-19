// @ts-check
// Quizzes on Dig deeper lessons (docs/plans/dig-deeper-quizzes.md, sections b and d). Pure: the server action and
// the /dig page pass in what they read (the user's own rows via RLS, the key via drilldown_quiz_key()), and node:test
// covers the rules. Grading reuses the static-lesson rules: server-side, 70% to pass, best attempt kept.
import { QUIZ_ERRORS, gradeQuiz } from "../quiz/logic.mjs";
import { GENERATED_LESSON_ID_PATTERN } from "./validate.mjs";
import { quizQualityProblems } from "./quiz-quality.mjs";

export const DIG_QUIZ_ERRORS = Object.freeze({
  disabled: "Dig deeper is turned off right now.",
  badRequest: "That quiz submission wasn't valid. Reload the page and try again.",
  signedOut: "You're signed out. Sign in again to submit the quiz.",
  notFound: "That lesson isn't available.",
  locked: "Finish the quiz on the original lesson first. Dig deeper quizzes open after it.",
  noQuiz: "This lesson doesn't have a quiz.",
  wrongCount: "Answer every question before submitting.",
  outOfRange: "One of the answers wasn't a valid option.",
  rateLimited: "Too many submissions in a short time. Wait a minute and try again.",
  unavailable: "The quiz is unavailable right now. Please try again later.",
});

/** Submissions per user per minute (best effort, per server instance). */
export const DIG_QUIZ_SUBMITS_PER_MINUTE = 10;

/**
 * Parse the untrusted payload. Only `lessonId` and `answers` are read; a forged score, total or passed is ignored.
 * @param {unknown} input
 * @returns {{ ok: true, value: { lessonId: string, answers: number[] } } | { ok: false, error: string }}
 */
export function parseDigSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: DIG_QUIZ_ERRORS.badRequest };
  const { lessonId, answers } = /** @type {Record<string, unknown>} */ (input);
  if (typeof lessonId !== "string" || !GENERATED_LESSON_ID_PATTERN.test(lessonId)) return { ok: false, error: DIG_QUIZ_ERRORS.badRequest };
  if (!Array.isArray(answers) || answers.length === 0 || answers.length > 12) return { ok: false, error: DIG_QUIZ_ERRORS.badRequest };
  if (!answers.every((a) => Number.isInteger(a))) return { ok: false, error: DIG_QUIZ_ERRORS.outOfRange };
  return { ok: true, value: { lessonId, answers: /** @type {number[]} */ ([...answers]) } };
}

/**
 * Join the public quiz (question + options, from generated_lessons.lesson) with the server-only key.
 * Returns null when they don't line up (missing key, wrong lengths, bad indexes).
 * @param {unknown} publicQuiz
 * @param {{ answers: unknown, explanations: unknown } | null | undefined} key
 * @returns {{ question: string, options: string[], answerIndex: number, explanation: string }[] | null}
 */
export function joinQuizKey(publicQuiz, key) {
  if (!Array.isArray(publicQuiz) || publicQuiz.length === 0 || !key) return null;
  const { answers, explanations } = key;
  if (!Array.isArray(answers) || !Array.isArray(explanations) || answers.length !== publicQuiz.length || explanations.length !== publicQuiz.length) return null;
  const out = [];
  for (let i = 0; i < publicQuiz.length; i++) {
    const q = publicQuiz[i];
    const a = answers[i];
    if (!q || typeof q.question !== "string" || !Array.isArray(q.options) || q.options.length < 2 || !q.options.every((/** @type {unknown} */ o) => typeof o === "string")) return null;
    if (!Number.isInteger(a) || a < 0 || a >= q.options.length) return null;
    out.push({ question: q.question, options: [...q.options], answerIndex: a, explanation: String(explanations[i] ?? "") });
  }
  return out;
}

/**
 * Refs of the user's own unconfirmed claims that are quiz items ("quiz3"), from drilldown_my_lessons().
 * @param {unknown} claims
 */
export function unconfirmedQuizRefs(claims) {
  return Array.isArray(claims) ? claims.map((c) => (c && typeof c === "object" ? String(/** @type {any} */ (c).ref ?? "") : "")).filter((r) => /^quiz\d+$/.test(r)) : [];
}

/**
 * Can this user take this Dig deeper quiz right now?
 * - locked: no lesson_completions row for the parent lesson (any submitted attempt unlocks, as for Dig deeper itself).
 * - no_quiz: no usable key, the read-time quality check fails (older lessons; position balance not required),
 *   or the lesson is flagged with an unconfirmed quiz item (hidden until Mike reviews it).
 * @param {{ lesson: any, reviewStatus: string, parentCompleted: boolean, key: { answers: unknown, explanations: unknown } | null | undefined, unconfirmedQuizRefs?: string[] }} p
 * @returns {{ status: "ok", quiz: NonNullable<ReturnType<typeof joinQuizKey>> } | { status: "locked" | "no_quiz" }}
 */
export function digQuizAvailability(p) {
  if (!p.parentCompleted) return { status: "locked" };
  const quiz = joinQuizKey(p.lesson?.quiz, p.key);
  if (!quiz) return { status: "no_quiz" };
  if (p.reviewStatus === "flagged" && (p.unconfirmedQuizRefs ?? []).length > 0) return { status: "no_quiz" };
  if (quizQualityProblems({ ...p.lesson, quiz }, { checkBalance: false }).length > 0) return { status: "no_quiz" };
  return { status: "ok", quiz };
}

/**
 * Grade a parsed submission against the joined quiz. Same 70% rule as static lessons (5 of 6).
 * @param {NonNullable<ReturnType<typeof joinQuizKey>>} quiz
 * @param {number[]} answers
 * @returns {{ ok: true, value: import("../quiz/logic.mjs").GradeResult } | { ok: false, error: string }}
 */
export function gradeDigQuiz(quiz, answers) {
  const r = gradeQuiz(quiz, answers);
  if (r.ok) return r;
  return { ok: /** @type {const} */ (false), error: r.error === QUIZ_ERRORS.wrongCount ? DIG_QUIZ_ERRORS.wrongCount : r.error === QUIZ_ERRORS.outOfRange ? DIG_QUIZ_ERRORS.outOfRange : DIG_QUIZ_ERRORS.noQuiz };
}

/**
 * Sliding-window limiter keyed by user id. Best effort only (in-memory, per server instance).
 * @param {{ max?: number, windowMs?: number, now?: () => number }} [opts]
 */
export function createSubmitLimiter(opts = {}) {
  const max = opts.max ?? DIG_QUIZ_SUBMITS_PER_MINUTE;
  const windowMs = opts.windowMs ?? 60_000;
  const now = opts.now ?? Date.now;
  /** @type {Map<string, number[]>} */
  const hits = new Map();
  return {
    /** @param {string} key @returns {boolean} true when this submission is allowed */
    allow(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
      if (recent.length >= max) { hits.set(key, recent); return false; }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 1000) for (const [k, v] of hits) if (v.every((x) => t - x >= windowMs)) hits.delete(k);
      return true;
    },
  };
}

/**
 * Result text after grading. Dig deeper passes are tracked on their own and do not count toward mastery.
 * @param {"saved" | "kept" | "failed"} save
 * @param {boolean} passed
 */
export function digSaveMessage(save, passed) {
  if (save === "failed") return "Your result couldn't be saved. Please try again later.";
  if (save === "kept") return "Your earlier best result is kept.";
  return passed ? "Result saved." : "Attempt saved.";
}

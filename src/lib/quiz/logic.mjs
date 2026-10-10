// @ts-check
// Pure quiz grading and best-attempt merge logic. Used by the server action and
// unit tests (plain ESM + JSDoc; type-checked by tsc via allowJs).

import { LESSON_ID_PATTERN } from "../../content/ids.mjs";

/** @typedef {{ answerIndex: number }} GradableQuestion */
/** @typedef {{ lessonId: string, answers: number[] }} QuizSubmission */
/** @typedef {{ score: number, total: number, passed: boolean }} Attempt */
/** @typedef {{ chosenIndex: number, correctIndex: number, correct: boolean }} QuestionResult */
/** @typedef {Attempt & { questions: QuestionResult[] }} GradeResult */
/** @typedef {{ ok: true, value: QuizSubmission } | { ok: false, error: string }} ParseResult */
/** @typedef {{ ok: true, value: GradeResult } | { ok: false, error: string }} GradeOutcome */

export const PASS_NUMERATOR = 7;
export const PASS_DENOMINATOR = 10;
const MAX_ANSWERS = 50;

export const QUIZ_ERRORS = Object.freeze({
  badRequest: "That quiz submission wasn't valid. Reload the page and try again.",
  unknownLesson: "That lesson doesn't exist.",
  wrongCount: "Answer every question before submitting.",
  outOfRange: "One of the answers wasn't a valid option.",
  signedOut: "You're signed out. Sign in again to submit the quiz.",
  notConfigured: "Saving isn't configured on this server.",
});

/**
 * 70% pass rule in integer arithmetic (no floating point): score/total >= 7/10.
 * @param {number} score
 * @param {number} total
 */
export function isPassing(score, total) {
  return total > 0 && score * PASS_DENOMINATOR >= total * PASS_NUMERATOR;
}

/**
 * Validate the raw client payload. Only `lessonId` and `answers` are read; any
 * other field (e.g. a forged `score`, `total` or `passed`) is ignored.
 * @param {unknown} input
 * @returns {ParseResult}
 */
export function parseSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: QUIZ_ERRORS.badRequest };
  const { lessonId, answers } = /** @type {Record<string, unknown>} */ (input);
  if (typeof lessonId !== "string" || !LESSON_ID_PATTERN.test(lessonId)) return { ok: false, error: QUIZ_ERRORS.badRequest };
  if (!Array.isArray(answers) || answers.length === 0 || answers.length > MAX_ANSWERS) {
    return { ok: false, error: QUIZ_ERRORS.badRequest };
  }
  if (!answers.every((a) => Number.isInteger(a))) return { ok: false, error: QUIZ_ERRORS.outOfRange };
  return { ok: true, value: { lessonId, answers: /** @type {number[]} */ ([...answers]) } };
}

/**
 * Grade answers against the server-side quiz. Requires one answer per question,
 * each an integer index into that question's options.
 * @param {ReadonlyArray<GradableQuestion & { options: ReadonlyArray<string> }>} quiz
 * @param {ReadonlyArray<number>} answers
 * @returns {GradeOutcome}
 */
export function gradeQuiz(quiz, answers) {
  if (quiz.length === 0) return { ok: false, error: QUIZ_ERRORS.unknownLesson };
  if (answers.length !== quiz.length) return { ok: false, error: QUIZ_ERRORS.wrongCount };
  /** @type {QuestionResult[]} */
  const questions = [];
  for (let i = 0; i < quiz.length; i++) {
    const chosen = answers[i];
    if (!Number.isInteger(chosen) || chosen < 0 || chosen >= quiz[i].options.length) {
      return { ok: false, error: QUIZ_ERRORS.outOfRange };
    }
    const correctIndex = quiz[i].answerIndex;
    questions.push({ chosenIndex: chosen, correctIndex, correct: chosen === correctIndex });
  }
  const score = questions.filter((q) => q.correct).length;
  const total = quiz.length;
  return { ok: true, value: { score, total, passed: isPassing(score, total), questions } };
}

/**
 * Whether a new attempt should replace the stored best attempt.
 * A passed row is never downgraded to failed; otherwise the higher score wins.
 * Scores are compared as fractions so a changed question count stays fair.
 * Ties keep the existing row.
 * @param {Attempt | null | undefined} existing
 * @param {Attempt} attempt
 */
export function shouldReplace(existing, attempt) {
  if (!existing) return true;
  if (existing.passed && !attempt.passed) return false;
  if (!existing.passed && attempt.passed) return true;
  return attempt.score * existing.total > existing.score * attempt.total;
}

/**
 * The row-level condition the DB update uses so the no-downgrade rule holds even
 * with concurrent submissions (evaluated atomically by Postgres in the UPDATE's
 * WHERE clause). Matches `shouldReplace` when the stored total equals the
 * attempt's total (the quiz length for that lesson).
 * @param {Attempt} attempt
 * @returns {{ onlyIfNotPassed: boolean, scoreBelow: number }}
 *   attempt passed: update rows where passed = false OR score < attempt.score
 *   attempt failed: update rows where passed = false AND score < attempt.score
 */
export function improvementCondition(attempt) {
  return { onlyIfNotPassed: !attempt.passed, scoreBelow: attempt.score };
}

/**
 * The server action's pure core: parse the untrusted payload, look the lesson up
 * by its permanent id in server-side content, and grade. Never reads a score,
 * total or passed value from the input.
 * @param {unknown} input
 * @param {(lessonId: string) => ReadonlyArray<GradableQuestion & { options: ReadonlyArray<string> }> | undefined} lookupQuiz
 * @returns {{ ok: true, value: GradeResult & { lessonId: string } } | { ok: false, error: string }}
 */
export function gradeSubmission(input, lookupQuiz) {
  const parsed = parseSubmission(input);
  if (!parsed.ok) return parsed;
  const quiz = lookupQuiz(parsed.value.lessonId);
  if (!quiz) return { ok: false, error: QUIZ_ERRORS.unknownLesson };
  const graded = gradeQuiz(quiz, parsed.value.answers);
  if (!graded.ok) return graded;
  return { ok: true, value: { lessonId: parsed.value.lessonId, ...graded.value } };
}

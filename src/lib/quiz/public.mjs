// @ts-check
// What the browser may see of a quiz before it is graded (REV-007): question text and
// options only. answerIndex and explanation (and anything else) stay on the server and
// are returned by submitQuiz only after grading.

/** @typedef {{ question: string, options: string[] }} PublicQuestion */

/**
 * Build client-safe questions by whitelisting fields (never by deleting known secrets).
 * @param {ReadonlyArray<{ question: string, options: ReadonlyArray<string> }>} quiz
 * @returns {PublicQuestion[]}
 */
export function toPublicQuestions(quiz) {
  return quiz.map(({ question, options }) => ({ question, options: [...options] }));
}

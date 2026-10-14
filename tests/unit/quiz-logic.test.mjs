import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QUIZ_ERRORS,
  gradeQuiz,
  gradeSubmission,
  improvementCondition,
  isPassing,
  parseSubmission,
  shouldReplace,
} from '../../src/lib/quiz/logic.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const byId = new Map(disciplines.flatMap((d) => d.topics.flatMap((t) => t.lessons.map((l) => [l.id, l]))));
const lookup = (id) => byId.get(id)?.quiz;
const lesson = byId.get('les_rr01');
const N = lesson.quiz.length; // 6 since the TSK-012 rewrite
const rest = (first) => [first, ...new Array(N - 1).fill(0)];
const correct = lesson.quiz.map((q) => q.answerIndex);
const wrong = (i) => (i + 1) % 4;

/** Synthetic quiz with n questions whose correct answer is always 0. */
const quizOf = (n) => Array.from({ length: n }, () => ({ options: ['a', 'b', 'c', 'd'], answerIndex: 0 }));
const answersWith = (n, right) => Array.from({ length: n }, (_, i) => (i < right ? 0 : 1));

test('isPassing: 70% threshold in integer arithmetic', () => {
  assert.equal(isPassing(7, 10), true);
  assert.equal(isPassing(6, 10), false);
  assert.equal(isPassing(3, 4), true); // 75%
  assert.equal(isPassing(2, 3), false); // 66.7%
  assert.equal(isPassing(3, 3), true);
  assert.equal(isPassing(0, 0), false);
  assert.equal(isPassing(14, 20), true);
  assert.equal(isPassing(13, 20), false);
});

test('gradeQuiz: all correct, threshold edge cases, per-question results', () => {
  const all = gradeQuiz(lesson.quiz, correct);
  assert.equal(all.ok, true);
  assert.deepEqual([all.value.score, all.value.total, all.value.passed], [N, N, true]);
  assert.ok(all.value.questions.every((q) => q.correct));

  const cases = [[10, 7, true], [10, 6, false], [4, 3, true], [3, 2, false], [5, 4, true], [5, 3, false]];
  for (const [n, right, passed] of cases) {
    const r = gradeQuiz(quizOf(n), answersWith(n, right));
    assert.equal(r.ok, true);
    assert.deepEqual([r.value.score, r.value.total, r.value.passed], [right, n, passed], `${right}/${n}`);
  }

  const mixed = gradeQuiz(lesson.quiz, correct.map((c, i) => (i === 0 ? wrong(c) : c)));
  assert.deepEqual(mixed.value.questions[0], { chosenIndex: wrong(correct[0]), correctIndex: correct[0], correct: false, explanation: lesson.quiz[0].explanation });
});

test('gradeSubmission: valid payload is graded on the server', () => {
  const r = gradeSubmission({ lessonId: 'les_rr01', answers: correct }, lookup);
  assert.equal(r.ok, true);
  assert.equal(r.value.lessonId, 'les_rr01');
  assert.deepEqual([r.value.score, r.value.total, r.value.passed], [N, N, true]);
});

test('gradeSubmission: forged score/total/passed fields are ignored', () => {
  const allWrong = correct.map(wrong);
  const r = gradeSubmission({ lessonId: 'les_rr01', answers: allWrong, score: N, total: N, passed: true, userId: 'x' }, lookup);
  assert.equal(r.ok, true);
  assert.deepEqual([r.value.score, r.value.total, r.value.passed], [0, N, false]);
});

test('gradeSubmission: rejects wrong count, out-of-range, unknown lesson and junk', () => {
  const bad = [
    [{ lessonId: 'les_rr01', answers: correct.slice(1) }, QUIZ_ERRORS.wrongCount],
    [{ lessonId: 'les_rr01', answers: [...correct, 0] }, QUIZ_ERRORS.wrongCount],
    [{ lessonId: 'les_rr01', answers: rest(4) }, QUIZ_ERRORS.outOfRange],
    [{ lessonId: 'les_rr01', answers: rest(-1) }, QUIZ_ERRORS.outOfRange],
    [{ lessonId: 'les_rr01', answers: rest(0.5) }, QUIZ_ERRORS.outOfRange],
    [{ lessonId: 'les_rr01', answers: rest('1') }, QUIZ_ERRORS.outOfRange],
    [{ lessonId: 'les_zz99', answers: correct }, QUIZ_ERRORS.unknownLesson],
    [{ lessonId: 'how-the-republic-was-governed', answers: correct }, QUIZ_ERRORS.badRequest], // slug, not id
    [{ lessonId: 'les_rr01' }, QUIZ_ERRORS.badRequest],
    [{ lessonId: 'les_rr01', answers: [] }, QUIZ_ERRORS.badRequest],
    [{ lessonId: 'les_rr01', answers: new Array(51).fill(0) }, QUIZ_ERRORS.badRequest],
    [{ answers: correct }, QUIZ_ERRORS.badRequest],
    [null, QUIZ_ERRORS.badRequest],
    ['les_rr01', QUIZ_ERRORS.badRequest],
    [[{ lessonId: 'les_rr01', answers: correct }], QUIZ_ERRORS.badRequest],
  ];
  for (const [input, error] of bad) {
    assert.deepEqual(gradeSubmission(input, lookup), { ok: false, error }, JSON.stringify(input));
  }
});

test('parseSubmission copies answers (no shared reference with the input)', () => {
  const input = { lessonId: 'les_rr01', answers: [0, 1, 2, 3] };
  const r = parseSubmission(input);
  input.answers[0] = 3;
  assert.deepEqual(r.value.answers, [0, 1, 2, 3]);
});

test('shouldReplace: never downgrades a pass, keeps the higher score', () => {
  const pass4 = { score: 4, total: 4, passed: true };
  const pass3 = { score: 3, total: 4, passed: true };
  const fail2 = { score: 2, total: 4, passed: false };
  const fail1 = { score: 1, total: 4, passed: false };
  assert.equal(shouldReplace(null, fail1), true);
  assert.equal(shouldReplace(undefined, pass3), true);
  assert.equal(shouldReplace(pass3, fail2), false); // no downgrade
  assert.equal(shouldReplace(pass4, pass3), false); // lower score
  assert.equal(shouldReplace(pass3, pass3), false); // tie keeps existing
  assert.equal(shouldReplace(pass3, pass4), true);
  assert.equal(shouldReplace(fail1, fail2), true);
  assert.equal(shouldReplace(fail2, fail1), false);
  assert.equal(shouldReplace(fail2, pass3), true);
  // different totals compare as fractions: 3/4 (75%) beats 7/10 (70%)
  assert.equal(shouldReplace({ score: 7, total: 10, passed: true }, pass3), true);
});

test('improvementCondition matches shouldReplace for equal totals', () => {
  const total = 4;
  const all = [];
  for (let s = 0; s <= total; s++) all.push({ score: s, total, passed: isPassing(s, total) });
  // Emulate the SQL WHERE clause used in save.ts.
  const matches = (row, cond) =>
    cond.onlyIfNotPassed ? row.passed === false && row.score < cond.scoreBelow : row.passed === false || row.score < cond.scoreBelow;
  for (const existing of all) {
    for (const attempt of all) {
      assert.equal(matches(existing, improvementCondition(attempt)), shouldReplace(existing, attempt), `${JSON.stringify(existing)} <- ${JSON.stringify(attempt)}`);
    }
  }
});

// ---------- TSK-012: public questions, explanations, first_passed_at ----------
import { FIRST_PASSED_COLUMN, insertRow, isMissingColumnError, updateSteps } from '../../src/lib/quiz/logic.mjs';
import { toPublicQuestions } from '../../src/lib/quiz/public.mjs';

const allLessons = [...byId.values()];

test('toPublicQuestions strips answerIndex and explanation (whitelist: question, options)', () => {
  for (const l of allLessons) {
    const pub = toPublicQuestions(l.quiz);
    assert.equal(pub.length, l.quiz.length);
    pub.forEach((q, i) => {
      assert.deepEqual(Object.keys(q).sort(), ['options', 'question'], l.id);
      assert.equal(q.question, l.quiz[i].question);
      assert.deepEqual(q.options, l.quiz[i].options);
    });
    const json = JSON.stringify(pub);
    // Match JSON keys, not words: question text may use "explanation" (e.g. les_nr01).
    assert.ok(!json.includes('"answerIndex":') && !json.includes('"explanation":'), l.id);
    for (const q of l.quiz) assert.ok(!json.includes(q.explanation), `${l.id}: explanation text leaked`);
  }
  // Unknown extra fields never pass through either; options are copied, not shared.
  const src = [{ question: 'Q', options: ['a', 'b'], answerIndex: 1, explanation: 'E', secret: 'x' }];
  const out = toPublicQuestions(src);
  assert.deepEqual(out, [{ question: 'Q', options: ['a', 'b'] }]);
  assert.notEqual(out[0].options, src[0].options);
});

test('explanations come back only from grading, one per question', () => {
  const r = gradeSubmission({ lessonId: 'les_rr01', answers: correct }, lookup);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.questions.map((q) => q.explanation), lesson.quiz.map((q) => q.explanation));
  // Rejected submissions carry no explanations or answers.
  const bad = gradeSubmission({ lessonId: 'les_rr01', answers: correct.slice(1) }, lookup);
  assert.deepEqual(Object.keys(bad).sort(), ['error', 'ok']);
  // A question without an explanation yields null (content validation requires one anyway).
  assert.equal(gradeQuiz(quizOf(3), [0, 0, 0]).value.questions[0].explanation, null);
});

test('isMissingColumnError: 42703 / PGRST204 naming first_passed_at only', () => {
  assert.equal(isMissingColumnError({ code: '42703', message: 'column lesson_completions.first_passed_at does not exist' }), true);
  assert.equal(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'first_passed_at' column of 'lesson_completions' in the schema cache" }), true);
  assert.equal(isMissingColumnError({ code: '42703' }), true); // no message: trust the code
  assert.equal(isMissingColumnError({ code: '42703', message: 'column lesson_completions.other does not exist' }), false);
  assert.equal(isMissingColumnError({ code: '42501', message: 'permission denied first_passed_at' }), false);
  assert.equal(isMissingColumnError({ code: '23514', message: 'check constraint' }), false);
  assert.equal(isMissingColumnError(null), false);
  assert.equal(isMissingColumnError(undefined), false);
});

test('insertRow: first_passed_at only on a passing first attempt, omitted in fallback', () => {
  const now = '2026-10-10T18:00:00.000Z';
  assert.equal(insertRow('u', 'les_rr01', { score: 5, total: 6, passed: true }, now, true)[FIRST_PASSED_COLUMN], now);
  assert.ok(!(FIRST_PASSED_COLUMN in insertRow('u', 'les_rr01', { score: 2, total: 6, passed: false }, now, true)));
  assert.ok(!(FIRST_PASSED_COLUMN in insertRow('u', 'les_rr01', { score: 5, total: 6, passed: true }, now, false)));
  assert.deepEqual(insertRow('u', 'les_rr01', { score: 2, total: 6, passed: false }, now, true), { user_id: 'u', lesson_id: 'les_rr01', score: 2, total: 6, passed: false });
});

/** Apply the save plan to an in-memory row the way Postgres would (each step atomic). */
function simulateSave(row, attempt, now, withFirstPass = true) {
  if (!row) return { row: insertRow('u', 'les_x', attempt, now, withFirstPass), outcome: 'saved' };
  for (const step of updateSteps(attempt, now, withFirstPass)) {
    const m = step.match;
    if (m.passed !== undefined && row.passed !== m.passed) continue;
    if (m.scoreBelow !== undefined && !(row.score < m.scoreBelow)) continue;
    return { row: { ...row, ...step.patch }, outcome: 'saved' };
  }
  return { row, outcome: 'kept' };
}

test('updateSteps: same rows match as improvementCondition/shouldReplace (equal totals)', () => {
  const total = 6;
  for (let es = 0; es <= total; es++) for (let as = 0; as <= total; as++) {
    const existing = { score: es, total, passed: isPassing(es, total) };
    const attempt = { score: as, total, passed: isPassing(as, total) };
    const { outcome } = simulateSave(existing, attempt, 'T');
    assert.equal(outcome === 'saved', shouldReplace(existing, attempt), `${es} -> ${as}`);
  }
});

test('first_passed_at: set on the first pass only, never changed afterwards', () => {
  const T = (n) => `2026-10-0${n}T12:00:00.000Z`;
  let r = simulateSave(null, { score: 2, total: 6, passed: false }, T(1)).row;
  assert.equal(r[FIRST_PASSED_COLUMN], undefined);                     // failed insert: none
  r = simulateSave(r, { score: 3, total: 6, passed: false }, T(2)).row;
  assert.equal(r[FIRST_PASSED_COLUMN], undefined);                     // failed improvement: none
  r = simulateSave(r, { score: 5, total: 6, passed: true }, T(3)).row;
  assert.equal(r[FIRST_PASSED_COLUMN], T(3));                          // first pass: stamped
  r = simulateSave(r, { score: 6, total: 6, passed: true }, T(4)).row;
  assert.deepEqual([r.score, r.completed_at, r[FIRST_PASSED_COLUMN]], [6, T(4), T(3)]); // improved, stamp kept
  const kept = simulateSave(r, { score: 1, total: 6, passed: false }, T(5));
  assert.deepEqual([kept.outcome, kept.row[FIRST_PASSED_COLUMN]], ['kept', T(3)]);     // no downgrade
  // Passing first attempt (insert) is stamped too.
  assert.equal(simulateSave(null, { score: 6, total: 6, passed: true }, T(6)).row[FIRST_PASSED_COLUMN], T(6));
  // Race: two passing attempts against a failed row. The second sees passed = true, so it
  // can only take the improvement step, which never writes first_passed_at.
  const failed = { score: 1, total: 6, passed: false };
  const a = simulateSave(failed, { score: 5, total: 6, passed: true }, T(7)).row;
  const b = simulateSave(a, { score: 6, total: 6, passed: true }, T(8)).row;
  assert.deepEqual([b.score, b[FIRST_PASSED_COLUMN]], [6, T(7)]);
  // Pre-migration fallback: no step ever mentions the column.
  for (const att of [{ score: 5, total: 6, passed: true }, { score: 2, total: 6, passed: false }]) {
    for (const step of updateSteps(att, T(9), false)) assert.ok(!(FIRST_PASSED_COLUMN in step.patch));
  }
  // The improvement step never carries the column.
  assert.ok(!(FIRST_PASSED_COLUMN in updateSteps({ score: 6, total: 6, passed: true }, T(9), true)[1].patch));
});

// Dig deeper quizzes step 2 (docs/plans/dig-deeper-quizzes.md, sections b and d): parsing, key join, the parent-quiz
// lock, read-time quality check, grading at 70%, limiter, and source-level checks on the action and /dig page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DIG_QUIZ_ERRORS, parseDigSubmission, joinQuizKey, digQuizAvailability, gradeDigQuiz, createSubmitLimiter, unconfirmedQuizRefs, digSaveMessage,
} from '../../src/lib/drilldowns/dig-quiz.mjs';

const read = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const lesson = {
  title: 'The House of Wisdom in Baghdad',
  sections: [{ heading: 'Translators', body: 'Hunayn ibn Ishaq translated Galen into Arabic in Baghdad around 850. Paper came from Samarkand.' }],
  keyFacts: ['Caliph al-Mamun sponsored translators.'],
  quiz: [
    { question: 'Who translated Galen?', options: ['Ibn Battuta', 'Hunayn ibn Ishaq', 'Mansa Musa', 'Osman'] },
    { question: 'Which city?', options: ['Baghdad', 'Cairo', 'Rome', 'Mecca'] },
    { question: 'Into which language?', options: ['Latin', 'Greek', 'Arabic', 'Persian'] },
    { question: 'Paper came from?', options: ['Cordoba', 'Paris', 'Delhi', 'Samarkand'] },
    { question: 'Who sponsored translators?', options: ['al-Mamun', 'Umar', 'Ali', 'Harun'] },
    { question: 'Around which year?', options: ['700', '850', '1200', '1500'] },
  ],
};
const key = { answers: [1, 0, 2, 3, 0, 1], explanations: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'] };
const ok = (over = {}) => digQuizAvailability({ lesson, reviewStatus: 'published', parentCompleted: true, key, ...over });

test('parse: only lessonId (gen_ id) and integer answers are read; forged score/passed ignored', () => {
  assert.deepEqual(parseDigSubmission({ lessonId: 'gen_abcdef0123', answers: [1, 2], score: 6, passed: true }), { ok: true, value: { lessonId: 'gen_abcdef0123', answers: [1, 2] } });
  for (const bad of [null, [], 'x', { lessonId: 'les_fr01', answers: [1] }, { lessonId: 'gen_abcdef0123' }, { lessonId: 'gen_abcdef0123', answers: [] }, { lessonId: 'gen_abcdef0123', answers: Array(13).fill(0) }])
    assert.equal(parseDigSubmission(bad).ok, false, JSON.stringify(bad));
  assert.deepEqual(parseDigSubmission({ lessonId: 'gen_abcdef0123', answers: [1.5] }), { ok: false, error: DIG_QUIZ_ERRORS.outOfRange });
});

test('joinQuizKey: lines up public quiz and key; null on any mismatch', () => {
  const q = joinQuizKey(lesson.quiz, key);
  assert.equal(q.length, 6);
  assert.deepEqual(q[0], { question: 'Who translated Galen?', options: lesson.quiz[0].options, answerIndex: 1, explanation: 'E1' });
  assert.equal(joinQuizKey(lesson.quiz, null), null);
  assert.equal(joinQuizKey(lesson.quiz, { answers: key.answers.slice(1), explanations: key.explanations }), null);
  assert.equal(joinQuizKey(lesson.quiz, { answers: [9, 0, 2, 3, 0, 1], explanations: key.explanations }), null);
  assert.equal(joinQuizKey([], key), null);
});

test('parent-quiz lock: no parent completion means locked, before anything else', () => {
  assert.deepEqual(digQuizAvailability({ lesson, reviewStatus: 'published', parentCompleted: false, key }), { status: 'locked' });
  assert.deepEqual(digQuizAvailability({ lesson, reviewStatus: 'published', parentCompleted: false, key: null }), { status: 'locked' });
  assert.equal(ok().status, 'ok');
});

test('no_quiz: missing key, failed read-time quality check, or a flagged lesson with an unconfirmed quiz item', () => {
  assert.equal(ok({ key: null }).status, 'no_quiz');
  const meta = structuredClone(lesson); meta.quiz[1].options[3] = 'All of the above';
  assert.equal(ok({ lesson: meta }).status, 'no_quiz');
  const ungrounded = structuredClone(lesson); ungrounded.quiz[3].options[3] = 'Toledo';
  assert.equal(ok({ lesson: ungrounded, key: { ...key } }).status, 'no_quiz');
  assert.equal(ok({ reviewStatus: 'flagged', unconfirmedQuizRefs: ['quiz2'] }).status, 'no_quiz');
  assert.equal(ok({ reviewStatus: 'flagged', unconfirmedQuizRefs: [] }).status, 'ok');
  // Older lessons are not held to position balance at read time.
  assert.equal(ok({ key: { answers: [0, 0, 0, 0, 0, 0], explanations: key.explanations }, lesson: { ...lesson, quiz: lesson.quiz.map((q, i) => ({ ...q, options: [lesson.quiz[i].options[key.answers[i]], ...q.options.filter((_, j) => j !== key.answers[i])] })) } }).status, 'ok');
  assert.deepEqual(unconfirmedQuizRefs([{ ref: 'fact2' }, { ref: 'quiz3' }, null, 'x']), ['quiz3']);
  assert.deepEqual(unconfirmedQuizRefs(null), []);
});

test('grading: 70% rule, so 5 of 6 passes and 4 of 6 fails; explanations only in the result', () => {
  const { quiz } = ok();
  const five = gradeDigQuiz(quiz, [1, 0, 2, 3, 0, 0]);
  assert.equal(five.ok, true);
  assert.deepEqual([five.value.score, five.value.total, five.value.passed], [5, 6, true]);
  assert.equal(five.value.questions[5].correctIndex, 1);
  assert.equal(five.value.questions[0].explanation, 'E1');
  const four = gradeDigQuiz(quiz, [1, 0, 2, 3, 1, 0]);
  assert.deepEqual([four.value.score, four.value.passed], [4, false]);
  assert.deepEqual(gradeDigQuiz(quiz, [1, 0]), { ok: false, error: DIG_QUIZ_ERRORS.wrongCount });
  assert.deepEqual(gradeDigQuiz(quiz, [1, 0, 2, 3, 0, 4]), { ok: false, error: DIG_QUIZ_ERRORS.outOfRange });
});

test('limiter: per-key sliding window', () => {
  let t = 0;
  const l = createSubmitLimiter({ max: 2, windowMs: 1000, now: () => t });
  assert.equal(l.allow('a'), true); assert.equal(l.allow('a'), true); assert.equal(l.allow('a'), false);
  assert.equal(l.allow('b'), true);
  t = 1001; assert.equal(l.allow('a'), true);
  assert.equal(digSaveMessage('failed', true), "Your result couldn't be saved. Please try again later.");
  assert.equal(digSaveMessage('saved', true), 'Result saved.');
});

test('action: flag, verified session, parent check before the key, best attempt to generated_lesson_completions, streak activity only (C2)', () => {
  const action = read('lib/drilldowns/quiz-actions.ts');
  assert.match(action, /^"use server";/);
  assert.match(action, /drilldownsEnabled\(process\.env\)/);
  assert.match(action, /auth\.getClaims\(\)/);
  assert.match(action, /saveBestAttempt\(supabase, userId, lessonId, \{ score, total, passed \}, "generated_lesson_completions"\)/);
  assert.match(action, /await logActivity\(supabase, userId, "quiz_attempt", lessonId\);/);
  assert.ok(action.indexOf('logActivity(') > action.indexOf('saveBestAttempt('), 'activity is logged after the save');
  assert.doesNotMatch(action, /lesson_reminder_finished|from\("lesson_completions"\)|"lesson_completions"\)/);
  assert.doesNotMatch(action, /select\(\s*["']\*|\.select\(\)/);
  const data = read('lib/drilldowns/quiz-data.ts');
  assert.match(data, /^import "server-only";/);
  assert.ok(data.indexOf('from("lesson_completions")') < data.indexOf('quizKey(userId'), 'parent completion is read before the key');
  assert.match(data, /if \(!parent\) return \{ status: "locked" \};/);
});

test('/dig page: quiz section sends only question text and options; DigQuiz has no Dig deeper and no glyphs', () => {
  const page = read('app/dig/page.tsx');
  assert.match(page, /<DigQuiz lessonId=\{row\.id\} questions=\{toPublicQuestions\(ctx\.quiz\)\} \/>/);
  assert.match(page, /Finish the quiz on/);
  const comp = read('components/DigQuiz.tsx');
  assert.doesNotMatch(comp, /DigDeeper|answerIndex|quizKey/);
  assert.doesNotMatch(comp, /[\u2713\u2717\u{1F300}-\u{1FAFF}]/u);
  assert.match(comp, /count toward your day streak, not\s+toward mastery or achievements/);
});

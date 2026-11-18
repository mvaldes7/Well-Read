// Dig deeper quiz quality guards (docs/plans/dig-deeper-quizzes.md, section e).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quizQualityProblems, balanceAnswerPositions, positionBalanceProblems, contentWords, normalizeOption } from '../../src/lib/drilldowns/quiz-quality.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const lessons = disciplines.flatMap((d) => d.topics.flatMap((t) => t.lessons));

const base = () => ({
  id: 'gen_abcdef012345', title: 'The Abbasid court and the House of Wisdom',
  sections: [{ heading: 'Baghdad', body: 'Caliph al-Mamun sponsored translators in Baghdad. Hunayn ibn Ishaq translated Galen into Arabic around 850.' }],
  keyFacts: ['Paper mills spread from Samarkand to Baghdad.'],
  quiz: [
    { question: 'Who translated Galen into Arabic?', options: ['Hunayn ibn Ishaq', 'Ibn Battuta', 'Mansa Musa', 'Osman'], answerIndex: 0, explanation: 'Hunayn translated Galen.' },
    { question: 'Which caliph sponsored translators?', options: ['Harun', 'al-Mamun', 'Umar', 'Ali'], answerIndex: 1, explanation: 'Al-Mamun sponsored them.' },
    { question: 'Where did paper mills spread from?', options: ['Cairo', 'Cordoba', 'Samarkand', 'Rome'], answerIndex: 2, explanation: 'Samarkand.' },
    { question: 'Around when did Hunayn translate Galen?', options: ['700', '1200', '1500', '850'], answerIndex: 3, explanation: 'Around 850.' },
    { question: 'Which city hosted the translators?', options: ['Baghdad', 'Damascus', 'Mecca', 'Basra'], answerIndex: 0, explanation: 'Baghdad.' },
    { question: 'Into which language was Galen translated?', options: ['Latin', 'Arabic', 'Persian', 'Greek'], answerIndex: 1, explanation: 'Arabic.' },
  ],
});
const withQ = (i, patch) => { const l = base(); l.quiz[i] = { ...l.quiz[i], ...patch }; return l; };

test('a well-formed, grounded, balanced quiz has no problems', () => {
  assert.deepEqual(quizQualityProblems(base()), []);
});

test('hand-written lessons are a calibration set: at most a few clear length outliers, nothing else', () => {
  const problems = lessons.flatMap((l) => quizQualityProblems(l).map((p) => `${l.id} ${p}`));
  assert.ok(problems.every((p) => /length outlier/.test(p)), problems.join('\n'));
  assert.ok(problems.length <= 5, problems.join('\n'));
});

test('distractors: duplicates after normalizing, meta options, copied options, duplicate questions', () => {
  assert.ok(quizQualityProblems(withQ(0, { options: ['Hunayn ibn Ishaq', 'hunayn  ibn-ishaq', 'Mansa Musa', 'Osman'] })).some((p) => /repeat after normalizing/.test(p)));
  for (const meta of ['All of the above', 'None of these', 'Both of the above', 'none'])
    assert.ok(quizQualityProblems(withQ(0, { options: ['Hunayn ibn Ishaq', 'Ibn Battuta', 'Mansa Musa', meta] })).some((p) => /all\/none/.test(p)), meta);
  assert.ok(quizQualityProblems(withQ(0, { question: 'Did Hunayn ibn Ishaq translate Galen into Arabic?' })).some((p) => /copied into the question/.test(p)));
  assert.ok(quizQualityProblems(withQ(1, { question: 'Who translated  Galen into Arabic?' })).some((p) => /duplicate question/.test(p)));
});

test('length outlier: a correct option far longer than every distractor is rejected; short options are exempt', () => {
  const long = 'Hunayn ibn Ishaq, the Nestorian physician who led the Baghdad translators';
  assert.ok(quizQualityProblems(withQ(0, { options: [long, 'Ibn Battuta', 'Mansa Musa', 'Osman'] })).some((p) => /length outlier/.test(p)));
  assert.deepEqual(quizQualityProblems(withQ(5, { options: ['Latin', 'Arabic', 'X', 'Y'] })), []);
});

test('grounding: the correct answer must appear in the lesson text (stems and numbers count)', () => {
  assert.ok(quizQualityProblems(withQ(2, { options: ['Cairo', 'Cordoba', 'Toledo', 'Rome'] })).some((p) => /quiz3: correct answer is not grounded/.test(p)));
  assert.ok(quizQualityProblems(withQ(3, { options: ['700', '1200', '1500', '900'] })).some((p) => /quiz4: correct answer is not grounded/.test(p)));
  // stem match: "translators" in the text grounds "translator"
  assert.deepEqual(quizQualityProblems(withQ(4, { options: ['A translator', 'Damascus', 'Mecca', 'Basra'] })), []);
  assert.deepEqual(contentWords('The 850 House of Wisdom, with them'), ['850', 'house', 'wisdom']);
  assert.equal(normalizeOption('  Al-Ma\u0301mun! '), 'al mamun');
});

test('explanations must not refer to option letters or positions (options are shuffled)', () => {
  for (const e of ['Option B is right.', 'See (C).', 'The second choice is correct.'])
    assert.ok(quizQualityProblems(withQ(0, { explanation: e })).some((p) => /option letter or position/.test(p)), e);
});

test('position balance: every position used, none more than ceil(n/4); the read-time check can skip it', () => {
  assert.deepEqual(positionBalanceProblems([0, 1, 2, 3, 0, 1]), []);
  assert.equal(positionBalanceProblems([1, 1, 1, 1, 1, 1]).length, 2);
  assert.equal(positionBalanceProblems([0, 0, 0, 1, 2, 3]).length, 1);
  const skewed = base(); skewed.quiz.forEach((q) => { const c = q.options[q.answerIndex]; q.options = [c, ...q.options.filter((o) => o !== c)]; q.answerIndex = 0; });
  assert.ok(quizQualityProblems(skewed).some((p) => /unbalanced/.test(p)));
  assert.deepEqual(quizQualityProblems(skewed, { checkBalance: false }), []);
});

test('balanceAnswerPositions: deterministic per seed, balanced, keeps the correct option and all options', () => {
  const quiz = base().quiz.map((q) => ({ ...q, options: [q.options[q.answerIndex], ...q.options.filter((_, j) => j !== q.answerIndex)], answerIndex: 0 }));
  for (const seed of ['gen_abcdef012345', 'gen_000000000000', 'gen_zz99zz99zz99', 'x']) {
    const out = balanceAnswerPositions(quiz, seed);
    assert.deepEqual(out, balanceAnswerPositions(quiz, seed));
    assert.deepEqual(positionBalanceProblems(out.map((q) => q.answerIndex)), []);
    out.forEach((q, i) => {
      assert.equal(q.options[q.answerIndex], quiz[i].options[0]);
      assert.deepEqual([...q.options].sort(), [...quiz[i].options].sort());
      assert.equal(q.question, quiz[i].question);
      assert.equal(q.explanation, quiz[i].explanation);
    });
  }
  assert.equal(quiz[0].answerIndex, 0, 'input not mutated');
  const bad = [{ question: 'Q', options: ['a'], answerIndex: 0 }];
  assert.deepEqual(balanceAnswerPositions(bad, 's'), bad);
});

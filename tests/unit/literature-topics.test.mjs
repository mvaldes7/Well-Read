// TSK-022 lesson 3: Poetry & Literature gains a second topic (reading-poetry / les_rp01, kind technique).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { masteryFor, passedInDiscipline } from '../../src/lib/progress/mastery.mjs';
import { buildBookshelf, completionLookup } from '../../src/lib/progress/logic.mjs';
import { dashboardData } from '../../src/lib/progress/dashboard.mjs';
import { evaluateAchievements } from '../../src/achievements/definitions.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const lit = disciplines.find((d) => d.slug === 'poetry-and-literature');
const row = (lesson_id, passed = true, at = '2026-10-10T17:00:00Z') => ({ lesson_id, score: passed ? 6 : 1, total: 6, passed, completed_at: at, first_passed_at: passed ? at : null });

test('existing Poetry & Literature discipline (not duplicated) gains Reading Poetry with les_rp01', () => {
  assert.equal(disciplines.filter((d) => /literature/i.test(d.slug + d.title)).length, 1);
  assert.equal(lit.title, 'Poetry & Literature');
  assert.deepEqual(lit.topics.map((t) => [t.slug, t.kind, t.lessons.map((l) => l.id)]), [
    ['classic-novels', 'style', ['les_cn01']], ['reading-poetry', 'technique', ['les_rp01']],
  ]);
  const l = lit.topics[1].lessons[0];
  assert.equal(l.title, 'How to Read a Poem: Sound, Images, and Line Breaks');
  assert.deepEqual([l.sections.length, l.keyFacts.length, l.quiz.length, l.sources.length], [4, 6, 6, 6]);
  assert.deepEqual(l.quiz.map((q) => q.answerIndex), [1, 3, 0, 2, 1, 3]);
  assert.ok(l.quiz.every((q) => q.explanation.length > 0));
  assert.equal(new Set(l.sources.map((s) => s.url)).size, l.sources.length);
});

test('mastery, totals, Library Wall and completionist include les_rp01', () => {
  const lk = (ids) => completionLookup(ids.map((id) => row(id)), disciplines);
  assert.equal(passedInDiscipline(lit, lk(['les_cn01', 'les_rp01'])), 2);
  assert.equal(masteryFor(passedInDiscipline(lit, lk(['les_rp01']))).tier, 'Novice');
  const p = dashboardData([row('les_rp01')], disciplines).perDiscipline.find((x) => x.slug === 'poetry-and-literature');
  assert.deepEqual([p.passed, p.total], [1, 2]);
  const g = buildBookshelf([row('les_cn01'), row('les_rp01')], disciplines).find((x) => x.discipline.slug === 'poetry-and-literature');
  assert.deepEqual(g.books.map((b) => b.topicSlug), ['classic-novels', 'reading-poetry']);
  const by = (ids) => Object.fromEntries(evaluateAchievements(ids.map((id) => row(id)), disciplines).map((a) => [a.id, a]));
  assert.equal(by(['les_cn01'])['completionist:poetry-and-literature'].progress, '1/2 lessons');
  assert.equal(by(['les_cn01', 'les_rp01'])['completionist:poetry-and-literature'].earned, true);
});

// Religious Studies: its own cover color (teal). Protestant Christianity holds two lessons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DISCIPLINE_COLORS } from '../../src/content/colors.mjs';
import { buildBookshelf, completionLookup } from '../../src/lib/progress/logic.mjs';
import { passedInDiscipline } from '../../src/lib/progress/mastery.mjs';
import { dashboardData } from '../../src/lib/progress/dashboard.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const rs = disciplines.find((d) => d.slug === 'religious-studies');
const row = (lesson_id, passed = true, at = '2026-10-23T17:00:00Z') => ({ lesson_id, score: passed ? 6 : 1, total: 6, passed, completed_at: at, first_passed_at: passed ? at : null });
const RS = ['les_nt01', 'les_cv01', 'les_pr01', 'les_pc01', 'les_fp01'];

test('Religious Studies topics in order, with Protestant Christianity holding both lessons', () => {
  assert.equal(rs.title, 'Religious Studies');
  assert.deepEqual(rs.topics.map((t) => [t.slug, t.kind, t.lessons.map((l) => l.id)]), [
    ['four-noble-truths', 'concept', ['les_nt01']], ['covenant-in-judaism', 'concept', ['les_cv01']], ['protestant-christianity', 'concept', ['les_pr01', 'les_pc01']], ['five-pillars-of-islam', 'concept', ['les_fp01']],
  ]);
  const lessons = rs.topics.flatMap((t) => t.lessons);
  assert.deepEqual(lessons.map((l) => l.id), RS);
  const shapes = lessons.map((l) => [l.sections.length, l.keyFacts.length, l.quiz.length, l.sources.length]);
  assert.deepEqual(shapes, [[4, 6, 6, 3], [4, 6, 6, 3], [4, 6, 6, 5], [4, 6, 6, 3], [4, 6, 6, 2]]);
  assert.deepEqual(lessons.map((l) => l.quiz.map((q) => q.answerIndex)), [[0, 3, 1, 2, 0, 1], [1, 2, 0, 3, 1, 2], [1, 0, 3, 2, 0, 1], [1, 2, 0, 3, 1, 2], [2, 0, 3, 1, 2, 0]]);
  const protestant = rs.topics.find((t) => t.slug === 'protestant-christianity');
  assert.equal(protestant.title, 'Protestant Christianity');
  assert.equal(protestant.kind, 'concept');
  assert.deepEqual(protestant.lessons.map((l) => l.slug), ['why-western-christianity-split', 'from-belief-to-worship']);
  for (const l of lessons) assert.equal(new Set(l.sources.map((s) => s.url)).size, l.sources.length);
});

test('Religious Studies has its own cover color, used by no other discipline', () => {
  assert.equal(rs.color, 'teal');
  assert.ok(DISCIPLINE_COLORS.includes('teal'));
  assert.equal(disciplines.filter((d) => d.color === rs.color).length, 1);
  assert.equal(new Set(disciplines.map((d) => d.color)).size, disciplines.length);
});

test('progress, dashboard and Library Wall include Religious Studies', () => {
  const lk = completionLookup(RS.map((id) => row(id)), disciplines);
  assert.equal(passedInDiscipline(rs, lk), 5);
  const p = dashboardData([row('les_pr01')], disciplines).perDiscipline.find((x) => x.slug === 'religious-studies');
  assert.deepEqual([p.passed, p.total], [1, 5]);
  const g = buildBookshelf([row('les_nt01'), row('les_pr01')], disciplines).find((x) => x.discipline.slug === 'religious-studies');
  assert.equal(g.discipline.color, 'teal');
  assert.deepEqual(g.books.map((b) => [b.topicSlug, b.passedCount, b.lessonCount]), [['four-noble-truths', 1, 1], ['protestant-christianity', 1, 2]]);
});

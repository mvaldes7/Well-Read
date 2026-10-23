// Religious Studies: a new discipline with three single-lesson topics and its own cover color (teal).
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
const RS = ['les_nt01', 'les_cv01', 'les_pr01'];

test('Religious Studies topics in order, one lesson each, with the long-lesson shape', () => {
  assert.equal(rs.title, 'Religious Studies');
  assert.deepEqual(rs.topics.map((t) => [t.slug, t.kind, t.lessons.map((l) => l.id)]), [
    ['four-noble-truths', 'concept', ['les_nt01']], ['covenant-in-judaism', 'concept', ['les_cv01']], ['protestant-reformation', 'event', ['les_pr01']],
  ]);
  const shapes = rs.topics.map(({ lessons: [l] }) => [l.sections.length, l.keyFacts.length, l.quiz.length, l.sources.length]);
  assert.deepEqual(shapes, [[4, 6, 6, 2], [4, 6, 6, 3], [4, 6, 6, 3]]);
  assert.deepEqual(rs.topics.map(({ lessons: [l] }) => l.quiz.map((q) => q.answerIndex)), [[0, 3, 1, 2, 0, 1], [1, 2, 0, 3, 1, 2], [1, 0, 3, 2, 0, 1]]);
  for (const { lessons: [l] } of rs.topics) assert.equal(new Set(l.sources.map((s) => s.url)).size, l.sources.length);
});

test('Religious Studies has its own cover color, used by no other discipline', () => {
  assert.equal(rs.color, 'teal');
  assert.ok(DISCIPLINE_COLORS.includes('teal'));
  assert.equal(disciplines.filter((d) => d.color === rs.color).length, 1);
  assert.equal(new Set(disciplines.map((d) => d.color)).size, disciplines.length);
});

test('progress, dashboard and Library Wall include Religious Studies', () => {
  const lk = completionLookup(RS.map((id) => row(id)), disciplines);
  assert.equal(passedInDiscipline(rs, lk), 3);
  const p = dashboardData([row('les_pr01')], disciplines).perDiscipline.find((x) => x.slug === 'religious-studies');
  assert.deepEqual([p.passed, p.total], [1, 3]);
  const g = buildBookshelf([row('les_nt01'), row('les_pr01')], disciplines).find((x) => x.discipline.slug === 'religious-studies');
  assert.equal(g.discipline.color, 'teal');
  assert.deepEqual(g.books.map((b) => b.topicSlug), ['four-noble-truths', 'protestant-reformation']);
});

// TSK-022: American Civics gains a second topic (federal-legislative-process / les_lp01).
// Counts, mastery, the Library Wall and the completionist badge all derive from content, so
// they must pick up the new lesson across both topics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { masteryFor, masteryLine, passedInDiscipline } from '../../src/lib/progress/mastery.mjs';
import { buildBookshelf, completionLookup, passedInTopic } from '../../src/lib/progress/logic.mjs';
import { dashboardData } from '../../src/lib/progress/dashboard.mjs';
import { evaluateAchievements } from '../../src/achievements/definitions.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const civics = disciplines.find((d) => d.slug === 'american-civics');
const row = (lesson_id, passed = true, completed_at = '2026-10-10T17:00:00Z') => ({ lesson_id, score: passed ? 6 : 1, total: 6, passed, completed_at, first_passed_at: passed ? completed_at : null });
const CIVICS = ['les_cc01', 'les_br01', 'les_br02', 'les_lp01'];

test('American Civics has two topics in order, the new one holding les_lp01', () => {
  assert.deepEqual(civics.topics.map((t) => [t.slug, t.lessons.map((l) => l.id)]), [
    ['constitution-bill-of-rights', ['les_cc01', 'les_br01', 'les_br02']],
    ['federal-legislative-process', ['les_lp01']],
  ]);
  const t = civics.topics[1];
  assert.equal(t.title, 'The Federal Legislative Process');
  assert.equal(t.kind, 'process');
  const l = t.lessons[0];
  assert.equal(l.title, 'How an Idea Becomes Federal Law');
  assert.deepEqual([l.sections.length, l.keyFacts.length, l.quiz.length, l.sources.length], [4, 6, 6, 6]);
  assert.ok(l.quiz.every((q) => q.explanation.length > 0));
  assert.equal(new Set(l.sources.map((s) => s.url)).size, l.sources.length);
  // lesson ids are unique across all content
  const ids = disciplines.flatMap((d) => d.topics.flatMap((x) => x.lessons.map((y) => y.id)));
  assert.equal(new Set(ids).size, ids.length);
});

test('mastery counts passed lessons across both Civics topics', () => {
  const lk = (ids) => completionLookup(ids.map((id) => row(id)), disciplines);
  assert.equal(passedInDiscipline(civics, lk(['les_lp01'])), 1);
  assert.equal(masteryLine(masteryFor(passedInDiscipline(civics, lk(['les_lp01'])))), '1 lesson · Novice');
  assert.equal(passedInDiscipline(civics, lk(CIVICS)), 4);
  assert.equal(masteryFor(passedInDiscipline(civics, lk(CIVICS))).tier, 'Novice');
  assert.equal(passedInDiscipline(civics, lk([...CIVICS, 'les_st01'])), 4);
});

test('dashboard/progress per-discipline totals include the new lesson', () => {
  const d = dashboardData([row('les_lp01'), row('les_br01', false)], disciplines);
  const c = d.perDiscipline.find((x) => x.slug === 'american-civics');
  assert.deepEqual([c.passed, c.total, c.mastery.tier], [1, 4, 'Novice']);
  const all = disciplines.reduce((n, x) => n + x.topics.reduce((m, t) => m + t.lessons.length, 0), 0);
  assert.deepEqual(d.lessons, { passed: 1, total: all });
});

test('Library Wall shelves one Civics volume per topic with a passed lesson', () => {
  const groups = buildBookshelf([row('les_cc01'), row('les_lp01')], disciplines);
  const g = groups.find((x) => x.discipline.slug === 'american-civics');
  assert.deepEqual(g.books.map((b) => [b.topicSlug, b.passedCount]), [['constitution-bill-of-rights', 1], ['federal-legislative-process', 1]]);
  const only = buildBookshelf([row('les_lp01')], disciplines).find((x) => x.discipline.slug === 'american-civics');
  assert.deepEqual(only.books.map((b) => b.topicSlug), ['federal-legislative-process']);
  assert.equal(passedInTopic(civics.topics[1], completionLookup([row('les_lp01')], disciplines)), 1);
});

test('Civics completionist needs all 4 lessons across both topics', () => {
  const by = (rows) => Object.fromEntries(evaluateAchievements(rows, disciplines).map((a) => [a.id, a]));
  assert.equal(by([]) ['completionist:american-civics'].progress, '0/4 lessons');
  const three = by(['les_cc01', 'les_br01', 'les_br02'].map((id) => row(id)));
  assert.equal(three['completionist:american-civics'].earned, false);
  assert.equal(three['completionist:american-civics'].progress, '3/4 lessons');
  assert.equal(by(CIVICS.map((id) => row(id)))['completionist:american-civics'].earned, true);
});

test('topic and discipline pages render counts and mastery from content, not hardcoded', () => {
  const src = (f) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
  assert.match(src('app/d/[discipline]/page.tsx'), /discipline\.topics\.map/);
  assert.match(src('app/d/[discipline]/page.tsx'), /t\.lessons\.length/);
  assert.match(src('app/d/[discipline]/[topic]/page.tsx'), /<DisciplineMastery disciplineSlug=\{discipline\.slug\}/);
});

// TSK-022 lesson 2: Philosophy gains a third topic (aristotle-virtue-ethics / les_ar01, kind concept).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { masteryFor, passedInDiscipline } from '../../src/lib/progress/mastery.mjs';
import { buildBookshelf, completionLookup } from '../../src/lib/progress/logic.mjs';
import { dashboardData } from '../../src/lib/progress/dashboard.mjs';
import { evaluateAchievements } from '../../src/achievements/definitions.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const ph = disciplines.find((d) => d.slug === 'philosophy');
const row = (lesson_id, passed = true, at = '2026-10-10T17:00:00Z') => ({ lesson_id, score: passed ? 6 : 1, total: 6, passed, completed_at: at, first_passed_at: passed ? at : null });
const PH = ['les_so01', 'les_st01', 'les_st02', 'les_ar01'];

test('Philosophy topics in order; Aristotle topic holds les_ar01 with the long-lesson shape', () => {
  assert.deepEqual(ph.topics.map((t) => [t.slug, t.kind, t.lessons.map((l) => l.id)]), [
    ['socrates', 'person', ['les_so01']], ['stoicism', 'style', ['les_st01', 'les_st02']], ['aristotle-virtue-ethics', 'concept', ['les_ar01']],
  ]);
  const t = ph.topics[2];
  assert.equal(t.title, 'Aristotle’s Virtue Ethics');
  const l = t.lessons[0];
  assert.equal(l.title, 'Aristotle: Becoming the Kind of Person Who Acts Well');
  assert.deepEqual([l.sections.length, l.keyFacts.length, l.quiz.length, l.sources.length], [4, 6, 6, 3]);
  assert.deepEqual(l.quiz.map((q) => q.answerIndex), [1, 3, 0, 2, 1, 3]);
  assert.ok(l.quiz.every((q) => q.explanation.length > 0));
  assert.equal(new Set(l.sources.map((s) => s.url)).size, l.sources.length);
  // still six disciplines: no new discipline was created
  assert.equal(disciplines.length, 6);
});

test('mastery, dashboard and progress counts include les_ar01', () => {
  const lk = (ids) => completionLookup(ids.map((id) => row(id)), disciplines);
  assert.equal(passedInDiscipline(ph, lk(['les_ar01'])), 1);
  assert.equal(passedInDiscipline(ph, lk(PH)), 4);
  assert.equal(masteryFor(passedInDiscipline(ph, lk(PH))).tier, 'Novice');
  const p = dashboardData([row('les_ar01')], disciplines).perDiscipline.find((x) => x.slug === 'philosophy');
  assert.deepEqual([p.passed, p.total], [1, 4]);
});

test('Library Wall shelves an Aristotle volume; completionist needs all 4 Philosophy lessons', () => {
  const g = buildBookshelf([row('les_st01'), row('les_ar01')], disciplines).find((x) => x.discipline.slug === 'philosophy');
  assert.deepEqual(g.books.map((b) => b.topicSlug), ['stoicism', 'aristotle-virtue-ethics']);
  const by = (ids) => Object.fromEntries(evaluateAchievements(ids.map((id) => row(id)), disciplines).map((a) => [a.id, a]));
  assert.equal(by(PH.slice(0, 3))['completionist:philosophy'].progress, '3/4 lessons');
  assert.equal(by(PH)['completionist:philosophy'].earned, true);
});

test('spine titles set every glyph sideways, so a curly apostrophe (Aristotle’s) is not stood upright', () => {
  const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.spine \.t \{[^}]*writing-mode: vertical-rl; text-orientation: sideways;/);
});

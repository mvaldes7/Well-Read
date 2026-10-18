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

test('existing Poetry & Literature discipline (not duplicated) gains Reading Poetry (les_rp01) and Langston Hughes (les_lh01)', () => {
  assert.equal(disciplines.filter((d) => /literature/i.test(d.slug + d.title)).length, 1);
  assert.equal(lit.title, 'Poetry & Literature');
  assert.deepEqual(lit.topics.map((t) => [t.slug, t.kind, t.lessons.map((l) => l.id)]), [
    ['classic-novels', 'style', ['les_cn01']], ['reading-poetry', 'technique', ['les_rp01']], ['langston-hughes', 'person', ['les_lh01']], ['homer', 'person', ['les_hm01']],
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
  assert.deepEqual([p.passed, p.total], [1, 4]);
  const g = buildBookshelf([row('les_cn01'), row('les_rp01')], disciplines).find((x) => x.discipline.slug === 'poetry-and-literature');
  assert.deepEqual(g.books.map((b) => b.topicSlug), ['classic-novels', 'reading-poetry']);
  const by = (ids) => Object.fromEntries(evaluateAchievements(ids.map((id) => row(id)), disciplines).map((a) => [a.id, a]));
  assert.equal(by(['les_cn01'])['completionist:poetry-and-literature'].progress, '1/4 lessons');
  assert.equal(by(['les_cn01', 'les_rp01'])['completionist:poetry-and-literature'].earned, false);
  assert.equal(by(['les_cn01', 'les_rp01', 'les_lh01'])['completionist:poetry-and-literature'].earned, false);
  assert.equal(by(['les_cn01', 'les_rp01', 'les_lh01', 'les_hm01'])['completionist:poetry-and-literature'].earned, true);
});

test('lesson 4: Langston Hughes (les_lh01) shape, Library Wall volume, mastery', () => {
  const t = lit.topics[2];
  assert.deepEqual([t.slug, t.title, t.kind], ['langston-hughes', 'Langston Hughes', 'person']);
  const l = t.lessons[0];
  assert.equal(l.title, 'Langston Hughes: Poetry with the Rhythm of Everyday Life');
  assert.deepEqual([l.sections.length, l.keyFacts.length, l.quiz.length, l.sources.length], [4, 6, 6, 5]);
  assert.deepEqual(l.quiz.map((q) => q.answerIndex), [2, 0, 3, 1, 2, 0]);
  assert.ok(l.quiz.every((q) => q.explanation.length > 0));
  assert.equal(new Set(l.sources.map((s) => s.url)).size, l.sources.length);
  const g = buildBookshelf(['les_cn01', 'les_rp01', 'les_lh01'].map((id) => row(id)), disciplines).find((x) => x.discipline.slug === 'poetry-and-literature');
  assert.deepEqual(g.books.map((b) => [b.topicSlug, b.passedCount]), [['classic-novels', 1], ['reading-poetry', 1], ['langston-hughes', 1]]);
  const lk = completionLookup(['les_cn01', 'les_rp01', 'les_lh01'].map((id) => row(id)), disciplines);
  assert.equal(passedInDiscipline(lit, lk), 3);
});

test('curly quotes: titles that carry them still render on spines (sideways orientation for every glyph)', () => {
  const curly = disciplines.flatMap((d) => d.topics).filter((t) => /[‘’“”]/.test(t.title)).map((t) => t.slug);
  assert.ok(curly.includes('aristotle-virtue-ethics'));
  const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.spine \.t \{[^}]*text-orientation: sideways;/);
});

test('lesson 5: Homer (les_hm01) shape, Library Wall volume, mastery across 4 topics', () => {
  const t = lit.topics[3];
  assert.deepEqual([t.slug, t.title, t.kind], ['homer', 'Homer', 'person']);
  const l = t.lessons[0];
  assert.equal(l.title, 'Homer: War, Homecoming, and the Making of an Epic');
  assert.deepEqual([l.sections.length, l.keyFacts.length, l.quiz.length, l.sources.length], [4, 6, 6, 4]);
  assert.deepEqual(l.quiz.map((q) => q.answerIndex), [2, 0, 3, 1, 2, 0]);
  assert.ok(l.quiz.every((q) => q.explanation.length > 0));
  assert.equal(new Set(l.sources.map((s) => s.url)).size, l.sources.length);
  const ids = ['les_cn01', 'les_rp01', 'les_lh01', 'les_hm01'];
  const g = buildBookshelf(ids.map((id) => row(id)), disciplines).find((x) => x.discipline.slug === 'poetry-and-literature');
  assert.deepEqual(g.books.map((b) => b.topicSlug), ['classic-novels', 'reading-poetry', 'langston-hughes', 'homer']);
  assert.equal(passedInDiscipline(lit, completionLookup(ids.map((id) => row(id)), disciplines)), 4);
});

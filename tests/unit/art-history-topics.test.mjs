import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBookshelf } from '../../src/lib/progress/logic.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const row = (lesson_id, passed = true, at = '2026-10-23T17:00:00Z') => ({ lesson_id, score: passed ? 6 : 1, total: 6, passed, completed_at: at, first_passed_at: passed ? at : null });

test('Library Wall shelves one Renaissance volume (now with Perspective) and one early twentieth-century volume', () => {
  const g = buildBookshelf([row('les_ir01'), row('les_cu01')], disciplines).find((x) => x.discipline.slug === 'art-history');
  assert.deepEqual(g.books.map((b) => [b.topicSlug, b.passedCount, b.lessonCount, b.href]), [
    ['renaissance', 1, 3, '/d/art-history/renaissance'],
    ['early-twentieth-century-art', 1, 2, '/d/art-history/early-twentieth-century-art'],
  ]);
  const both = buildBookshelf([row('les_ir01'), row('les_nr01')], disciplines).find((x) => x.discipline.slug === 'art-history');
  assert.deepEqual(both.books.map((b) => [b.topicSlug, b.passedCount, b.lessonCount]), [['renaissance', 2, 3]]);
  const pe = buildBookshelf([row('les_pe01')], disciplines).find((x) => x.discipline.slug === 'art-history');
  assert.deepEqual(pe.books.map((b) => [b.topicSlug, b.passedCount, b.lessonCount]), [['renaissance', 1, 3]]);
});

test('round 2: Perspective joins The Renaissance; the Renaissance lesson no longer repeats its one-point walkthrough or Dig deeper choice', () => {
  const ah = disciplines.find((d) => d.slug === 'art-history');
  const ren = ah.topics.find((t) => t.slug === 'renaissance');
  assert.deepEqual(ren.lessons.map((l) => l.id), ['les_ir01', 'les_pe01', 'les_nr01']);
  assert.equal(ah.topics.some((t) => t.slug === 'perspective'), false);
  const [ir, pe] = ren.lessons;
  assert.equal(pe.slug, 'how-paintings-create-depth');
  const irChoices = ir.digDeeper.map((c) => c.id);
  const peChoices = pe.digDeeper.map((c) => c.id);
  assert.equal(irChoices.includes('linear-perspective'), false);
  assert.equal(irChoices.filter((id) => peChoices.includes(id)).length, 0);
  assert.ok(irChoices.includes('humanism'));
  const irText = ir.sections.map((s) => s.body).join(' ') + ir.quiz.map((q) => q.question).join(' ');
  assert.doesNotMatch(irText, /hallway/i);
  assert.match(pe.sections.map((s) => s.body).join(' '), /hallway/);
  assert.equal(ir.quiz.length, 6);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBookshelf } from '../../src/lib/progress/logic.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const row = (lesson_id, passed = true, at = '2026-10-23T17:00:00Z') => ({ lesson_id, score: passed ? 6 : 1, total: 6, passed, completed_at: at, first_passed_at: passed ? at : null });

test('Library Wall shelves one Renaissance volume and one early twentieth-century volume', () => {
  const g = buildBookshelf([row('les_ir01'), row('les_cu01')], disciplines).find((x) => x.discipline.slug === 'art-history');
  assert.deepEqual(g.books.map((b) => [b.topicSlug, b.passedCount, b.lessonCount, b.href]), [
    ['renaissance', 1, 2, '/d/art-history/renaissance'],
    ['early-twentieth-century-art', 1, 2, '/d/art-history/early-twentieth-century-art'],
  ]);
  const both = buildBookshelf([row('les_ir01'), row('les_nr01')], disciplines).find((x) => x.discipline.slug === 'art-history');
  assert.deepEqual(both.books.map((b) => [b.topicSlug, b.passedCount, b.lessonCount]), [['renaissance', 2, 2]]);
});

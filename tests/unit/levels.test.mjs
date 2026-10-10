import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LESSONS_PER_LEVEL, levelFor, levelProgressText, passedInTopic } from '../../src/lib/progress/levels.mjs';
import { bestCompletions, buildBookshelf, completionLookup } from '../../src/lib/progress/logic.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const row = (lesson_id, score, total, passed, completed_at) => ({ lesson_id, score, total, passed, ...(completed_at === undefined ? {} : { completed_at }) });

test('levelFor at the AC-4 boundaries', () => {
  const cases = [
    [0, null, 0, 1, 1, 'Pass a lesson to reach Level 1'],
    [1, 1, 1, 5, 2, '1/5 to Level 2'],
    [3, 1, 3, 5, 2, '3/5 to Level 2'],
    [4, 1, 4, 5, 2, '4/5 to Level 2'],
    [5, 2, 0, 5, 3, '0/5 to Level 3'],
    [9, 2, 4, 5, 3, '4/5 to Level 3'],
    [10, 3, 0, 5, 4, '0/5 to Level 4'],
    [15, 4, 0, 5, 5, '0/5 to Level 5'],
  ];
  for (const [n, level, toward, needed, nextLevel, text] of cases) {
    const info = levelFor(n);
    assert.deepEqual(info, { level, passed: n, toward, needed, nextLevel }, `n=${n}`);
    assert.equal(levelProgressText(info), text, `n=${n}`);
  }
  assert.equal(LESSONS_PER_LEVEL, 5);
});

test('levelFor clamps bad input instead of throwing', () => {
  for (const bad of [-1, -5, -0.5, NaN, Infinity, -Infinity, '3', null, undefined, {}, [3]]) {
    assert.deepEqual(levelFor(bad), { level: null, passed: 0, toward: 0, needed: 1, nextLevel: 1 }, String(bad));
  }
  assert.equal(levelFor(4.9).level, 1);
  assert.equal(levelFor(4.9).passed, 4);
  assert.equal(levelFor(5.2).level, 2);
  assert.equal(levelFor(0.7).level, null);
});

test('passedInTopic counts distinct passed lessons that exist in the topic', () => {
  const stoicism = disciplines.find((d) => d.slug === 'philosophy').topics.find((t) => t.slug === 'stoicism');
  const rows = [row('les_st01', 3, 3, true), row('les_st01', 3, 3, true), row('les_st02', 1, 4, false), row('les_gone01', 4, 4, true), row('les_rr01', 4, 4, true)];
  assert.equal(passedInTopic(stoicism, completionLookup(rows, disciplines)), 1);
  assert.equal(passedInTopic(stoicism, completionLookup([...rows, row('les_st02', 4, 4, true)], disciplines)), 2);
  assert.equal(passedInTopic(stoicism, completionLookup([], disciplines)), 0);
});

test('books carry their topic level', () => {
  const groups = buildBookshelf([row('les_st01', 3, 3, true), row('les_st02', 4, 4, true)], disciplines);
  assert.deepEqual(groups.flatMap((g) => g.books.map((b) => [b.topicSlug, b.passedCount, b.level])), [['stoicism', 2, 1]]);
});

test('bestCompletions keeps the best row and its completed_at; bad dates become null', () => {
  const m = bestCompletions([
    row('les_st01', 2, 3, false, '2026-10-01T10:00:00Z'),
    row('les_st01', 3, 3, true, '2026-10-03T10:00:00+00:00'),
    row('les_rr01', 4, 4, true, 'not a date'),
    row('les_fr01', 3, 4, true),
    row('les_gone01', 4, 4, true, '2026-10-01T10:00:00Z'),
  ], disciplines);
  assert.deepEqual(m.get('les_st01'), { score: 3, total: 3, passed: true, completedAt: '2026-10-03T10:00:00.000Z', firstPassedAt: null });
  assert.equal(m.get('les_rr01').completedAt, null);
  assert.equal(m.get('les_fr01').completedAt, null);
  assert.equal(m.has('les_gone01'), false);
});

test('bestCompletions reads first_passed_at on passed rows; earliest across duplicates; ignored on failed rows', () => {
  const r = (id, score, total, passed, completed_at, first_passed_at) => ({ lesson_id: id, score, total, passed, completed_at, first_passed_at });
  const m = bestCompletions([
    r('les_st01', 4, 6, true, '2026-10-04T10:00:00Z', '2026-10-02T10:00:00+00:00'),
    r('les_st01', 6, 6, true, '2026-10-05T10:00:00Z', '2026-10-03T10:00:00Z'), // better row, later stamp
    r('les_rr01', 1, 6, false, '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z'), // failed: ignored
    r('les_fr01', 5, 6, true, '2026-10-01T10:00:00Z', 'garbage'),
    { lesson_id: 'les_so01', score: 5, total: 6, passed: true, completed_at: '2026-10-01T10:00:00Z' }, // column missing
  ], disciplines);
  assert.deepEqual(m.get('les_st01'), { score: 6, total: 6, passed: true, completedAt: '2026-10-05T10:00:00.000Z', firstPassedAt: '2026-10-02T10:00:00.000Z' });
  assert.equal(m.get('les_rr01').firstPassedAt, null);
  assert.equal(m.get('les_fr01').firstPassedAt, null);
  assert.equal(m.get('les_so01').firstPassedAt, null);
  // A failed duplicate after a passed one keeps the passed row and its stamp.
  const k = bestCompletions([r('les_st01', 5, 6, true, '2026-10-02T10:00:00Z', '2026-10-02T10:00:00Z'), r('les_st01', 1, 6, false, '2026-10-09T10:00:00Z', null)], disciplines);
  assert.equal(k.get('les_st01').firstPassedAt, '2026-10-02T10:00:00.000Z');
});

test('progressColumns: with and without first_passed_at', async () => {
  const { progressColumns } = await import('../../src/lib/progress/logic.mjs');
  assert.equal(progressColumns(true), 'lesson_id, score, total, passed, completed_at, first_passed_at');
  assert.equal(progressColumns(false), 'lesson_id, score, total, passed, completed_at');
});

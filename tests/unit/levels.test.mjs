import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LESSONS_PER_LEVEL, levelFor, levelProgressText, passedInTopic } from '../../src/lib/progress/levels.mjs';
import { buildBookshelf, completionLookup } from '../../src/lib/progress/logic.mjs';

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

test('TSK-019: books carry no level and spines render no Lv/Lvl label', () => {
  const groups = buildBookshelf([row('les_st01', 3, 3, true), row('les_st02', 4, 4, true)], disciplines);
  const books = groups.flatMap((g) => g.books);
  assert.deepEqual(books.map((b) => [b.topicSlug, b.passedCount]), [['stoicism', 2]]);
  assert.ok(books.every((b) => !('level' in b)));
  const page = readFileSync(new URL('../../src/app/bookshelf/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /\bLvl?\b|book\.level|cap lv/);
  const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.cap\.lv/);
});

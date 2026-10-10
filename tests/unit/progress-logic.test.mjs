import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bookLabel, buildBookshelf, completionLookup, isCompletionRow, saveMessage } from '../../src/lib/progress/logic.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const row = (lesson_id, score, total, passed) => ({ lesson_id, score, total, passed });
const summary = (books) => books.map((b) => `${b.topicTitle} (${b.passedCount})`);

test('QA fixture: les_st01 and les_rr01 passed -> Roman Republic (1) and Stoicism (1)', () => {
  const books = buildBookshelf([row('les_st01', 3, 3, true), row('les_rr01', 4, 4, true)], disciplines);
  // Content order: World History before Philosophy, regardless of row order.
  assert.deepEqual(summary(books), ['The Roman Republic (1)', 'Stoicism (1)']);
  assert.deepEqual(books[0], {
    disciplineSlug: 'world-history',
    disciplineTitle: 'World History',
    topicSlug: 'roman-republic',
    topicTitle: 'The Roman Republic',
    passedCount: 1,
    lessonCount: 1,
    href: '/d/world-history/roman-republic',
  });
  assert.equal(books[1].href, '/d/philosophy/stoicism');
  assert.equal(books[1].lessonCount, 2);
});

test('unknown lesson ids are ignored', () => {
  const books = buildBookshelf([row('les_gone01', 4, 4, true), row('les_st01', 3, 3, true)], disciplines);
  assert.deepEqual(summary(books), ['Stoicism (1)']);
  assert.equal(completionLookup([row('les_gone01', 4, 4, true)], disciplines).size, 0);
});

test('failed rows are not counted (but appear in the lookup)', () => {
  const rows = [row('les_fr01', 2, 4, false), row('les_st01', 1, 3, false)];
  assert.deepEqual(buildBookshelf(rows, disciplines), []);
  assert.deepEqual(completionLookup(rows, disciplines).get('les_fr01'), { score: 2, total: 4, passed: false });
});

test('multiple passed lessons in one topic are counted together', () => {
  const rows = [row('les_st01', 3, 3, true), row('les_st02', 3, 4, true), row('les_fr01', 4, 4, true), row('les_fr02', 1, 4, false)];
  assert.deepEqual(summary(buildBookshelf(rows, disciplines)), ['The French Revolution (1)', 'Stoicism (2)']);
});

test('empty input gives an empty shelf and lookup', () => {
  assert.deepEqual(buildBookshelf([], disciplines), []);
  assert.equal(completionLookup([], disciplines).size, 0);
});

test('duplicate rows are deduped with the best-attempt rule', () => {
  const rows = [row('les_st01', 1, 3, false), row('les_st01', 3, 3, true), row('les_st01', 2, 3, false), row('les_st01', 3, 3, true)];
  assert.deepEqual(summary(buildBookshelf(rows, disciplines)), ['Stoicism (1)']);
  assert.deepEqual(completionLookup(rows, disciplines).get('les_st01'), { score: 3, total: 3, passed: true });
  const fails = [row('les_fr01', 1, 4, false), row('les_fr01', 2, 4, false)];
  assert.deepEqual(completionLookup(fails, disciplines).get('les_fr01'), { score: 2, total: 4, passed: false });
});

test('malformed rows are dropped', () => {
  const junk = [null, 'x', { lesson_id: 'les_st01' }, { lesson_id: 'les_st01', score: '3', total: 3, passed: true },
    { lesson_id: 'les_st01', score: 3, total: 0, passed: true }, { lesson_id: 7, score: 3, total: 3, passed: true }];
  for (const j of junk) assert.equal(isCompletionRow(j), false, JSON.stringify(j));
  assert.deepEqual(buildBookshelf(junk, disciplines), []);
});

test('book label includes the count; save messages distinguish attempts from progress', () => {
  const [book] = buildBookshelf([row('les_st01', 3, 3, true), row('les_st02', 4, 4, true)], disciplines);
  assert.equal(bookLabel(book), 'Stoicism (Philosophy): 2 lessons completed');
  const [one] = buildBookshelf([row('les_rr01', 4, 4, true)], disciplines);
  assert.equal(bookLabel(one), 'The Roman Republic (World History): 1 lesson completed');
  assert.equal(saveMessage('saved', false), 'Attempt saved.');
  assert.equal(saveMessage('saved', true), 'Progress saved.');
  assert.equal(saveMessage('kept', false), 'Your earlier best result is kept.');
  assert.match(saveMessage('failed', true), /couldn't be saved/);
});

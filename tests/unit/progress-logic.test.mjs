import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bookLabel, buildBookshelf, completionLookup, isCompletionRow, saveMessage } from '../../src/lib/progress/logic.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const row = (lesson_id, score, total, passed) => ({ lesson_id, score, total, passed });
const summary = (books) => books.map((b) => `${b.topicTitle} (${b.passedCount})`);
// Groups as [discipline title, color, [book summaries]] for compact asserts.
const shelf = (groups) => groups.map((g) => [g.discipline.title, g.discipline.color, summary(g.books)]);
const color = (slug) => disciplines.find((d) => d.slug === slug).color;
const WH = ['World History', color('world-history')];
const PH = ['Philosophy', color('philosophy')];

test('QA fixture: les_st01 + les_rr01 -> World History [Roman Republic (1)] then Philosophy [Stoicism (1)]', () => {
  const groups = buildBookshelf([row('les_st01', 3, 3, true), row('les_rr01', 4, 4, true)], disciplines);
  assert.deepEqual(shelf(groups), [[...WH, ['The Roman Republic (1)']], [...PH, ['Stoicism (1)']]]);
  assert.deepEqual(groups[0].discipline, { slug: 'world-history', title: 'World History', color: 'crimson' });
  assert.deepEqual(groups[1].discipline, { slug: 'philosophy', title: 'Philosophy', color: 'navy' });
  assert.deepEqual(groups.map((g) => g.position), [1, 2]);
  assert.deepEqual(groups[0].books[0], {
    disciplineSlug: 'world-history',
    disciplineTitle: 'World History',
    topicSlug: 'roman-republic',
    topicTitle: 'The Roman Republic',
    passedCount: 1,
    lessonCount: 1,
    href: '/d/world-history/roman-republic',
  });
  assert.equal(groups[1].books[0].href, '/d/philosophy/stoicism');
});

test('unknown lesson ids are ignored', () => {
  const groups = buildBookshelf([row('les_gone01', 4, 4, true), row('les_st01', 3, 3, true)], disciplines);
  assert.deepEqual(shelf(groups), [[...PH, ['Stoicism (1)']]]);
  assert.equal(completionLookup([row('les_gone01', 4, 4, true)], disciplines).size, 0);
});

test('failed rows are not counted (but appear in the lookup)', () => {
  const rows = [row('les_fr01', 2, 4, false), row('les_st01', 1, 3, false)];
  assert.deepEqual(buildBookshelf(rows, disciplines), []);
  assert.deepEqual(completionLookup(rows, disciplines).get('les_fr01'), { score: 2, total: 4, passed: false });
});

test('two passed lessons in one topic make one book with count 2', () => {
  const groups = buildBookshelf([row('les_st01', 3, 3, true), row('les_st02', 3, 4, true)], disciplines);
  assert.deepEqual(shelf(groups), [[...PH, ['Stoicism (2)']]]);
  assert.equal(groups[0].books.length, 1);
});

test('a discipline with nothing passed is omitted; topics keep content order', () => {
  const rows = [row('les_st01', 3, 3, true), row('les_so01', 4, 4, true), row('les_fr02', 1, 4, false)];
  const groups = buildBookshelf(rows, disciplines);
  assert.deepEqual(groups.map((g) => g.discipline.slug), ['philosophy']);
  assert.equal(groups[0].position, 2, 'gallery number follows content order, not group order');
  assert.ok(groups.every((g) => g.books.length > 0));
});

test('empty input gives no groups and an empty lookup', () => {
  assert.deepEqual(buildBookshelf([], disciplines), []);
  assert.equal(completionLookup([], disciplines).size, 0);
});

test('duplicate rows are deduped with the best-attempt rule', () => {
  const rows = [row('les_st01', 1, 3, false), row('les_st01', 3, 3, true), row('les_st01', 2, 3, false), row('les_st01', 3, 3, true)];
  assert.deepEqual(shelf(buildBookshelf(rows, disciplines)), [[...PH, ['Stoicism (1)']]]);
  assert.deepEqual(completionLookup(rows, disciplines).get('les_st01'), { score: 3, total: 3, passed: true });
  const fails = [row('les_fr01', 1, 4, false), row('les_fr01', 2, 4, false)];
  assert.deepEqual(completionLookup(fails, disciplines).get('les_fr01'), { score: 2, total: 4, passed: false });
});

test('every color token maps to exactly one CSS rule (a 3-shade family) in globals.css', async () => {
  const { DISCIPLINE_COLORS } = await import('../../src/content/colors.mjs');
  const { SPINE } = await import('../../src/lib/progress/logic.mjs');
  const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
  for (const c of DISCIPLINE_COLORS) {
    const rules = [...css.matchAll(new RegExp(`\\.cover-${c}\\s*\\{([^}]*)\\}`, 'g'))];
    assert.equal(rules.length, 1, `one rule for ${c}`);
    for (let i = 0; i < SPINE.shades; i++) assert.match(rules[0][1], new RegExp(`--shade-${i}:\\s*#[0-9a-f]{6};`), `${c} shade ${i}`);
  }
  for (let i = 0; i < SPINE.shades; i++) assert.match(css, new RegExp(`\\.shade-${i}\\s*\\{\\s*--spine:\\s*var\\(--shade-${i}\\);`));
});

test('malformed rows are dropped', () => {
  const junk = [null, 'x', { lesson_id: 'les_st01' }, { lesson_id: 'les_st01', score: '3', total: 3, passed: true },
    { lesson_id: 'les_st01', score: 3, total: 0, passed: true }, { lesson_id: 7, score: 3, total: 3, passed: true }];
  for (const j of junk) assert.equal(isCompletionRow(j), false, JSON.stringify(j));
  assert.deepEqual(buildBookshelf(junk, disciplines), []);
});

test('book label includes the count; save messages distinguish attempts from progress', () => {
  const [book] = buildBookshelf([row('les_st01', 3, 3, true), row('les_st02', 4, 4, true)], disciplines)[0].books;
  assert.equal(bookLabel(book), 'Stoicism (Philosophy): 2 lessons completed');
  const [one] = buildBookshelf([row('les_rr01', 4, 4, true)], disciplines)[0].books;
  assert.equal(bookLabel(one), 'The Roman Republic (World History): 1 lesson completed');
  assert.equal(saveMessage('saved', false), 'Attempt saved.');
  assert.equal(saveMessage('saved', true), 'Progress saved.');
  assert.equal(saveMessage('kept', false), 'Your earlier best result is kept.');
  assert.match(saveMessage('failed', true), /couldn't be saved/);
});

test('spineStyle is deterministic and within bounds', async () => {
  const { spineStyle, hash32, SPINE } = await import('../../src/lib/progress/logic.mjs');
  assert.equal(hash32(''), 0x811c9dc5);
  assert.equal(hash32('a'), 0xe40c292c); // FNV-1a 32 reference value
  const keys = [];
  for (const d of disciplines) for (const t of d.topics) keys.push(`${d.slug}/${t.slug}`);
  for (let i = 0; i < 500; i++) keys.push(`k${i}-${'x'.repeat(i % 37)}`);
  keys.push('', 'é', '🙂'.repeat(5));
  for (const k of keys) {
    const s = spineStyle(k);
    assert.deepEqual(spineStyle(k), s, `stable for ${k}`);
    assert.ok(Number.isInteger(s.width) && s.width >= SPINE.minWidth && s.width <= SPINE.maxWidth, `width ${k}`);
    assert.ok(Number.isInteger(s.height) && s.height >= SPINE.minHeight && s.height <= SPINE.maxHeight, `height ${k}`);
    assert.ok(Number.isInteger(s.shade) && s.shade >= 0 && s.shade < SPINE.shades, `shade ${k}`);
    assert.equal(s.fontSize, SPINE.maxFont, `no title -> full font ${k}`);
  }
  // Values actually vary across keys (not a constant).
  const sample = keys.slice(0, 200).map(spineStyle);
  assert.ok(new Set(sample.map((s) => s.width)).size > 5);
  assert.ok(new Set(sample.map((s) => s.height)).size > 10);
  assert.equal(new Set(sample.map((s) => s.shade)).size, SPINE.shades);
});

test('spineStyle makes room for the title: taller spine, smaller font only when needed', async () => {
  const { spineStyle, SPINE } = await import('../../src/lib/progress/logic.mjs');
  // Fit is measured on the longest spine line (long titles wrap onto two lines).
  const fits = (s, t) => {
    assert.equal(s.lines.join(' '), t.trim().replace(/\s+/g, ' '), 'lines keep every word');
    assert.ok(s.lines.length >= 1 && s.lines.length <= 2);
    const longest = Math.max(...s.lines.map((l) => [...l].length));
    return longest * s.fontSize * SPINE.charEm <= s.height - SPINE.chrome;
  };
  for (const d of disciplines) for (const t of d.topics) {
    const key = `${d.slug}/${t.slug}`;
    const s = spineStyle(key, t.title);
    assert.deepEqual(spineStyle(key, t.title), s);
    assert.ok(s.height >= spineStyle(key).height, `never shorter with a title: ${t.title}`);
    assert.ok(s.height <= SPINE.maxHeight && s.fontSize >= SPINE.minFont && s.fontSize <= SPINE.maxFont);
    assert.ok(fits(s, t.title), `title fits: ${t.title} ${JSON.stringify(s)}`);
  }
  assert.equal(spineStyle('k', 'Stoicism').fontSize, SPINE.maxFont);
  assert.deepEqual(spineStyle('k', 'Stoicism').lines, ['Stoicism']);
  // Two lines only when one line can't fit at minFont; balanced at a word break.
  assert.deepEqual(spineStyle('k', 'The Constitutional Convention of 1787').lines, ['The Constitutional', 'Convention of 1787']);
  assert.deepEqual(spineStyle('k', 'The French Revolution').lines, ['The French Revolution']);
  assert.deepEqual(spineStyle('k', 'Supercalifragilisticexpialidociousness').lines.length, 1); // one word can't wrap
  // Bounds match C2's measured proportions of the 340px case.
  assert.ok(SPINE.minHeight / SPINE.caseHeight >= 0.73 && SPINE.maxHeight / SPINE.caseHeight <= 0.85);
  const rr = spineStyle('world-history/roman-republic', 'The Roman Republic');
  assert.ok(rr.height <= 286 && rr.fontSize < SPINE.maxFont, `long title shrinks the font: ${JSON.stringify(rr)}`);
  const long = spineStyle('k', 'A Very Long Topic Title That Cannot Fit');
  assert.equal(long.height, SPINE.maxHeight);
  assert.equal(long.fontSize, SPINE.minFont); // floor reached; CSS ellipsis covers the rest
  // Same key + title, same result; width and shade don't depend on the title.
  assert.equal(spineStyle('k', 'Stoicism').width, spineStyle('k').width);
  assert.equal(spineStyle('k', 'Stoicism').shade, spineStyle('k').shade);
});

test('realistic Supabase rows (integer columns arrive as JSON numbers) open completed lessons', () => {
  // Exact shape of `select lesson_id, score, total, passed` from PostgREST for the QA account.
  const rows = JSON.parse('[{"lesson_id":"les_st01","score":4,"total":4,"passed":true},{"lesson_id":"les_rr01","score":3,"total":4,"passed":true}]');
  const lookup = completionLookup(rows, disciplines);
  assert.deepEqual(lookup.get('les_st01'), { score: 4, total: 4, passed: true });
  assert.deepEqual(lookup.get('les_rr01'), { score: 3, total: 4, passed: true });
  // Every book links to a topic that exists in content, and each lesson of a book is addressable.
  const hrefs = new Set(disciplines.flatMap((d) => d.topics.map((t) => `/d/${d.slug}/${t.slug}`)));
  const books = buildBookshelf(rows, disciplines).flatMap((g) => g.books);
  assert.equal(books.length, 2);
  for (const b of books) assert.ok(hrefs.has(b.href), b.href);
  // Never throws on what PostgREST can return for an empty or failed read.
  assert.deepEqual(buildBookshelf([], disciplines), []);
  assert.equal(completionLookup([], disciplines).size, 0);
});

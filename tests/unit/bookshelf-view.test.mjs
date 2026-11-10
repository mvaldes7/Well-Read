import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spineStyle } from '../../src/lib/progress/logic.mjs';
import {
  BOOKSHELF_VIEW_KEY,
  libraryItems,
  libraryTotals,
  packLibraryRows,
  parseBookshelfView,
  readStoredBookshelfView,
  shelfAvailableWidth,
  volumeLessonLine,
  writeStoredBookshelfView,
} from '../../src/lib/bookshelf/view.mjs';

const book = (disciplineSlug, topicSlug, topicTitle, passedCount, lessonCount = passedCount) => ({
  disciplineSlug,
  disciplineTitle: disciplineSlug,
  topicSlug,
  topicTitle,
  passedCount,
  lessonCount,
  href: `/d/${disciplineSlug}/${topicSlug}`,
});

const group = (slug, title, color, position, books) => ({
  discipline: { slug, title, color },
  position,
  books,
});

/** Widths and grouping taken from the approved bookshelf-toggle mockup. */
const MOCKUP_ITEMS = [
  { groupId: 'world-history', width: 62, groupStart: true },
  { groupId: 'world-history', width: 74 },
  { groupId: 'world-history', width: 71 },
  { groupId: 'philosophy', width: 74, groupStart: true },
  { groupId: 'philosophy', width: 69 },
  { groupId: 'american-civics', width: 71, groupStart: true },
  { groupId: 'american-civics', width: 62 },
  { groupId: 'american-civics', width: 69 },
  { groupId: 'art-history', width: 62, groupStart: true },
  { groupId: 'art-history', width: 76 },
  { groupId: 'art-history', width: 76 },
  { groupId: 'poetry', width: 62, groupStart: true },
  { groupId: 'poetry', width: 69 },
  { groupId: 'religious-studies', width: 69, groupStart: true },
];

const rowGroups = (rows) => rows.map((row) => {
  const ids = [];
  for (const item of row) {
    if (!ids.length || ids[ids.length - 1] !== item.groupId) ids.push(item.groupId);
  }
  return ids;
});

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    getItem: (key) => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null,
    setItem: (key, value) => { data[key] = String(value); },
    data,
  };
};

test('parseBookshelfView defaults to discipline and only accepts library', () => {
  assert.equal(parseBookshelfView('library'), 'library');
  assert.equal(parseBookshelfView('discipline'), 'discipline');
  assert.equal(parseBookshelfView(null), 'discipline');
  assert.equal(parseBookshelfView(''), 'discipline');
  assert.equal(parseBookshelfView('Library'), 'discipline');
  assert.equal(parseBookshelfView('whole'), 'discipline');
});

test('read and write the bookshelf view in localStorage, defaulting safely', () => {
  const storage = memoryStorage();
  assert.equal(readStoredBookshelfView(storage), 'discipline');
  writeStoredBookshelfView(storage, 'library');
  assert.equal(storage.data[BOOKSHELF_VIEW_KEY], 'library');
  assert.equal(readStoredBookshelfView(storage), 'library');
  writeStoredBookshelfView(storage, 'nope');
  assert.equal(storage.data[BOOKSHELF_VIEW_KEY], 'discipline');
  assert.equal(readStoredBookshelfView(memoryStorage({ [BOOKSHELF_VIEW_KEY]: 'library' })), 'library');
  assert.equal(readStoredBookshelfView(null), 'discipline');
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.equal(readStoredBookshelfView(throwing), 'discipline');
  assert.doesNotThrow(() => writeStoredBookshelfView(throwing, 'library'));
});

test('volumeLessonLine uses singular and plural forms', () => {
  assert.equal(volumeLessonLine(14, 22), '14 volumes · 22 lessons completed');
  assert.equal(volumeLessonLine(1, 1), '1 volume · 1 lesson completed');
  assert.equal(volumeLessonLine(1, 2), '1 volume · 2 lessons completed');
  assert.equal(volumeLessonLine(2, 1), '2 volumes · 1 lesson completed');
  assert.equal(volumeLessonLine(0, 0), '0 volumes · 0 lessons completed');
});

test('libraryTotals sums volumes and passed lessons from real group data', () => {
  const groups = [
    group('philosophy', 'Philosophy', 'navy', 2, [
      book('philosophy', 'stoicism', 'Stoicism', 3, 3),
      book('philosophy', 'utilitarianism', 'Utilitarianism', 1, 1),
    ]),
    group('american-civics', 'American Civics', 'navy', 3, [
      book('american-civics', 'electoral-college', 'The Electoral College', 1, 1),
      book('american-civics', 'george-washington', 'George Washington', 1, 1),
    ]),
  ];
  assert.deepEqual(libraryTotals(groups), {
    volumes: 4,
    lessons: 6,
    line: '4 volumes · 6 lessons completed',
  });
  assert.deepEqual(libraryTotals([]), { volumes: 0, lessons: 0, line: '0 volumes · 0 lessons completed' });
  assert.deepEqual(
    libraryTotals([group('poetry', 'Poetry', 'plum', 5, [book('poetry', 'the-iliad', 'The Iliad', 1, 1)])]),
    { volumes: 1, lessons: 1, line: '1 volume · 1 lesson completed' },
  );
});

test('libraryItems stay in discipline then topic order and mark group starts', () => {
  const groups = [
    group('world-history', 'World History', 'crimson', 1, [
      book('world-history', 'the-silk-roads', 'The Silk Roads', 1, 1),
      book('world-history', 'the-meiji-restoration', 'The Meiji Restoration', 1, 1),
    ]),
    group('philosophy', 'Philosophy', 'navy', 2, [
      book('philosophy', 'stoicism', 'Stoicism', 2, 3),
    ]),
  ];
  const items = libraryItems(groups, spineStyle);
  assert.deepEqual(items.map((item) => [item.groupId, item.book.topicSlug, item.groupStart, item.color]), [
    ['world-history', 'the-silk-roads', true, 'crimson'],
    ['world-history', 'the-meiji-restoration', false, 'crimson'],
    ['philosophy', 'stoicism', true, 'navy'],
  ]);
  assert.ok(items.every((item) => item.width === spineStyle(`${item.book.disciplineSlug}/${item.book.topicSlug}`, item.book.topicTitle).width));
});

test('wide packing keeps a discipline together and wraps on discipline boundaries', () => {
  const rows = packLibraryRows(MOCKUP_ITEMS, 800);
  assert.deepEqual(rowGroups(rows), [
    ['world-history', 'philosophy', 'american-civics'],
    ['art-history', 'poetry', 'religious-studies'],
  ]);
  assert.equal(rows[0].length, 8);
  assert.equal(rows[1].length, 6);
  assert.ok(rows.every((row) => {
    const starts = row.filter((item) => item.groupStart).map((item) => item.groupId);
    return new Set(row.map((item) => item.groupId)).size === starts.length;
  }));
});

test('narrow packing is denser: later disciplines can share a shelf', () => {
  const rows = packLibraryRows(MOCKUP_ITEMS, 298);
  assert.deepEqual(rowGroups(rows), [
    ['world-history'],
    ['philosophy'],
    ['american-civics'],
    ['art-history'],
    ['poetry', 'religious-studies'],
  ]);
});

test('packLibraryRows wraps a single book that does not fit and keeps an empty list empty', () => {
  assert.deepEqual(packLibraryRows([], 200), []);
  const rows = packLibraryRows([
    { groupId: 'a', width: 150, groupStart: true },
    { groupId: 'a', width: 80 },
    { groupId: 'b', width: 50, groupStart: true },
  ], 200);
  assert.deepEqual(rowGroups(rows), [['a'], ['a', 'b']]);
});

test('shelfAvailableWidth uses the 80/32 padding split at 600px', () => {
  assert.equal(shelfAvailableWidth(776, 800), 696);
  assert.equal(shelfAvailableWidth(376, 400), 344);
  assert.equal(shelfAvailableWidth(100, 120), 200);
});

test('the bookshelf view uses buttons with aria-pressed and no emojis', () => {
  const src = (f) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
  const view = src('components/BookshelfView.tsx');
  const page = src('app/bookshelf/page.tsx');
  assert.match(view, /role="group"/);
  assert.match(view, /aria-label="Bookshelf view"/);
  assert.match(view, /<button[\s\S]*aria-pressed=\{view === "discipline"\}/);
  assert.match(view, /<button[\s\S]*aria-pressed=\{view === "library"\}/);
  assert.match(view, /useSyncExternalStore/);
  assert.match(view, /getBookshelfViewSnapshot/);
  assert.match(view, /getBookshelfViewServerSnapshot/);
  assert.match(view, /writeStoredBookshelfView\(window\.localStorage/);
  assert.match(view, /ArrowLeft/);
  assert.match(view, /packLibraryRows/);
  assert.match(view, /libraryTotals/);
  assert.doesNotMatch(view, /[\u{1F300}-\u{1FAFF}]/u);
  assert.doesNotMatch(page, /[\u{1F300}-\u{1FAFF}]/u);
});

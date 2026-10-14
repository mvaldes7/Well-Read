import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBookshelf, completionLookup, passedInTopic } from '../../src/lib/progress/logic.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const row = (lesson_id, score, total, passed, completed_at) => ({ lesson_id, score, total, passed, ...(completed_at === undefined ? {} : { completed_at }) });

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

test('TSK-019: the topic page shows discipline mastery, with no Level text and no topic-levels code', () => {
  const src = (f) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
  const page = src('app/d/[discipline]/[topic]/page.tsx');
  const progress = src('components/Progress.tsx');
  assert.match(page, /<DisciplineMastery /);
  for (const [name, text] of [['topic page', page], ['Progress.tsx', progress]]) {
    assert.doesNotMatch(text, /\bLevel\b|\blevel\b|levels\.mjs|TopicLevel|levelFor/, name);
  }
  assert.match(progress, /mastery\.mjs/);
  assert.doesNotMatch(src('app/globals.css'), /\.topic-level|\.level-badge|\.level-progress|\.level-text/);
  assert.throws(() => src('lib/progress/levels.mjs'), /ENOENT/);
});

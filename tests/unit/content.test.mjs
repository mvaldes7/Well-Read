// Seed content checks. The content lives in JSON so this plain-Node test and the
// typed TS loader (src/content/index.ts) read the same file without a TS runtime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const disciplines = JSON.parse(
  readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'),
);
const KINDS = ['person', 'event', 'era', 'style'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const topics = disciplines.flatMap((d) => d.topics.map((t) => ({ d, t })));
const lessons = topics.flatMap(({ d, t }) => t.lessons.map((l) => ({ d, t, l })));
const where = ({ d, t, l }) => [d?.slug, t?.slug, l?.slug].filter(Boolean).join('/');

function assertUnique(slugs, scope) {
  assert.equal(new Set(slugs).size, slugs.length, `duplicate slug in ${scope}: ${slugs.join(', ')}`);
  for (const s of slugs) assert.match(s, SLUG, `bad slug "${s}" in ${scope}`);
}

test('there is at least one discipline', () => {
  assert.ok(Array.isArray(disciplines) && disciplines.length > 0);
});

test('every discipline has topics and every topic has lessons', () => {
  for (const d of disciplines) {
    assert.ok(Array.isArray(d.topics) && d.topics.length > 0, `${d.slug} has no topics`);
    for (const t of d.topics) {
      assert.ok(Array.isArray(t.lessons) && t.lessons.length > 0, `${d.slug}/${t.slug} has no lessons`);
    }
  }
});

test('slugs are unique within their scope', () => {
  assertUnique(disciplines.map((d) => d.slug), 'disciplines');
  for (const d of disciplines) {
    assertUnique(d.topics.map((t) => t.slug), `${d.slug} topics`);
    for (const t of d.topics) assertUnique(t.lessons.map((l) => l.slug), `${d.slug}/${t.slug} lessons`);
  }
});

test('topic kinds are valid', () => {
  for (const { d, t } of topics) assert.ok(KINDS.includes(t.kind), `${where({ d, t })}: bad kind "${t.kind}"`);
});

test('required text fields are present', () => {
  for (const d of disciplines) for (const k of ['slug', 'title', 'description']) assert.ok(d[k], `${d.slug}.${k}`);
  for (const { d, t } of topics) for (const k of ['slug', 'title', 'summary']) assert.ok(t[k], `${where({ d, t })}.${k}`);
  for (const x of lessons) {
    assert.ok(x.l.title, `${where(x)}.title`);
    assert.ok(x.l.sections.length > 0, `${where(x)} has no sections`);
    for (const s of x.l.sections) assert.ok(s.heading && s.body, `${where(x)} section missing heading/body`);
    assert.ok(x.l.keyFacts.length > 0, `${where(x)} has no key facts`);
  }
});

test('every lesson has 3+ quiz questions with exactly 4 options and a valid answerIndex', () => {
  for (const x of lessons) {
    assert.ok(Array.isArray(x.l.quiz) && x.l.quiz.length >= 3, `${where(x)}: needs 3+ questions`);
    x.l.quiz.forEach((q, i) => {
      const at = `${where(x)} quiz[${i}]`;
      assert.ok(typeof q.question === 'string' && q.question.trim(), `${at}: question text`);
      assert.ok(Array.isArray(q.options) && q.options.length === 4, `${at}: exactly 4 options`);
      assert.equal(new Set(q.options).size, 4, `${at}: options must be distinct`);
      assert.ok(Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex <= 3, `${at}: answerIndex 0..3`);
    });
  }
});

test('every lesson has a permanent id that is well-formed and globally unique', async () => {
  const { lessonIdProblems, LESSON_ID_PATTERN } = await import('../../src/content/ids.mjs');
  assert.deepEqual(lessonIdProblems(disciplines), []);
  for (const x of lessons) {
    assert.match(x.l.id, LESSON_ID_PATTERN, where(x));
    assert.notEqual(x.l.id, x.l.slug, `${where(x)}: id must not equal slug`);
  }
});

test('lesson id checks reject missing, duplicate and badly formatted ids', async () => {
  const { lessonIdProblems } = await import('../../src/content/ids.mjs');
  const clone = () => JSON.parse(JSON.stringify(disciplines));

  const missing = clone();
  delete missing[0].topics[0].lessons[0].id;
  assert.match(lessonIdProblems(missing).join('\n'), /missing id/);

  const dup = clone();
  // duplicate across different disciplines (global uniqueness)
  dup[1].topics[0].lessons[0].id = dup[0].topics[0].lessons[0].id;
  assert.match(lessonIdProblems(dup).join('\n'), /duplicate id "les_rr01"/);

  for (const bad of ['rr01', 'les_', 'LES_RR01', 'les_RR01', 'les_rr-01', 'les_' + 'a'.repeat(13), 42]) {
    const b = clone();
    b[0].topics[0].lessons[0].id = bad;
    assert.match(lessonIdProblems(b).join('\n'), /bad id format/, JSON.stringify(bad));
  }

  const slugAsId = clone();
  slugAsId[0].topics[0].lessons[0].id = 'les_abcd';
  slugAsId[0].topics[0].lessons[0].slug = 'les_abcd';
  assert.match(lessonIdProblems(slugAsId).join('\n'), /must not equal the slug/);
});

test('every discipline has a cover color from the allowed set, and they differ', async () => {
  const { DISCIPLINE_COLORS, disciplineColorProblems } = await import('../../src/content/colors.mjs');
  assert.deepEqual(disciplineColorProblems(disciplines), []);
  for (const d of disciplines) assert.ok(DISCIPLINE_COLORS.includes(d.color), d.slug);
  const bySlug = Object.fromEntries(disciplines.map((d) => [d.slug, d.color]));
  assert.notEqual(bySlug['world-history'], bySlug['philosophy']);
});

test('color validator rejects missing and invalid colors', async () => {
  const { disciplineColorProblems } = await import('../../src/content/colors.mjs');
  const missing = structuredClone(disciplines);
  delete missing[0].color;
  assert.match(disciplineColorProblems(missing).join('\n'), /disciplines\[0\]: missing color/);
  for (const bad of ['#ff0000', 'red', 'Crimson', 7, '']) {
    const b = structuredClone(disciplines);
    b[1].color = bad;
    assert.match(disciplineColorProblems(b).join('\n'), bad === '' ? /missing color/ : /invalid color/, String(bad));
  }
});

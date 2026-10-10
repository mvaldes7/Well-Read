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

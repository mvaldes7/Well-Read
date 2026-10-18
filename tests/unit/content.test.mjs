// Seed content checks. The content lives in JSON so this plain-Node test and the
// typed TS loader (src/content/index.ts) read the same file without a TS runtime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const disciplines = JSON.parse(
  readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'),
);
const KINDS = ['person', 'event', 'era', 'style', 'technique', 'process'];
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

// ---------- TSK-012: sources, explanations, citation markers ----------
const fixture = (lessonPatch) => [{ slug: 'd', title: 'D', description: 'x', color: 'navy', topics: [{ slug: 't', title: 'T', kind: 'era', summary: 's', lessons: [{ id: 'les_ab01', slug: 'l', title: 'L', sections: [{ heading: 'h', body: 'b' }], keyFacts: ['k'], quiz: [{ question: 'q', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: 'e' }], ...lessonPatch }] }] }];
const SRC = { publisher: 'Encyclopaedia Britannica', title: 'Roman Republic', url: 'https://www.britannica.com/place/Roman-Republic' };

test('every lesson has sources that pass validation, and the real content has no problems', async () => {
  const { sourceProblems, explanationProblems, citationMarkerProblems } = await import('../../src/content/sources.mjs');
  assert.deepEqual(sourceProblems(disciplines), []);
  assert.deepEqual(explanationProblems(disciplines), []);
  assert.deepEqual(citationMarkerProblems(disciplines), []);
  for (const x of lessons) assert.ok(Array.isArray(x.l.sources) && x.l.sources.length > 0, `${where(x)}: no sources`);
});

test('source validator: valid source and optional note accepted', async () => {
  const { sourceProblems } = await import('../../src/content/sources.mjs');
  assert.deepEqual(sourceProblems(fixture({ sources: [SRC] })), []);
  assert.deepEqual(sourceProblems(fixture({ sources: [{ ...SRC, note: 'Overview.' }] })), []);
  assert.deepEqual(sourceProblems(fixture({})), []); // sources are optional
  assert.deepEqual(sourceProblems(fixture({ sources: [] })), []);
});

test('source validator rejects http, malformed and non-web URLs', async () => {
  const { sourceProblems, isHttpsUrl } = await import('../../src/content/sources.mjs');
  for (const url of ['http://www.britannica.com/x', 'not a url', 'https//missing-colon.org', '//britannica.com/x', '/relative/path', 'javascript:alert(1)', 'ftp://x.org/f', 'https://', ' https://x.org/a', '', 42, undefined]) {
    const p = sourceProblems(fixture({ sources: [{ ...SRC, url }] }));
    assert.equal(p.length, 1, `${JSON.stringify(url)} -> ${p}`);
    assert.match(p[0], /\.url: expected a valid https URL/);
    assert.equal(isHttpsUrl(url), false);
  }
  assert.equal(isHttpsUrl('https://plato.stanford.edu/entries/socrates/'), true);
});

test('source validator rejects missing publisher or title, empty note, unknown fields', async () => {
  const { sourceProblems } = await import('../../src/content/sources.mjs');
  const without = (key) => Object.fromEntries(Object.entries(SRC).filter(([k]) => k !== key));
  const noPub = without('publisher');
  const noTitle = without('title');
  assert.match(sourceProblems(fixture({ sources: [noPub] })).join(), /publisher: expected non-empty string/);
  assert.match(sourceProblems(fixture({ sources: [noTitle] })).join(), /title: expected non-empty string/);
  assert.match(sourceProblems(fixture({ sources: [{ ...SRC, title: '  ' }] })).join(), /title/);
  assert.match(sourceProblems(fixture({ sources: [{ ...SRC, note: '' }] })).join(), /note/);
  assert.match(sourceProblems(fixture({ sources: [{ ...SRC, href: 'x' }] })).join(), /unknown field "href"/);
  assert.match(sourceProblems(fixture({ sources: 'nope' })).join(), /expected an array/);
  assert.match(sourceProblems(fixture({ sources: [null] })).join(), /expected an object/);
});

test('source validator rejects duplicate URLs within a lesson (after URL normalisation)', async () => {
  const { sourceProblems } = await import('../../src/content/sources.mjs');
  const p = sourceProblems(fixture({ sources: [SRC, { ...SRC, title: 'Other title' }] }));
  assert.equal(p.length, 1);
  assert.match(p[0], /sources\[1\]\.url: duplicate of sources\[0\]/);
  // Host case differences normalise to the same URL.
  assert.equal(sourceProblems(fixture({ sources: [SRC, { ...SRC, url: 'https://WWW.Britannica.com/place/Roman-Republic' }] })).length, 1);
  // The same URL in two different lessons is fine (dedupe is per lesson).
  assert.deepEqual(sourceProblems([...fixture({ sources: [SRC] }), ...fixture({ sources: [SRC] })]), []);
});

test('every quiz question needs an explanation', async () => {
  const { explanationProblems } = await import('../../src/content/sources.mjs');
  for (const x of lessons) for (const q of x.l.quiz) assert.ok(typeof q.explanation === 'string' && q.explanation.trim() !== '', `${where(x)}: missing explanation`);
  const quiz = (explanation) => fixture({ quiz: [{ question: 'q', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation }] });
  assert.match(explanationProblems(quiz(undefined)).join(), /quiz\[0\]\.explanation: expected non-empty string/);
  assert.equal(explanationProblems(quiz('')).length, 1);
  assert.equal(explanationProblems(quiz('   ')).length, 1);
  assert.equal(explanationProblems(quiz(3)).length, 1);
  assert.deepEqual(explanationProblems(quiz('Because.')), []);
});

test('lesson ids are unique across ALL content', () => {
  const ids = lessons.map((x) => x.l.id);
  assert.equal(new Set(ids).size, ids.length, ids.join());
});

test('no citation markers remain in any text field', async () => {
  const { citationMarkerProblems, textFields } = await import('../../src/content/sources.mjs');
  // Independent scan of every string field except sources.
  const scan = (v, path) => {
    if (typeof v === 'string') {
      assert.doesNotMatch(v, /\[S\d+\]/, `${path}: [S#] marker`);
      assert.ok(!v.includes('(['), `${path}: '([' citation`);
      assert.doesNotMatch(v, /\]\(https?:/, `${path}: markdown link`);
    } else if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'sources') scan(x, `${path}.${k}`);
  };
  scan(disciplines, 'content');
  assert.ok(textFields(disciplines).length > 500);
  // The validator catches each kind of leftover markup.
  for (const [body, kind] of [['Text [S1].', /\[S#\]/], ['Text ([Britannica](https://x.org)).', /inline citation/], ['See [this](https://x.org).', /markdown link/], ['See https://x.org.', /bare URL/], ['**bold**', /emphasis/]]) {
    assert.match(citationMarkerProblems(fixture({ sections: [{ heading: 'h', body }] })).join(), kind, body);
  }
  assert.match(citationMarkerProblems(fixture({ quiz: [{ question: 'q', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: 'Yes [S2].' }] })).join(), /quiz\[0\]\.explanation/);
});

test('seed lessons keep their permanent ids AND slugs (saved passes stay valid)', () => {
  const seed = { les_rr01: 'how-the-republic-was-governed', les_fr01: '1789-the-revolution-begins', les_fr02: 'republic-and-terror', les_so01: 'the-examined-life', les_st01: 'origins-of-stoicism', les_st02: 'the-roman-stoics' };
  const got = Object.fromEntries(lessons.map((x) => [x.l.id, x.l.slug]));
  for (const [id, slug] of Object.entries(seed)) assert.equal(got[id], slug, id);
  for (const id of Object.keys(seed)) {
    const l = lessons.find((x) => x.l.id === id).l;
    assert.equal(l.sections.length, 3, id);
    assert.equal(l.keyFacts.length, 5, id);
    assert.equal(l.quiz.length, 6, id);
  }
});

test('imported lessons and discipline order', () => {
  assert.deepEqual(disciplines.map((d) => d.slug), ['world-history', 'philosophy', 'ancient-history', 'american-civics', 'art-history', 'poetry-and-literature']);
  const counts = Object.fromEntries(lessons.map((x) => [x.l.id, x.l.quiz.length]));
  assert.deepEqual(
    { les_ch01: counts.les_ch01, les_cc01: counts.les_cc01, les_br01: counts.les_br01, les_ir01: counts.les_ir01, les_im01: counts.les_im01, les_cn01: counts.les_cn01 },
    { les_ch01: 5, les_cc01: 6, les_br01: 5, les_ir01: 6, les_im01: 6, les_cn01: 6 },
  );
  for (const x of lessons) for (const s of x.l.sections) assert.ok(!/\n(?!\n)/.test(s.body.replace(/\n\n/g, '')), `${where(x)}: single newline inside a paragraph`);
});

test('paragraphs() splits section bodies on blank lines', async () => {
  const { paragraphs } = await import('../../src/lib/ui/paragraphs.mjs');
  assert.deepEqual(paragraphs('One.\n\nTwo.\n\n\nThree.'), ['One.', 'Two.', 'Three.']);
  assert.deepEqual(paragraphs('Single paragraph.'), ['Single paragraph.']);
  assert.deepEqual(paragraphs('  a\nb  \n \n c '), ['a b', 'c']);
  assert.deepEqual(paragraphs(''), []);
});

test('American Civics: one merged Constitution & Bill of Rights topic; lesson ids unchanged, chronological (TSK-014); TSK-022 adds federal-legislative-process after it', () => {
  const ac = disciplines.find((d) => d.slug === 'american-civics');
  assert.deepEqual(ac.topics.map((t) => t.slug), ['constitution-bill-of-rights', 'federal-legislative-process']);
  assert.equal(ac.topics[0].title, 'The Constitution & Bill of Rights');
  assert.deepEqual(ac.topics[0].lessons.map((l) => l.id), ['les_cc01', 'les_br01', 'les_br02']);
});

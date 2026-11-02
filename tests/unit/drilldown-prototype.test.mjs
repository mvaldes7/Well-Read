// P1b prototype script: all network calls are mocked; CI never calls Gemini or fetches sources.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  runPrototype, buildPrompt, findLessonChoice, callGemini, normalizeLesson, pageText, QuotaError, DEFAULT_MODEL,
} from '../../scripts/drilldown-prototype.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const ctx = findLessonChoice(disciplines, 'les_cu01', 'georges-braque');
const SRC = ctx.lesson.sources[0];
const KEY = 'test-key-not-real';

const fakeLesson = (overrides = {}) => ({
  slug: 'georges-braque', title: 'Georges Braque and Cubism',
  sections: [1, 2, 3, 4].map((i) => ({ heading: `Part ${i}`, body: `Georges Braque worked with Picasso, part ${i}.` })),
  keyFacts: [1, 2, 3, 4, 5, 6].map((i) => `Braque fact ${i}.`),
  quiz: [1, 2, 3, 4, 5, 6].map((i) => ({ question: `Q${i}?`, options: ['a', 'b', 'c', 'd'], answerIndex: 1, explanation: 'Because b.' })),
  sources: [{ url: SRC.url }], ...overrides,
});
const gem = (obj, usage = { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 }) => ({
  status: 200, ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }], usageMetadata: usage }),
});
const html = `<html><head><title>${SRC.title}</title></head><body>Georges Braque and Picasso. ${SRC.title}</body></html>`;
const page = { status: 200, ok: true, text: async () => html };
const allSupported = { items: [...Array(6)].map((_, i) => ({ ref: `fact${i + 1}`, supported: true })).concat([...Array(6)].map((_, i) => ({ ref: `quiz${i + 1}`, supported: true }))) };

function mockFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error(`unexpected fetch ${url}`);
    return typeof r === 'function' ? r(url, init) : r;
  };
  fn.calls = calls;
  return fn;
}

test('prompt uses only lesson content + the stored choice and lists curated candidate URLs', () => {
  const { system, user } = buildPrompt(ctx);
  assert.match(user, /Georges Braque/);
  assert.ok(ctx.lesson.sources.every((s) => user.includes(s.url)));
  assert.match(system, /neutrally/);
  assert.throws(() => findLessonChoice(disciplines, 'les_cu01', 'Tell me about anything'), /unknown choice/);
  assert.throws(() => findLessonChoice(disciplines, 'les_nope', 'x'), /unknown lesson/);
  assert.equal(DEFAULT_MODEL, 'gemini-3.1-flash-lite');
});

test('happy path: generate + source fetch + fact check = 2 model calls, key only in the header', async () => {
  const f = mockFetch([gem(fakeLesson()), page, gem(allSupported)]);
  const r = await runPrototype({ disciplines, lessonId: 'les_cu01', choiceId: 'georges-braque', apiKey: KEY, fetchImpl: f });
  assert.deepEqual(r.schemaProblems, []);
  assert.deepEqual(r.sourceProblems, []);
  assert.match(r.verdict, /^passed/);
  assert.equal(r.calls.length, 2);
  assert.match(r.generated.id, /^gen_[a-z0-9]{12}$/);
  assert.deepEqual(r.generated.sources, [SRC]); // metadata forced to the curated source
  const gemCalls = f.calls.filter((c) => c.url.startsWith('https://generativelanguage.googleapis.com/'));
  assert.equal(gemCalls.length, 2);
  for (const c of gemCalls) {
    assert.equal(c.init.headers['x-goog-api-key'], KEY);
    assert.ok(!c.url.includes(KEY) && !c.init.body.includes(KEY));
    assert.match(c.url, /gemini-3\.1-flash-lite:generateContent$/);
    assert.equal(JSON.parse(c.init.body).generationConfig.responseMimeType, 'application/json');
  }
  const pageCall = f.calls.find((c) => c.url === SRC.url);
  assert.ok(pageCall && !JSON.stringify(pageCall.init).includes(KEY)); // key never sent to source sites
  assert.ok(!JSON.stringify(r).includes(KEY));
});

test('never more than 3 model calls per lesson (regenerate on schema failure, then fact check)', async () => {
  const bad = fakeLesson({ keyFacts: ['only one'] });
  const f = mockFetch([gem(bad), gem(bad)]);
  const r = await runPrototype({ disciplines, lessonId: 'les_cu01', choiceId: 'georges-braque', apiKey: KEY, fetchImpl: f });
  assert.equal(r.calls.length, 2); // 2 generate attempts; the 3rd slot is reserved for the fact check
  assert.ok(r.schemaProblems.some((p) => p.includes('keyFacts')));
  assert.equal(r.verdict, 'rejected');
  const f2 = mockFetch([gem(bad), gem(fakeLesson()), page, gem(allSupported)]);
  const r2 = await runPrototype({ disciplines, lessonId: 'les_cu01', choiceId: 'georges-braque', apiKey: KEY, fetchImpl: f2 });
  assert.equal(r2.calls.length, 3);
  assert.match(r2.verdict, /^passed/);
});

test('429 / RESOURCE_EXHAUSTED stops immediately with no further calls', async () => {
  const q = { status: 429, ok: false, json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } }) };
  const f = mockFetch([q]);
  const r = await runPrototype({ disciplines, lessonId: 'les_cu01', choiceId: 'georges-braque', apiKey: KEY, fetchImpl: f });
  assert.match(r.stoppedOn, /^quota/);
  assert.equal(f.calls.length, 1);
  await assert.rejects(callGemini({ fetchImpl: mockFetch([{ status: 200, ok: true, json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED' } }) }]), apiKey: KEY, model: 'm', system: '', user: '', schema: {}, budget: { used: 0, max: 3 } }), QuotaError);
});

test('source checks: non-candidate URL, other domain, HTTP errors and title mismatch are rejected', async () => {
  const lesson = fakeLesson({ sources: [{ url: 'https://example.com/made-up' }, { url: SRC.url }] });
  const f = mockFetch([gem(lesson), { status: 404, ok: false, text: async () => '' }]);
  const r = await runPrototype({ disciplines, lessonId: 'les_cu01', choiceId: 'georges-braque', apiKey: KEY, fetchImpl: f });
  assert.ok(r.sourceProblems.some((p) => p.includes('domain not allowlisted')));
  assert.ok(r.sourceProblems.some((p) => p.includes('HTTP 404')));
  assert.equal(r.verdict, 'rejected');
  const f2 = mockFetch([gem(fakeLesson()), { status: 200, ok: true, text: async () => '<title>Totally unrelated</title><p>nothing</p>' }, gem(allSupported)]);
  const r2 = await runPrototype({ disciplines, lessonId: 'les_cu01', choiceId: 'georges-braque', apiKey: KEY, fetchImpl: f2 });
  assert.ok(r2.sourceProblems.some((p) => p.includes('title mismatch')));
  assert.equal(r2.verdict, 'rejected');
});

test('fact check: any unsupported or missing item rejects the lesson', async () => {
  const one = structuredClone(allSupported); one.items[3].supported = false;
  const f = mockFetch([gem(fakeLesson()), page, gem(one)]);
  const r = await runPrototype({ disciplines, lessonId: 'les_cu01', choiceId: 'georges-braque', apiKey: KEY, fetchImpl: f });
  assert.deepEqual(r.factCheck.unsupported, ['fact4']);
  assert.equal(r.verdict, 'rejected');
  const f2 = mockFetch([gem(fakeLesson()), page, gem({ items: [] })]);
  const r2 = await runPrototype({ disciplines, lessonId: 'les_cu01', choiceId: 'georges-braque', apiKey: KEY, fetchImpl: f2 });
  assert.equal(r2.verdict, 'rejected');
});

test('helpers: pageText strips markup; normalizeLesson drops model ids/extra fields and dedupes sources', () => {
  assert.deepEqual(pageText('<title> A  B </title><script>x()</script><p>Hi &amp; bye</p>'), { title: 'A B', text: 'A B Hi & bye' });
  const n = normalizeLesson({ ...fakeLesson(), id: 'les_cu01', extra: 1, sources: [{ url: SRC.url }, { url: SRC.url }] }, ctx.lesson);
  assert.notEqual(n.id, 'les_cu01');
  assert.equal(n.extra, undefined);
  assert.equal(n.sources.length, 1);
});

test('fact check text: each fetched source gets an equal share, so a long first page cannot crowd out the rest', async () => {
  const lesson = findLessonChoice(disciplines, 'les_st02', 'seneca').lesson;
  const [a, b] = lesson.sources;
  const long = { status: 200, ok: true, text: async () => `<title>${a.title}</title>${'stoic '.repeat(20000)}` };
  const short = { status: 200, ok: true, text: async () => `<title>${b.title}</title>Seneca wrote letters. ${b.title}` };
  const gen = fakeLesson({ title: 'Seneca', sections: [1, 2, 3, 4].map((i) => ({ heading: `H${i}`, body: `Seneca part ${i}.` })), sources: [{ url: a.url }, { url: b.url }] });
  let factPrompt = '';
  const f = mockFetch([gem(gen), long, short, (u, init) => { factPrompt = JSON.parse(init.body).contents[0].parts[0].text; return gem(allSupported); }]);
  await runPrototype({ disciplines, lessonId: 'les_st02', choiceId: 'seneca', apiKey: KEY, fetchImpl: f });
  assert.match(factPrompt, /Seneca wrote letters/);
});

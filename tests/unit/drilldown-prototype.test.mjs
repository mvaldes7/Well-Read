// P1b prototype script (grounded generation): all network calls are mocked; CI never calls Gemini or fetches sources.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  runPrototype, buildPrompt, findLessonChoice, callGemini, normalizeLesson, pageText, relevantExcerpts, factCheckText,
  fetchCandidateSources, QuotaError, BillingError, DEFAULT_MODEL, FALLBACK_MODEL, FACTCHECK_SOURCE_CHARS,
} from '../../scripts/drilldown-prototype.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
// les_fr02: three fetchable chnm.org sources and two blocked britannica.com sources.
const ctx = findLessonChoice(disciplines, 'les_fr02', 'robespierre');
const FETCHABLE = ctx.lesson.sources.filter((s) => !s.url.includes('britannica.com'));
const BLOCKED = ctx.lesson.sources.filter((s) => s.url.includes('britannica.com'));
const SRC = FETCHABLE[0];
const KEY = 'test-key-not-real';
const HTML = new Headers({ 'content-type': 'text/html; charset=utf-8' });
const GEM = 'https://generativelanguage.googleapis.com/';

const fakeLesson = (overrides = {}) => ({
  slug: 'robespierre', title: 'Robespierre and the Terror',
  sections: [1, 2, 3, 4].map((i) => ({ heading: `Part ${i}`, body: `Robespierre led the Jacobins, part ${i}.` })),
  keyFacts: [1, 2, 3, 4, 5, 6].map((i) => `Robespierre fact ${i}.`),
  quiz: [1, 2, 3, 4, 5, 6].map((i) => ({ question: `Q${i}?`, options: ['a', 'b', 'c', 'd'], answerIndex: 1, explanation: 'Because b.' })),
  factSources: Array(6).fill('S1'), quizSources: Array(6).fill('S1'), ...overrides,
});
const gem = (obj) => ({
  status: 200, ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 30 } }),
});
const pageFor = (s, body = 'Robespierre and the Jacobins ran the Terror.') => ({ status: 200, ok: true, headers: HTML, text: async () => `<html><head><title>${s.title}</title></head><body>${body} ${s.title}</body></html>` });
const allSupported = { items: [...Array(6)].map((_, i) => ({ ref: `fact${i + 1}`, supported: true })).concat([...Array(6)].map((_, i) => ({ ref: `quiz${i + 1}`, supported: true }))) };
const fc = (n) => { const x = structuredClone(allSupported); for (let i = 0; i < n; i++) { x.items[i].supported = false; x.items[i].note = `not in source ${i}`; } return x; };

/** Routes Gemini calls to a queue and source URLs to a page map (default: a matching page for every curated source). */
function mockFetch(gemQueue, pages = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith(GEM)) {
      const r = gemQueue.shift();
      if (!r) throw new Error(`unexpected Gemini call ${url}`);
      return typeof r === 'function' ? r(url, init) : r;
    }
    if (url in pages) return pages[url];
    const s = ctx.lesson.sources.find((x) => x.url === url);
    if (s) return pageFor(s);
    throw new Error(`unexpected fetch ${url}`);
  };
  fn.calls = calls;
  fn.gem = () => calls.filter((c) => c.url.startsWith(GEM));
  return fn;
}
const last = (r) => r.attempts.at(-1);
const run = (f, extra) => runPrototype({ disciplines, lessonId: 'les_fr02', choiceId: 'robespierre', apiKey: KEY, fetchImpl: f, extra });

test('grounded: sources are fetched BEFORE the first model call; blocked sites are never fetched', async () => {
  const f = mockFetch([gem(fakeLesson()), gem(allSupported)]);
  const r = await run(f);
  const firstGem = f.calls.findIndex((c) => c.url.startsWith(GEM));
  assert.deepEqual(f.calls.slice(0, firstGem).map((c) => c.url), FETCHABLE.map((s) => s.url));
  for (const b of BLOCKED) assert.ok(!f.calls.some((c) => c.url === b.url), b.url);
  assert.deepEqual(r.sourceFetch.results.filter((x) => x.blocked).map((x) => x.url), BLOCKED.map((s) => s.url));
  assert.deepEqual(r.sourceFetch.usable.map((u) => u.id), ['S1', 'S2', 'S3']);
});

test('grounded prompt: fetched excerpts with ids, citation instruction, parent lesson as context only, no blocked URLs', async () => {
  let prompt = '', sys = '';
  const f = mockFetch([(u, i) => { const b = JSON.parse(i.body); prompt = b.contents[0].parts[0].text; sys = b.systemInstruction.parts[0].text; return gem(fakeLesson()); }, gem(allSupported)]);
  await run(f);
  assert.match(prompt, /\[S1\] .*Monarchy Falls/);
  assert.match(prompt, /Robespierre and the Jacobins ran the Terror/);
  assert.match(prompt, /Parent lesson \(context only, not a source\)/);
  assert.match(sys, /ONLY from the fetched source excerpts/);
  assert.match(sys, /factSources and quizSources/);
  for (const b of BLOCKED) assert.ok(!prompt.includes(b.url));
  const { user } = buildPrompt(ctx, []);
  assert.doesNotMatch(user, /\[S1\]/);
  assert.throws(() => findLessonChoice(disciplines, 'les_fr02', 'Tell me about anything'), /unknown choice/);
  assert.throws(() => findLessonChoice(disciplines, 'les_nope', 'x'), /unknown lesson/);
  assert.equal(DEFAULT_MODEL, 'gemini-3.1-flash-lite');
});

test('no fetchable source (all blocked or failing): stops with 0 model calls', async () => {
  const e403 = { status: 403, ok: false, text: async () => '' };
  const f = mockFetch([], Object.fromEntries(FETCHABLE.map((s) => [s.url, e403])));
  const r = await run(f);
  assert.equal(r.calls.length, 0);
  assert.equal(f.gem().length, 0);
  assert.match(r.stoppedOn, /^no usable fetched sources/);
  assert.equal(r.verdict, 'rejected');
});

test('happy path: 2 model calls, sources = the cited fetched sources, key only in the header', async () => {
  const f = mockFetch([gem(fakeLesson({ factSources: ['S1', 'S1', 'S2', 'S2', 'S1', 'S1'] })), gem(allSupported)]);
  const r = await run(f);
  assert.deepEqual(last(r).schemaProblems, []);
  assert.deepEqual(last(r).sourceProblems, []);
  assert.equal(last(r).outcome, 'pass');
  assert.match(r.verdict, /^passed \(private/);
  assert.equal(r.calls.length, 2);
  assert.match(r.generated.id, /^gen_[a-z0-9]{12}$/);
  assert.deepEqual(r.generated.sources.map((s) => s.url), [FETCHABLE[0].url, FETCHABLE[1].url]);
  assert.equal(r.citations.facts[2], FETCHABLE[1].url);
  for (const c of f.gem()) {
    assert.equal(c.init.headers['x-goog-api-key'], KEY);
    assert.ok(!c.url.includes(KEY) && !c.init.body.includes(KEY));
    assert.match(c.url, /gemini-3\.1-flash-lite:generateContent$/);
  }
  for (const c of f.calls.filter((c) => !c.url.startsWith(GEM))) assert.ok(!JSON.stringify(c.init).includes(KEY));
  assert.ok(!JSON.stringify(r).includes(KEY));
});

test('citations: an unknown source id is a source problem and regenerates (no fact-check call)', async () => {
  const bad = fakeLesson({ factSources: ['S1', 'S9', 'S1', 'S1', 'S1', 'S1'] });
  const f = mockFetch([gem(bad), gem(fakeLesson()), gem(allSupported)]);
  const r = await run(f);
  assert.ok(r.attempts[0].sourceProblems.some((p) => p.includes('fact2: cites "S9"')));
  assert.equal(r.attempts[0].factCheck.skipped, 'source/content checks failed');
  assert.match(r.verdict, /^passed/);
  assert.equal(r.calls.length, 3);
});

test('fact check sees each item\'s cited-source excerpts (with the cited URL), never blocked text', async () => {
  const pages = { [FETCHABLE[1].url]: pageFor(FETCHABLE[1], `${'Boilerplate menu text. '.repeat(3000)} The Law of 22 Prairial sped up trials.`) };
  let fcPrompt = '';
  const gen = fakeLesson({ keyFacts: ['The Law of 22 Prairial sped up trials.', ...[2, 3, 4, 5, 6].map((i) => `Robespierre fact ${i}.`)], factSources: ['S2', 'S1', 'S1', 'S1', 'S1', 'S1'] });
  const f = mockFetch([gem(gen), (u, i) => { fcPrompt = JSON.parse(i.body).contents[0].parts[0].text; return gem(allSupported); }], pages);
  await run(f);
  assert.match(fcPrompt, /Law of 22 Prairial sped up trials/); // found despite ~70k chars of boilerplate first
  assert.match(fcPrompt, /Cited source: https:\/\/revolution\.chnm\.org/);
  assert.ok(fcPrompt.length < FACTCHECK_SOURCE_CHARS + 4000);
  for (const b of BLOCKED) assert.ok(!fcPrompt.includes(b.url));
});

test('relevantExcerpts / factCheckText: relevant chunks in document order, within budget, deduplicated', () => {
  const text = 'Alpha intro. '.repeat(100) + 'Prairial law passed in June. ' + 'Filler words here. '.repeat(100) + 'Thermidor ended it.';
  const ex = relevantExcerpts(text, 'Prairial Thermidor', 500);
  assert.ok(ex.some((c) => c.text.includes('Prairial')) && ex.some((c) => c.text.includes('Thermidor')));
  assert.ok(ex.reduce((n, c) => n + c.text.length, 0) <= 500);
  assert.ok(ex[0].i < ex.at(-1).i);
  assert.deepEqual(relevantExcerpts('', 'x', 100), []);
  const fetched = [{ id: 'S1', url: 'https://a.edu/x', text, title: 't', publisher: 'p' }];
  const g = fakeLesson({ keyFacts: Array(6).fill('Prairial law passed') });
  const t = factCheckText(g, { facts: Array(6).fill('https://a.edu/x'), quiz: Array(6).fill('https://a.edu/x') }, fetched);
  assert.equal(t.split('Prairial law passed in June').length - 1, 1); // deduped across items
});

test('fact-check rule: exactly 1 unconfirmed passes, delivered privately and flagged with claim + reason', async () => {
  const r = await run(mockFetch([gem(fakeLesson()), gem(fc(1))]));
  assert.equal(last(r).outcome, 'pass_flagged');
  assert.match(r.verdict, /flagged for Mike's review/);
  assert.deepEqual(r.flag, { ref: 'fact1', claim: 'Robespierre fact 1.', reason: 'not in source 0' });
});

test('fact-check rule: 2 unconfirmed rejects, then ONE regenerate + fact check fits in the 4-call cap', async () => {
  const r = await run(mockFetch([gem(fakeLesson()), gem(fc(2)), gem(fakeLesson()), gem(allSupported)]));
  assert.equal(r.attempts[0].outcome, 'reject');
  assert.deepEqual(r.attempts[0].factCheck.unconfirmed, ['fact1', 'fact2']);
  assert.match(r.verdict, /^passed/);
  assert.equal(r.calls.length, 4);
});

test('cap exhaustion: two rejects use all 4 calls and fail gracefully with no 5th call', async () => {
  const f = mockFetch([gem(fakeLesson()), gem(fc(2)), gem(fakeLesson()), gem(fc(3))]);
  const r = await run(f);
  assert.equal(r.calls.length, 4);
  assert.equal(f.gem().length, 4);
  assert.match(r.stoppedOn, /call cap reached \(4\/4\); failing gracefully/);
  // sources are fetched once, not per attempt
  assert.equal(f.calls.filter((c) => c.url === SRC.url).length, 1);
});

test('cap exhaustion: schema retry + fact check + reject leaves 1 call, too few to regenerate', async () => {
  const bad = fakeLesson({ keyFacts: ['only one'] });
  const r = await run(mockFetch([gem(bad), gem(fakeLesson()), gem(fc(3))]));
  assert.equal(r.calls.length, 3);
  assert.match(r.stoppedOn, /call cap reached \(3\/4\)/);
  const r3 = await run(mockFetch([gem(bad), gem(bad), gem(bad)]));
  assert.equal(r3.calls.length, 3);
  assert.ok(last(r3).schemaProblems.some((p) => p.includes('keyFacts')));
  assert.equal(r3.verdict, 'rejected');
});

test('fact check: an incomplete fact-check response is a reject', async () => {
  const r = await run(mockFetch([gem(fakeLesson()), gem({ items: [] }), gem(fakeLesson()), gem({ items: [] })]));
  assert.equal(last(r).outcome, 'reject');
  assert.equal(r.calls.length, 4);
});

test('429 / RESOURCE_EXHAUSTED stops immediately with no further calls', async () => {
  const q = { status: 429, ok: false, json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } }) };
  const f = mockFetch([q]);
  const r = await run(f);
  assert.match(r.stoppedOn, /^quota/);
  assert.equal(f.gem().length, 1);
  await assert.rejects(callGemini({ fetchImpl: mockFetch([{ status: 200, ok: true, json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED' } }) }]), apiKey: KEY, model: 'm', system: '', user: '', schema: {}, budget: { used: 0, max: 4 } }), QuotaError);
});

const e503 = { status: 503, ok: false, json: async () => ({ error: { status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } }) };

test('503 / high demand on the primary falls back to the free-tier fallback model (counts against the cap)', async () => {
  assert.equal(FALLBACK_MODEL, 'gemini-3.5-flash-lite');
  const f = mockFetch([e503, gem(fakeLesson()), gem(allSupported)]);
  const r = await run(f);
  assert.match(r.verdict, /^passed/);
  assert.equal(r.model, FALLBACK_MODEL);
  const urls = f.gem().map((c) => c.url);
  assert.match(urls[0], /gemini-3\.1-flash-lite:/);
  assert.ok(urls.slice(1).every((u) => /gemini-3\.5-flash-lite:/.test(u)));
  const f2 = mockFetch([e503, e503]);
  const r2 = await run(f2);
  assert.match(r2.stoppedOn, /^provider unavailable: HTTP 503/);
  assert.equal(f2.gem().length, 2);
});

test('any billing / paid requirement stops immediately: no retry, no fallback', async () => {
  for (const body of [
    { status: 400, error: { status: 'FAILED_PRECONDITION', message: 'This model requires billing to be enabled.' } },
    { status: 402, error: { status: 'PAYMENT_REQUIRED', message: 'x' } },
    { status: 403, error: { status: 'PERMISSION_DENIED', message: 'Available on the paid tier only.' } },
  ]) {
    const f = mockFetch([{ status: body.status, ok: false, json: async () => ({ error: body.error }) }]);
    const r = await run(f);
    assert.equal(r.billingStop, true);
    assert.equal(f.gem().length, 1);
  }
  await assert.rejects(callGemini({ fetchImpl: mockFetch([{ status: 400, ok: false, json: async () => ({ error: { message: 'enable billing' } }) }]), apiKey: KEY, model: 'm', system: '', user: '', schema: {}, budget: { used: 0, max: 4 } }), BillingError);
});

test('fetchCandidateSources: HTTP errors, title mismatch, non-allowlisted extras dropped; Wikipedia alone is not enough', async () => {
  const pages = {
    [FETCHABLE[0].url]: { status: 404, ok: false, text: async () => '' },
    [FETCHABLE[1].url]: { status: 200, ok: true, headers: HTML, text: async () => '<title>Totally unrelated</title>nothing' },
    [FETCHABLE[2].url]: { status: 404, ok: false, text: async () => '' },
    'https://en.wikipedia.org/wiki/Maximilien_Robespierre': { status: 200, ok: true, headers: HTML, text: async () => '<title>Maximilien Robespierre - Wikipedia</title>Robespierre Jacobin' },
  };
  const wiki = { publisher: 'Wikipedia', title: 'Maximilien Robespierre', url: 'https://en.wikipedia.org/wiki/Maximilien_Robespierre' };
  const r = await fetchCandidateSources({ fetchImpl: mockFetch([], pages), lesson: ctx.lesson, extra: [wiki] });
  assert.ok(r.results.some((x) => x.problems.includes('HTTP 404')));
  assert.ok(r.results.some((x) => x.problems.some((p) => p.includes('title mismatch'))));
  assert.deepEqual(r.fetched.map((x) => x.url), [wiki.url]);
  assert.ok(r.problems.some((p) => p.includes('cannot be the only source')));
});

test('helpers: pageText strips markup; normalizeLesson drops model ids/extra fields and dedupes cited sources', () => {
  assert.deepEqual(pageText('<title> A  B </title><script>x()</script><p>Hi &amp; bye</p>'), { title: 'A B', text: 'A B Hi & bye' });
  const fetched = [{ id: 'S1', url: SRC.url, title: SRC.title, publisher: SRC.publisher, text: 'x' }];
  const n = normalizeLesson({ ...fakeLesson(), id: 'les_fr02', extra: 1 }, fetched);
  assert.notEqual(n.lesson.id, 'les_fr02');
  assert.equal(n.lesson.extra, undefined);
  assert.equal(n.lesson.factSources, undefined);
  assert.deepEqual(n.lesson.sources, [{ publisher: SRC.publisher, title: SRC.title, url: SRC.url }]);
  assert.deepEqual(n.citationProblems, []);
});

// REV-016: source fetcher hardening.
import { fetchSourcePage, redirectHopAllowed, SOURCE_FETCH_LIMITS } from '../../src/lib/drilldowns/generate.mjs';
const resp = (status, headers = {}, body = '') => ({ status, ok: status < 300, headers: new Headers(headers), text: async () => body });
const seq = (list) => { const seen = []; const fn = async (url, init) => { seen.push({ url, init }); const r = list.shift(); if (!r) throw new Error('unexpected'); return r; }; fn.seen = seen; return fn; };

test('fetcher: manual redirects, timeout signal, accepted content types', async () => {
  const f = seq([resp(200, { 'content-type': 'text/plain' }, 'hello')]);
  const r = await fetchSourcePage(f, SRC.url, true);
  assert.equal(r.problem, null); assert.equal(r.body, 'hello');
  assert.equal(f.seen[0].init.redirect, 'manual');
  assert.ok(f.seen[0].init.signal instanceof AbortSignal);
  for (const t of ['application/pdf', 'application/json', '', 'text/htmlx']) {
    const x = await fetchSourcePage(seq([resp(200, t ? { 'content-type': t } : {}, 'x')]), SRC.url, true);
    assert.match(x.problem, /unsupported content-type/, t);
  }
});

test('fetcher: every redirect hop is re-checked, with a hop limit', async () => {
  const host = new URL(SRC.url).origin;
  const ok = seq([resp(301, { location: '/moved' }), resp(200, { 'content-type': 'text/html' }, '<title>x</title>')]);
  assert.equal((await fetchSourcePage(ok, SRC.url, true)).problem, null);
  assert.equal(ok.seen[1].url, `${host}/moved`);
  for (const loc of ['https://evil.example.com/x', 'http://' + new URL(SRC.url).host + '/x', BLOCKED[0].url, 'javascript:alert(1)']) {
    const f = seq([resp(302, { location: loc })]);
    const r = await fetchSourcePage(f, SRC.url, true);
    assert.match(r.problem, /redirect to disallowed|bad redirect/, loc); assert.equal(f.seen.length, 1);
  }
  const loop = seq([...Array(SOURCE_FETCH_LIMITS.maxHops + 1)].map((_, i) => resp(302, { location: `/r${i}` })));
  assert.equal((await fetchSourcePage(loop, SRC.url, true)).problem, 'too many redirects');
  assert.equal(loop.seen.length, SOURCE_FETCH_LIMITS.maxHops + 1);
  assert.equal(redirectHopAllowed(SRC.url, 'https://en.wikipedia.org/wiki/X'), true);
  assert.equal(redirectHopAllowed(SRC.url, 'https://evil.example.com/'), false);
});

test('fetcher: body size cap (content-length and streamed)', async () => {
  const big = await fetchSourcePage(seq([resp(200, { 'content-type': 'text/html', 'content-length': String(SOURCE_FETCH_LIMITS.maxBytes + 1) }, 'x')]), SRC.url, true);
  assert.equal(big.problem, 'page too large');
  const stream = new Response('a'.repeat(50), { status: 200, headers: { 'content-type': 'text/html' } });
  const r = await fetchSourcePage(async () => stream, SRC.url, true, { ...SOURCE_FETCH_LIMITS, maxBytes: 10 });
  assert.equal(r.problem, 'page too large');
  const small = new Response('<title>x</title>', { status: 200, headers: { 'content-type': 'text/html' } });
  assert.equal((await fetchSourcePage(async () => small, SRC.url, true)).body, '<title>x</title>');
});

test('fetcher: a timeout becomes a source problem, not a crash', async () => {
  const f = async (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)));
  await assert.rejects(fetchSourcePage(f, SRC.url, true, { ...SOURCE_FETCH_LIMITS, timeoutMs: 20 }), /timeout|abort/i);
  const res = await fetchCandidateSources({ fetchImpl: async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }, lesson: ctx.lesson, extra: [] });
  assert.ok(res.results.filter((x) => !x.blocked).every((x) => /fetch failed/.test(x.problems[0])));
});

test('billing vs quota: free-tier 429 / RESOURCE_EXHAUSTED is quota, real billing signals stop', async () => {
  const call = (status, error) => callGemini({ fetchImpl: mockFetch([{ status, ok: false, json: async () => ({ error }) }]), apiKey: KEY, model: 'm', system: '', user: '', schema: {}, budget: { used: 0, max: 4 } });
  for (const [st, err] of [
    [429, { status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota, please check your plan and billing details.' }],
    [429, { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for free tier. Upgrade your plan or check billing.' }],
    [400, { status: 'RESOURCE_EXHAUSTED', message: 'quota; see billing' }],
    [429, { message: 'Too many requests' }],
  ]) await assert.rejects(call(st, err), QuotaError, err.message);
  for (const [st, err] of [
    [402, { message: 'x' }],
    [400, { status: 'FAILED_PRECONDITION', message: 'Billing is not enabled for this project.' }],
    [400, { message: 'Payment required.' }],
    [403, { message: 'Please upgrade to a paid plan to use this model.' }],
    [403, { message: 'Available on the paid tier only.' }],
  ]) await assert.rejects(call(st, err), BillingError, err.message);
  const r = await run(mockFetch([{ status: 429, ok: false, json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED', message: 'check your plan and billing details' } }) }]));
  assert.equal(r.billingStop, false);
});

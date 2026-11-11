// Fallback source discovery and wiring: when curated sources are blocklisted or fail at runtime,
// generation grounds itself in free, reachable sources (Wikipedia, SEP, .gov/.edu). No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  runPrototype, fetchCandidateSources, findLessonChoice,
} from '../../src/lib/drilldowns/generate.mjs';
import { sourceTierProblems, lessonHasFetchableSource, lessonOffersDigDeeper } from '../../src/lib/drilldowns/sources.mjs';
import {
  isUnusablePage, fallbackSearchQueries, slugifyForEntry, pickTrustedExtlinks,
  guessedSepEntries, discoverFallbackSources, FALLBACK_USER_AGENT, WIKIPEDIA_API, SEP_ENTRY,
} from '../../src/lib/drilldowns/fallback-sources.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const ctx = findLessonChoice(disciplines, 'les_fr02', 'robespierre');
const FETCHABLE = ctx.lesson.sources.filter((s) => !s.url.includes('britannica.com'));
const HTML = new Headers({ 'content-type': 'text/html; charset=utf-8' });
const GEM = 'https://generativelanguage.googleapis.com/';
const KEY = 'test-key-not-real';
const WIKI_URL = 'https://en.wikipedia.org/wiki/Maximilien_Robespierre';
const SEP_URL = 'https://plato.stanford.edu/entries/robespierre/';
const GOV_URL = 'https://www.archives.gov/research/french-revolution';
const EXTRACT = 'Maximilien Robespierre was a French lawyer and statesman who became one of the most influential figures of the French Revolution and led the Jacobins during the Reign of Terror.';

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
const pageFor = (title, body) => ({ status: 200, ok: true, headers: HTML, text: async () => `<html><head><title>${title}</title></head><body>${body}</body></html>` });
const allSupported = { items: [...Array(6)].map((_, i) => ({ ref: `fact${i + 1}`, supported: true })).concat([...Array(6)].map((_, i) => ({ ref: `quiz${i + 1}`, supported: true }))) };
const httpErr = (status) => ({ status, ok: false, text: async () => '' });
const challenge = { status: 200, ok: true, headers: HTML, text: async () => '<html><head><title>Just a moment...</title></head><body>Enable JavaScript and cookies to continue. cf-browser-verification</body></html>' };

const wikiCandidate = { publisher: 'Wikipedia', title: 'Maximilien Robespierre', url: WIKI_URL, text: EXTRACT, fallback: true };
const sepCandidate = { publisher: 'Stanford Encyclopedia of Philosophy', title: 'Maximilien Robespierre', url: SEP_URL, fallback: true };
const discoverOk = async () => ({ queries: ['Robespierre'], candidates: [wikiCandidate, sepCandidate] });
const discoverEmpty = async () => ({ queries: ['Robespierre'], candidates: [] });

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
    if (s) return pageFor(s.title, `Robespierre and the Jacobins ran the Terror. ${s.title}`);
    throw new Error(`unexpected fetch ${url}`);
  };
  fn.calls = calls;
  fn.gem = () => calls.filter((c) => c.url.startsWith(GEM));
  return fn;
}

function blockedDisciplines() {
  const copy = structuredClone(disciplines);
  for (const d of copy) for (const t of d.topics) for (const l of t.lessons) {
    if (l.id === 'les_fr02') l.sources = l.sources.filter((s) => s.url.includes('britannica.com'));
  }
  return copy;
}

const sepPage = pageFor('Maximilien Robespierre', `${EXTRACT} ${'Robespierre led the Jacobins during the Terror. '.repeat(8)}`);

test('isUnusablePage: 403, 429, timeout, empty and challenge pages', () => {
  assert.equal(isUnusablePage({ status: 403, problem: 'HTTP 403' }), true);
  assert.equal(isUnusablePage({ status: 429, problem: 'HTTP 429' }), true);
  assert.equal(isUnusablePage({ status: 0, problem: 'fetch failed: The operation was aborted due to timeout' }), true);
  assert.equal(isUnusablePage({ status: 200, title: 'Just a moment...', text: 'Enable JavaScript and cookies to continue', body: 'cf-browser-verification' }), true);
  assert.equal(isUnusablePage({ status: 200, title: 'Vercel Security Checkpoint', text: 'Please verify you are a human', body: '' }), true);
  assert.equal(isUnusablePage({ status: 200, title: 'Empty', text: 'short', body: '<p>short</p>' }), true);
  assert.equal(isUnusablePage({ status: 200, title: 'Robespierre', text: EXTRACT }), false);
});

test('discovery helpers: queries, slugs, trusted extlinks, guessed SEP entries', () => {
  assert.deepEqual(fallbackSearchQueries({ choice: { label: 'Robespierre' }, topic: { title: 'The French Revolution' }, lesson: { title: 'The Terror' } }), ['Robespierre', 'The French Revolution', 'The Terror']);
  assert.equal(slugifyForEntry('André Breton'), 'andre-breton');
  const picked = pickTrustedExtlinks([
    'https://plato.stanford.edu/entries/robespierre/',
    'https://www.archives.gov/research/french-revolution',
    'https://history.columbia.edu/robespierre',
    'https://www.britannica.com/bio/Robespierre',
    'https://en.wikipedia.org/wiki/Other',
    'http://example.edu/x',
    'https://evil.example.com/x',
  ]);
  assert.deepEqual(picked.map((p) => p.url), [SEP_URL, GOV_URL, 'https://history.columbia.edu/robespierre']);
  assert.ok(guessedSepEntries({ choice: { label: 'Surrealism', id: 'surrealism' } }).some((s) => s.url.startsWith(SEP_ENTRY) && s.url.includes('surrealism')));
});

test('discoverFallbackSources: Wikipedia OpenSearch + extract, trusted extlinks, identifying User-Agent', async () => {
  const open = `${WIKIPEDIA_API}?action=opensearch&search=${encodeURIComponent('Robespierre')}&limit=5&namespace=0&format=json`;
  const query = `${WIKIPEDIA_API}?action=query&prop=extracts|extlinks|info&exintro=0&explaintext=1&inprop=url&ellimit=80&redirects=1&format=json&titles=${encodeURIComponent('Maximilien Robespierre')}`;
  const pages = {
    [open]: { status: 200, json: async () => ['Robespierre', ['Maximilien Robespierre'], [''], [WIKI_URL]] },
    [query]: { status: 200, json: async () => ({ query: { pages: { 1: { title: 'Maximilien Robespierre', extract: EXTRACT, fullurl: WIKI_URL, extlinks: [{ '*': SEP_URL }, { '*': GOV_URL }] } } } }) },
  };
  const f = mockFetch([], pages);
  const r = await discoverFallbackSources({ fetchImpl: f, topic: { title: 'The French Revolution', slug: 'french-revolution' }, lesson: { title: 'The Terror' }, choice: { label: 'Robespierre', id: 'robespierre' } });
  assert.ok(r.candidates.some((c) => c.url === WIKI_URL && c.text.includes('Robespierre') && c.fallback));
  assert.ok(r.candidates.some((c) => c.url === SEP_URL && c.publisher === 'Stanford Encyclopedia of Philosophy'));
  assert.ok(r.candidates.some((c) => c.url === GOV_URL));
  const wikiCalls = f.calls.filter((c) => c.url.startsWith(WIKIPEDIA_API));
  assert.ok(wikiCalls.length >= 2);
  for (const c of wikiCalls) assert.equal(c.init.headers['user-agent'], FALLBACK_USER_AGENT);
});

test('blocklist leads to fallback: all curated sources blocked, generation uses discovered sources', async () => {
  const cited = fakeLesson({ factSources: ['S1', 'S1', 'S2', 'S2', 'S1', 'S1'], quizSources: Array(6).fill('S1') });
  const f = mockFetch([gem(cited), gem(allSupported)], { [SEP_URL]: sepPage });
  const r = await runPrototype({
    disciplines: blockedDisciplines(), lessonId: 'les_fr02', choiceId: 'robespierre',
    apiKey: KEY, fetchImpl: f, discover: discoverOk,
  });
  assert.match(r.verdict, /^passed/);
  assert.equal(r.sourceFetch.fallback.attempted, true);
  assert.ok(r.sourceFetch.usable.every((u) => u.fallback));
  assert.deepEqual(r.generated.sources.map((s) => s.url), [WIKI_URL, SEP_URL]);
  assert.deepEqual(r.generated.sources.map((s) => s.publisher), ['Wikipedia', 'Stanford Encyclopedia of Philosophy']);
  assert.equal(f.gem().length, 2);
  // Blocked curated URLs were never fetched.
  for (const c of f.calls.filter((c) => !c.url.startsWith(GEM) && !c.url.includes('wikipedia.org') && c.url !== SEP_URL)) {
    assert.ok(!c.url.includes('britannica.com'), c.url);
  }
});

test('runtime 403 and 429 lead to fallback; sources list shows what was used', async () => {
  for (const status of [403, 429]) {
    const pages = Object.fromEntries(FETCHABLE.map((s) => [s.url, httpErr(status)]));
    pages[SEP_URL] = sepPage;
    const f = mockFetch([gem(fakeLesson({ factSources: ['S2', 'S2', 'S2', 'S2', 'S2', 'S2'], quizSources: Array(6).fill('S2') })), gem(allSupported)], pages);
    const r = await runPrototype({
      disciplines, lessonId: 'les_fr02', choiceId: 'robespierre',
      apiKey: KEY, fetchImpl: f, discover: discoverOk,
    });
    assert.match(r.verdict, /^passed/, String(status));
    assert.equal(r.sourceFetch.fallback.attempted, true, String(status));
    assert.ok(r.sourceFetch.results.filter((x) => FETCHABLE.some((s) => s.url === x.url)).every((x) => x.problems.some((p) => p.includes(String(status)))), String(status));
    assert.deepEqual(r.generated.sources.map((s) => s.url), [SEP_URL], String(status));
    assert.equal(r.generated.sources[0].publisher, 'Stanford Encyclopedia of Philosophy', String(status));
  }
});

test('challenge or empty 200 page is unusable and triggers fallback', async () => {
  const pages = Object.fromEntries(FETCHABLE.map((s) => [s.url, challenge]));
  pages[SEP_URL] = sepPage;
  const f = mockFetch([gem(fakeLesson({ factSources: Array(6).fill('S2'), quizSources: Array(6).fill('S2') })), gem(allSupported)], pages);
  const r = await runPrototype({ disciplines, lessonId: 'les_fr02', choiceId: 'robespierre', apiKey: KEY, fetchImpl: f, discover: discoverOk });
  assert.match(r.verdict, /^passed/);
  assert.ok(r.sourceFetch.results.filter((x) => FETCHABLE.some((s) => s.url === x.url)).every((x) => x.problems.includes('challenge or empty page')));
  assert.deepEqual(r.generated.sources.map((s) => s.url), [SEP_URL]);
});

test('mixed case: working curated sources are kept and fallback is not attempted', async () => {
  let discovered = 0;
  const f = mockFetch([gem(fakeLesson()), gem(allSupported)]);
  const r = await runPrototype({
    disciplines, lessonId: 'les_fr02', choiceId: 'robespierre',
    apiKey: KEY, fetchImpl: f,
    discover: async () => { discovered++; throw new Error('discover should not run when curated sources pass'); },
  });
  assert.match(r.verdict, /^passed/);
  assert.equal(discovered, 0);
  assert.equal(r.sourceFetch.fallback, null);
  assert.deepEqual(r.generated.sources.map((s) => s.url), [FETCHABLE[0].url]);
  assert.ok(r.sourceFetch.usable.every((u) => !u.fallback));
});

test('fallback also fails: stop gracefully with 0 model calls and no thrown error', async () => {
  const pages = Object.fromEntries(FETCHABLE.map((s) => [s.url, httpErr(403)]));
  const f = mockFetch([], pages);
  const r = await runPrototype({
    disciplines, lessonId: 'les_fr02', choiceId: 'robespierre',
    apiKey: KEY, fetchImpl: f, discover: discoverEmpty,
  });
  assert.equal(r.verdict, 'rejected');
  assert.match(r.stoppedOn, /^no usable fetched sources/);
  assert.equal(r.calls.length, 0);
  assert.equal(f.gem().length, 0);
  assert.equal(r.sourceFetch.fallback.attempted, true);
  assert.deepEqual(r.sourceFetch.fallback.added, []);
  assert.equal(r.generated, null);
});

test('discover throwing is caught: fail gracefully with no model calls', async () => {
  const pages = Object.fromEntries(FETCHABLE.map((s) => [s.url, httpErr(403)]));
  const f = mockFetch([], pages);
  const r = await runPrototype({
    disciplines, lessonId: 'les_fr02', choiceId: 'robespierre',
    apiKey: KEY, fetchImpl: f, discover: async () => { throw new Error('wikipedia down'); },
  });
  assert.equal(r.verdict, 'rejected');
  assert.match(r.stoppedOn, /^no usable fetched sources/);
  assert.equal(r.calls.length, 0);
  assert.equal(r.sourceFetch.fallback.error, 'wikipedia down');
});

test('last-resort Wikipedia-only is accepted only when fallback ran and no trusted source was found', async () => {
  const onlyWiki = await fetchCandidateSources({
    fetchImpl: mockFetch([], {}),
    lesson: { sources: ctx.lesson.sources.filter((s) => s.url.includes('britannica.com')) },
    topic: ctx.topic, choice: ctx.choice,
    discover: async () => ({ queries: ['Robespierre'], candidates: [wikiCandidate] }),
  });
  assert.deepEqual(onlyWiki.fetched.map((f) => f.url), [WIKI_URL]);
  assert.deepEqual(onlyWiki.problems, []);
  assert.equal(onlyWiki.fetched[0].fallback, true);

  // Without a fallback attempt, Wikipedia alone is still rejected (existing rule).
  const noFallback = await fetchCandidateSources({
    fetchImpl: mockFetch([], { [WIKI_URL]: pageFor('Maximilien Robespierre', EXTRACT) }),
    lesson: { sources: ctx.lesson.sources.filter((s) => s.url.includes('britannica.com')) },
    extra: [{ publisher: 'Wikipedia', title: 'Maximilien Robespierre', url: WIKI_URL }],
    discover: discoverEmpty,
  });
  assert.ok(noFallback.problems.some((p) => p.includes('cannot be the only source')));
  assert.ok(sourceTierProblems([{ url: WIKI_URL, curated: false }]).some((p) => p.includes('cannot be the only source')));
  assert.deepEqual(sourceTierProblems([{ url: WIKI_URL, curated: false }], { allowSupplementaryOnly: true }), []);
});

test('formerly blocked lessons offer Dig deeper; the lesson page no longer hides it behind curated fetchability', () => {
  for (const id of ['les_un01', 'les_mr01', 'les_su01', 'les_ad01']) {
    const lesson = disciplines.flatMap((d) => d.topics.flatMap((t) => t.lessons)).find((l) => l.id === id);
    assert.equal(lessonHasFetchableSource(lesson), false, id);
    assert.equal(lessonOffersDigDeeper(lesson), true, id);
    assert.ok(lesson.digDeeper.length >= 3, id);
  }
  const page = readFileSync(new URL('../../src/app/d/[discipline]/[topic]/[lesson]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /lessonOffersDigDeeper\(lesson\)/);
  assert.doesNotMatch(page, /lessonHasFetchableSource/);
});

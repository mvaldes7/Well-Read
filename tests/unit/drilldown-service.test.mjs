// P3 Dig deeper service: all Gemini and DB calls are mocked; no network, no database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runPrototype, FALLBACK_MODEL, PROMPT_VERSION } from '../../src/lib/drilldowns/generate.mjs';
import { handleDigDeeper, createMinuteLimiter, splitLesson, StopError } from '../../src/lib/drilldowns/service.mjs';
import { dbErrorCode, DRILLDOWN_MESSAGES } from '../../src/lib/drilldowns/messages.mjs';
import { validateReport, reportErrorMessage, REPORT_MESSAGES } from '../../src/lib/drilldowns/report-logic.mjs';
import { findLessonChoice } from '../../src/lib/drilldowns/generate.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const ctx = findLessonChoice(disciplines, 'les_fr02', 'robespierre');
const GEM = 'https://generativelanguage.googleapis.com/';
const USER = '11111111-1111-4111-8111-111111111111';
const fakeLesson = () => ({
  slug: 'robespierre', title: 'Robespierre and the Terror',
  sections: [1, 2, 3, 4].map((i) => ({ heading: `Part ${i}`, body: `Robespierre led the Jacobins, part ${i}.` })),
  keyFacts: [1, 2, 3, 4, 5, 6].map((i) => `Robespierre fact ${i}.`),
  quiz: [1, 2, 3, 4, 5, 6].map((i) => ({ question: `Q${i}?`, options: ['a', 'b', 'c', 'd'], answerIndex: 1, explanation: 'Because b.' })),
  factSources: Array(6).fill('S1'), quizSources: Array(6).fill('S1'),
});
const gem = (obj) => ({ status: 200, ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 30 } }) });
const pageFor = (s) => ({ status: 200, ok: true, text: async () => `<html><head><title>${s.title}</title></head><body>Robespierre and the Jacobins ran the Terror. ${s.title}</body></html>` });
const allSupported = { items: [...Array(6)].map((_, i) => ({ ref: `fact${i + 1}`, supported: true })).concat([...Array(6)].map((_, i) => ({ ref: `quiz${i + 1}`, supported: true }))) };
const fc = (n) => { const x = structuredClone(allSupported); for (let i = 0; i < n; i++) { x.items[i].supported = false; x.items[i].note = `not in source ${i}`; } return x; };
const e503 = { status: 503, ok: false, json: async () => ({ error: { status: 'UNAVAILABLE', message: 'high demand' } }) };
const billing = { status: 400, ok: false, json: async () => ({ error: { status: 'FAILED_PRECONDITION', message: 'This model requires billing to be enabled.' } }) };
function mockFetch(q) {
  const fn = async (url, init) => {
    if (url.startsWith(GEM)) { fn.gem.push(JSON.parse(init.body)); const r = q.shift(); if (!r) throw new Error('unexpected Gemini call'); return r; }
    const s = ctx.lesson.sources.find((x) => x.url === url);
    if (s) return pageFor(s);
    throw new Error(`unexpected fetch ${url}`);
  };
  fn.gem = [];
  return fn;
}

function setup({ gemQueue = [gem(fakeLesson()), gem(allSupported)], body = { lessonId: 'les_fr02', choiceId: 'robespierre' }, userId = USER, enabled = true, reserveImpl, limiter, completed = true, billingState = { stopped: false } } = {}) {
  const f = mockFetch(gemQueue);
  const db = { reserves: [], saves: [],
    async reserve(u, c, n) { db.reserves.push([u, c, n]); if (reserveImpl) await reserveImpl(u, c, n, db.reserves.length); },
    async saveLesson(p) { db.saves.push(p); } };
  const deps = {
    enabled, body, disciplines, promptVersion: PROMPT_VERSION, billing: billingState,
    limiter: limiter ?? createMinuteLimiter(4, () => 0),
    getUserId: async () => userId,
    getCompletionRows: async (id) => (completed ? [{ lesson_id: id }] : []),
    db,
    generate: (a) => runPrototype({ disciplines, apiKey: 'test-key-not-real', fetchImpl: f, ...a }),
  };
  return { deps, db, f, run: () => handleDigDeeper(deps) };
}

test('flag off: 404 disabled, nothing reserved or called', async () => {
  const s = setup({ enabled: false });
  const r = await s.run();
  assert.equal(r.status, 404); assert.equal(r.body.code, 'disabled');
  assert.equal(s.db.reserves.length, 0); assert.equal(s.f.gem.length, 0);
});

test('user_id comes only from the session: signed out is 401, a body userId is rejected, saves use the session id', async () => {
  assert.equal((await setup({ userId: null }).run()).status, 401);
  const evil = setup({ body: { lessonId: 'les_fr02', choiceId: 'robespierre', userId: '22222222-2222-4222-8222-222222222222' } });
  const r = await evil.run();
  assert.equal(r.status, 400); assert.equal(evil.db.reserves.length, 0);
  const ok = setup();
  const r2 = await ok.run();
  assert.equal(r2.status, 200);
  assert.ok(ok.db.reserves.every(([u]) => u === USER));
  assert.equal(ok.db.saves[0].userId, USER);
});

test('free text and not-completed lessons are refused', async () => {
  assert.equal((await setup({ body: { lessonId: 'les_fr02', choiceId: 'Tell me anything' } }).run()).body.code, 'bad_request');
  assert.equal((await setup({ completed: false }).run()).body.code, 'not_completed');
});

test('0 unconfirmed -> pending; lesson reserved once, each model call reserved; answers split from the public body', async () => {
  const s = setup();
  const r = await s.run();
  assert.deepEqual(r.body, { ok: true, lessonId: s.db.saves[0].id, reviewStatus: 'pending' });
  assert.deepEqual(s.db.reserves.map(([, c, n]) => [c, n]), [[0, true], [1, false], [1, false]]);
  const p = s.db.saves[0];
  assert.equal(p.reviewStatus, 'pending'); assert.deepEqual(p.unconfirmedClaims, []);
  assert.equal(p.answers.length, 6); assert.equal(p.explanations.length, 6);
  for (const q of p.lesson.quiz) assert.deepEqual(Object.keys(q).sort(), ['options', 'question']);
  assert.ok(!JSON.stringify(p.lesson).includes('answerIndex'));
});

test('1 unconfirmed -> flagged with that claim', async () => {
  const s = setup({ gemQueue: [gem(fakeLesson()), gem(fc(1))] });
  const r = await s.run();
  assert.equal(r.body.reviewStatus, 'flagged');
  assert.equal(s.db.saves[0].unconfirmedClaims.length, 1);
  assert.equal(s.db.saves[0].unconfirmedClaims[0].ref, 'fact1');
});

test('2+ unconfirmed -> regenerate within 4 calls; still 2+ -> saved as rejected, friendly failure', async () => {
  const good = setup({ gemQueue: [gem(fakeLesson()), gem(fc(2)), gem(fakeLesson()), gem(allSupported)] });
  assert.equal((await good.run()).body.reviewStatus, 'pending');
  assert.equal(good.f.gem.length, 4);
  const bad = setup({ gemQueue: [gem(fakeLesson()), gem(fc(2)), gem(fakeLesson()), gem(fc(3))] });
  const r = await bad.run();
  assert.equal(r.status, 422); assert.equal(r.body.code, 'generation_failed');
  assert.equal(r.body.message, DRILLDOWN_MESSAGES.generation_failed);
  assert.equal(bad.f.gem.length, 4);
  assert.equal(bad.db.saves[0].reviewStatus, 'rejected');
});

test('503 falls back to the flash-lite fallback model', async () => {
  const s = setup({ gemQueue: [e503, gem(fakeLesson()), gem(allSupported)] });
  const r = await s.run();
  assert.equal(r.status, 200);
  assert.equal(s.db.saves[0].model, FALLBACK_MODEL);
});

test('billing stops immediately, maps to billing_stop and blocks later requests on this instance', async () => {
  const state = { stopped: false };
  const s = setup({ gemQueue: [billing], billingState: state });
  const r = await s.run();
  assert.equal(r.body.code, 'billing_stop'); assert.equal(s.f.gem.length, 1); assert.equal(state.stopped, true);
  const again = setup({ billingState: state });
  assert.equal((await again.run()).body.code, 'billing_stop'); assert.equal(again.db.reserves.length, 0);
  assert.equal(s.db.saves.length, 0);
});

test('DB cap and email errors map to friendly codes', async () => {
  const cases = [
    [{ code: 'WR403', message: 'email not verified' }, 'email_unverified', 403],
    [{ code: 'WR429', message: 'drilldown cap: user_cap' }, 'user_cap', 429],
    [{ code: 'WR429', message: 'drilldown cap: global_cap' }, 'global_cap', 429],
    [{ code: 'WR429', message: 'drilldown cap: hard_stop' }, 'global_cap', 429],
    [{ code: '42501', message: 'permission denied' }, 'unavailable', 503],
  ];
  for (const [err, code, status] of cases) {
    const s = setup({ reserveImpl: () => { throw err; } });
    const r = await s.run();
    assert.equal(r.body.code, code); assert.equal(r.status, status); assert.equal(r.body.message, DRILLDOWN_MESSAGES[code]);
    assert.ok(!r.body.message.includes(err.message));
    assert.equal(s.f.gem.length, 0);
  }
  // A per-call cap hit mid-generation stops before the next model call.
  const mid = setup({ reserveImpl: (_u, c, _n, i) => { if (i === 3) throw { code: 'WR429', message: 'drilldown cap: user_calls' }; } });
  const r = await mid.run();
  assert.equal(r.body.code, 'user_cap'); assert.equal(mid.f.gem.length, 1); assert.equal(mid.db.saves.length, 0);
  assert.equal(dbErrorCode(null), 'unavailable');
});

test('app-level limiter: 4 calls per minute', async () => {
  let t = 0;
  const lim = createMinuteLimiter(4, () => t);
  assert.deepEqual([1, 2, 3, 4, 5].map(() => lim.take()), [true, true, true, true, false]);
  t = 60_000; assert.equal(lim.take(), true);
  const s = setup({ limiter: { take: () => false } });
  const r = await s.run();
  assert.equal(r.body.code, 'per_minute'); assert.equal(s.f.gem.length, 0);
  assert.ok(new StopError('x').stopKind === 'x');
});

test('splitLesson keeps no answers in the public body', () => {
  const g = { ...fakeLesson(), id: 'gen_abcdefgh', sources: [] };
  const { lesson, answers } = splitLesson(g);
  assert.deepEqual(answers, Array(6).fill(1));
  assert.ok(!('answerIndex' in lesson.quiz[0]) && !('explanation' in lesson.quiz[0]));
});

test('report validation and messages', () => {
  assert.deepEqual(validateReport('gen_abcdefgh', '  wrong date '), { lesson_id: 'gen_abcdefgh', reason: 'wrong date' });
  assert.equal(validateReport('les_fr02', 'x'), null);
  assert.equal(validateReport('gen_abcdefgh', ''), null);
  assert.equal(validateReport('gen_abcdefgh', 'x'.repeat(501)), null);
  assert.equal(reportErrorMessage(null), REPORT_MESSAGES.done);
  assert.equal(reportErrorMessage({ code: '23505' }), REPORT_MESSAGES.duplicate);
  assert.equal(reportErrorMessage({ code: '42501' }), REPORT_MESSAGES.failed);
});

function files(dir) {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
}
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SRC = new URL('../../src', import.meta.url).pathname;

test('no service_role / service key usage anywhere in src', () => {
  for (const f of files(SRC)) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /service_role|SERVICE_ROLE|SUPABASE_SECRET/i, f);
    assert.doesNotMatch(t, /NEXT_PUBLIC_[A-Z_]*(GEMINI|DRILLDOWN_DB)/, f);
  }
});

test('DRILLDOWN_DB_URL / GEMINI_API_KEY are read only in server-only modules; inserts have no .select()', () => {
  for (const f of files(SRC)) {
    const t = readFileSync(f, 'utf8');
    if (/process\.env(\.|\[")?(DRILLDOWN_DB_URL|GEMINI_API_KEY)|DRILLDOWN_DB_ENV\]/.test(t) || /DRILLDOWN_DB_ENV =/.test(t)) {
      assert.match(t, /import "server-only"/, f);
      assert.doesNotMatch(t, /^"use client"/m, f);
    }
    if (/"use client"/.test(t)) assert.doesNotMatch(t, /server-db|GEMINI_API_KEY|DRILLDOWN_DB_URL|generate\.mjs/, f);
  }
  const report = code(readFileSync(join(SRC, 'lib/drilldowns/report-actions.ts'), 'utf8'));
  assert.match(report, /insert\(row\);/);
  assert.doesNotMatch(report, /\.select\(/);
});

test('route and page: flag checked first, session claims, explicit columns', () => {
  const route = readFileSync(join(SRC, 'app/api/drilldowns/route.ts'), 'utf8');
  assert.ok(route.indexOf('drilldownsEnabled') < route.indexOf('request.json'));
  assert.match(route, /getClaims\(\)/);
  assert.match(route, /select\("lesson_id"\)/);
  const data = code(readFileSync(join(SRC, 'lib/drilldowns/data.ts'), 'utf8'));
  assert.doesNotMatch(data, /created_by|unconfirmed_claims/);
  const page = readFileSync(join(SRC, 'app/dig/page.tsx'), 'utf8');
  assert.match(page, /AI_GENERATED_LABEL/); assert.match(page, /notFound\(\)/); assert.match(page, /ReportLesson/);
  const quiz = readFileSync(join(SRC, 'components/Quiz.tsx'), 'utf8');
  assert.match(quiz, /<DigDeeper/);
  const dd = readFileSync(join(SRC, 'components/DigDeeper.tsx'), 'utf8');
  assert.doesNotMatch(dd, /<textarea|type="text"/);
});

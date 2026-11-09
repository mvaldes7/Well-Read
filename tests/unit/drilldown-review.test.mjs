// P4 owner review screen: pure logic with a mocked DB (no network, no database, no Gemini).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actionsFor, filterQueue, handleReviewAction, loadReviewLink, loadReviewQueue, parseFilter, queueCounts, reviewLinkLabel } from '../../src/lib/drilldowns/review.mjs';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const wr = (code) => Object.assign(new Error(code), { code });
// Mock DB that behaves like drilldown_review_action/queue: owner checked inside the DB (WR403 otherwise).
function mockDb(rows = []) {
  const db = { calls: [],
    async reviewQueue(id) { db.calls.push(['queue', id]); if (id !== OWNER) throw wr('WR403'); return rows; },
    async reviewAction(id, lessonId, action) {
      db.calls.push([action, id, lessonId]);
      if (id !== OWNER) throw wr('WR403');
      const row = rows.find((r) => r.id === lessonId);
      if (!row) throw wr('WR404');
      if (action === 'publish') { if (!['pending', 'flagged'].includes(row.review_status)) throw wr('WR404'); row.review_status = 'published'; }
      if (action === 'reject') { if (!['pending', 'flagged'].includes(row.review_status)) throw wr('WR404'); row.review_status = 'rejected'; row.open_reports = []; }
      if (action === 'unpublish') { if (row.review_status !== 'published') throw wr('WR404'); row.review_status = 'rejected'; row.open_reports = []; }
      if (action === 'clear_report') { if (!row.open_reports.length) throw wr('WR404'); row.open_reports = []; }
      return row.review_status;
    } };
  return db;
}
const rows = () => [
  { id: 'gen_pending0001', review_status: 'pending', unconfirmed_claims: [], open_reports: [] },
  { id: 'gen_flagged0001', review_status: 'flagged', unconfirmed_claims: [{ ref: 'fact2' }], open_reports: [] },
  { id: 'gen_reported001', review_status: 'published', unconfirmed_claims: [], open_reports: [{ id: 1, reason: 'wrong' }] },
  { id: 'gen_flagrep0001', review_status: 'flagged', unconfirmed_claims: [{ ref: 'quiz1' }], open_reports: [{ id: 2, reason: 'x' }] },
];
const act = (over = {}) => {
  const db = over.db ?? mockDb(rows());
  return { db, run: () => handleReviewAction({ enabled: true, sameOrigin: true, configured: true, getUserId: async () => OWNER,
    body: { lessonId: 'gen_pending0001', action: 'publish' }, db, ...over }) };
};

test('listing filters: pending, flagged (exactly 1 unconfirmed claim), reported, all', () => {
  const r = rows();
  assert.deepEqual(filterQueue(r, 'pending').map((x) => x.id), ['gen_pending0001']);
  assert.deepEqual(filterQueue(r, 'flagged').map((x) => x.id), ['gen_flagged0001', 'gen_flagrep0001']);
  assert.deepEqual(filterQueue(r, 'reported').map((x) => x.id), ['gen_reported001', 'gen_flagrep0001']);
  assert.equal(filterQueue(r, 'all').length, 4);
  assert.deepEqual(queueCounts(r), { all: 4, pending: 1, flagged: 2, reported: 2 });
  // a "flagged" row without exactly one claim is not listed as flagged
  assert.equal(filterQueue([{ review_status: 'flagged', unconfirmed_claims: [], open_reports: [] }], 'flagged').length, 0);
  assert.equal(parseFilter('flagged'), 'flagged'); assert.equal(parseFilter('nope'), 'all'); assert.equal(parseFilter(['pending']), 'all');
});

test('actionsFor offers only what the DB allows', () => {
  const [p, f, rep] = rows();
  assert.deepEqual(actionsFor(p), ['publish', 'reject']);
  assert.deepEqual(actionsFor(f), ['publish', 'reject']);
  assert.deepEqual(actionsFor(rep), ['unpublish', 'clear_report']);
  assert.deepEqual(actionsFor({ review_status: 'published', open_reports: [] }), ['unpublish']);
  assert.deepEqual(actionsFor({ review_status: 'rejected', open_reports: [] }), []);
});

test('flag off hides the route (404) and the page (hidden), nothing touches the DB', async () => {
  const s = act({ enabled: false });
  assert.equal((await s.run()).status, 404);
  assert.equal(s.db.calls.length, 0);
  const db = mockDb(rows());
  assert.deepEqual(await loadReviewQueue({ enabled: false, configured: true, getUserId: async () => OWNER, db }), { status: 'hidden' });
  assert.equal(db.calls.length, 0);
});

test('owner gate: non-owner and signed-out both get 404 from the route and a hidden page', async () => {
  const s = act({ getUserId: async () => OTHER });
  const r = await s.run();
  assert.equal(r.status, 404); assert.equal(r.body.code, 'not_found');
  assert.equal(s.db.calls[0][1], OTHER, 'the session user id is what the DB checks');
  const anon = act({ getUserId: async () => null });
  const ar = await anon.run();
  assert.equal(ar.status, 404); assert.equal(ar.body.code, 'not_found'); assert.equal(anon.db.calls.length, 0);
  assert.deepEqual(await loadReviewQueue({ enabled: true, configured: true, getUserId: async () => OTHER, db: mockDb() }), { status: 'hidden' });
  assert.deepEqual(await loadReviewQueue({ enabled: true, configured: true, getUserId: async () => null, db: mockDb() }), { status: 'hidden' });
  const ok = await loadReviewQueue({ enabled: true, configured: true, getUserId: async () => OWNER, db: mockDb(rows()) });
  assert.equal(ok.status, 'ok'); assert.equal(ok.rows.length, 4);
  // DB not configured -> hidden, DB down -> unavailable
  assert.deepEqual(await loadReviewQueue({ enabled: true, configured: false, getUserId: async () => OWNER, db: mockDb() }), { status: 'hidden' });
  const down = { async reviewQueue() { throw wr('08006'); } };
  assert.deepEqual(await loadReviewQueue({ enabled: true, configured: true, getUserId: async () => OWNER, db: down }), { status: 'unavailable' });
});

test('mutations: cross-origin 403 and a strict body (no extra keys like a client-sent user id)', async () => {
  const x = act({ sameOrigin: false });
  assert.equal((await x.run()).status, 403); assert.equal(x.db.calls.length, 0);
  for (const body of [null, [], { lessonId: 'gen_pending0001' }, { lessonId: 'gen_pending0001', action: 'delete' },
    { lessonId: 'bad id', action: 'publish' }, { lessonId: 'gen_pending0001', action: 'publish', userId: OWNER }]) {
    const s = act({ body });
    assert.equal((await s.run()).status, 400, JSON.stringify(body)); assert.equal(s.db.calls.length, 0);
  }
});

test('publish: pending/flagged -> published; not allowed twice (409)', async () => {
  const db = mockDb(rows());
  let r = await act({ db, body: { lessonId: 'gen_flagged0001', action: 'publish' } }).run();
  assert.deepEqual(r, { status: 200, body: { ok: true, lessonId: 'gen_flagged0001', reviewStatus: 'published' } });
  r = await act({ db, body: { lessonId: 'gen_flagged0001', action: 'publish' } }).run();
  assert.equal(r.status, 409); assert.equal(r.body.code, 'not_allowed');
});

test('reject: only pending/flagged (409 for published); resolves reports', async () => {
  const db = mockDb(rows());
  let r = await act({ db, body: { lessonId: 'gen_flagrep0001', action: 'reject' } }).run();
  assert.equal(r.status, 200); assert.equal(r.body.reviewStatus, 'rejected');
  assert.equal(filterQueue(await db.reviewQueue(OWNER), 'reported').some((x) => x.id === 'gen_flagrep0001'), false);
  r = await act({ db, body: { lessonId: 'gen_reported001', action: 'reject' } }).run();
  assert.equal(r.status, 409);
});

test('unpublish: only published -> rejected, closes open reports; 409 otherwise; non-owner 404', async () => {
  const db = mockDb(rows());
  assert.equal((await act({ db, getUserId: async () => OTHER, body: { lessonId: 'gen_reported001', action: 'unpublish' } }).run()).status, 404);
  assert.equal((await act({ db, body: { lessonId: 'gen_pending0001', action: 'unpublish' } }).run()).status, 409);
  const r = await act({ db, body: { lessonId: 'gen_reported001', action: 'unpublish' } }).run();
  assert.deepEqual(r, { status: 200, body: { ok: true, lessonId: 'gen_reported001', reviewStatus: 'rejected' } });
  assert.equal(filterQueue(await db.reviewQueue(OWNER), 'reported').some((x) => x.id === 'gen_reported001'), false);
  assert.equal((await act({ db, body: { lessonId: 'gen_reported001', action: 'unpublish' } }).run()).status, 409);
});

test('clear report: status unchanged, report gone; second clear is 409; unknown lesson 409; DB error 503', async () => {
  const db = mockDb(rows());
  let r = await act({ db, body: { lessonId: 'gen_reported001', action: 'clear_report' } }).run();
  assert.equal(r.status, 200); assert.equal(r.body.reviewStatus, 'published');
  r = await act({ db, body: { lessonId: 'gen_reported001', action: 'clear_report' } }).run();
  assert.equal(r.status, 409);
  assert.equal((await act({ db, body: { lessonId: 'gen_nosuchless1', action: 'reject' } }).run()).status, 409);
  const down = { async reviewAction() { throw wr('08006'); } };
  assert.equal((await act({ db: down }).run()).status, 503);
});

test('wiring: route same-origin + flag, page flag + notFound, server-only DB module, no service role', () => {
  const route = readFileSync(new URL('../../src/app/api/drilldowns/review/route.ts', import.meta.url), 'utf8');
  assert.match(route, /^import "server-only";/m);
  assert.match(route, /isSameOriginRequest\(request\.headers, request\.url\)/);
  assert.match(route, /drilldownsEnabled\(process\.env\)/);
  const page = readFileSync(new URL('../../src/app/review/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /if \(!drilldownsEnabled\(process\.env\)\) notFound\(\);/);
  assert.match(page, /if \(r\.status === "hidden"\) notFound\(\);/);
  assert.doesNotMatch(page, /answers|explanations|quiz_key/);
  assert.doesNotMatch(page, /signedOut|\/login/, 'signed-out visitors get 404, no sign-in link');
  const actions = readFileSync(new URL('../../src/components/ReviewActions.tsx', import.meta.url), 'utf8');
  assert.match(actions, /unpublish: "Unpublish this lesson\?/); assert.match(actions, /window\.confirm\(confirmText\)/);
  const sdb = readFileSync(new URL('../../src/lib/drilldowns/server-db.mjs', import.meta.url), 'utf8');
  assert.match(sdb, /^import "server-only";/m);
  for (const f of [route, page, sdb, readFileSync(new URL('../../src/components/ReviewActions.tsx', import.meta.url), 'utf8')]) {
    assert.doesNotMatch(f, /service_role|SERVICE_ROLE/);
  }
  const mig = readFileSync(new URL('../../supabase/migrations/20261104214500_drilldown_review.sql', import.meta.url), 'utf8');
  assert.match(mig, /STATUS: DRAFT, UNAPPLIED/);
  assert.match(mig, /if s not in \('pending', 'flagged'\) then raise exception 'drilldown: cannot reject %'/);
  assert.match(mig, /if s <> 'published' then raise exception 'drilldown: cannot unpublish %'/);
  for (const fn of ['drilldown_review_queue(uuid)', 'drilldown_review_action(uuid, text, text)', 'drilldown_save_fact_check(uuid, text, jsonb)']) {
    assert.ok(mig.includes(`revoke all on function public.${fn} from public, anon, authenticated, service_role;`), fn);
    assert.ok(mig.includes(`grant execute on function public.${fn} to drilldown_server;`), fn);
  }
  assert.doesNotMatch(mig, /grant [^;]* to (anon|authenticated|service_role)/);
});

test('Account review link: owner only, pending + flagged count, hidden otherwise', async () => {
  const rows = [
    { id: 'gen_aaaaaaaa', review_status: 'pending', unconfirmed_claims: [], open_reports: [] },
    { id: 'gen_bbbbbbbb', review_status: 'flagged', unconfirmed_claims: ['x'], open_reports: [] },
    { id: 'gen_cccccccc', review_status: 'published', unconfirmed_claims: [], open_reports: [{}] },
  ];
  const deps = (over) => ({ enabled: true, configured: true, getUserId: async () => OWNER, db: mockDb(rows), ...over });
  assert.deepEqual(await loadReviewLink(deps()), { count: 2 });
  assert.equal(await loadReviewLink(deps({ getUserId: async () => OTHER })), null);
  assert.equal(await loadReviewLink(deps({ getUserId: async () => null })), null);
  const off = mockDb(rows);
  assert.equal(await loadReviewLink(deps({ enabled: false, db: off })), null);
  assert.equal(off.calls.length, 0);
  assert.equal(await loadReviewLink(deps({ configured: false })), null);
  assert.equal(await loadReviewLink(deps({ db: { reviewQueue: async () => { throw new Error('down'); } } })), null);
  assert.equal(reviewLinkLabel(2), 'Review AI lessons (2)');
  assert.equal(reviewLinkLabel(0), 'Review AI lessons');
});

test('Account page gates the review link exactly like /review', () => {
  const src = readFileSync(new URL('../../src/app/account/page.tsx', import.meta.url), 'utf8');
  assert.match(src, /if \(!drilldownsEnabled\(process\.env\)\) return null;/);
  assert.match(src, /loadReviewLink\(/);
  assert.match(src, /db: \{ reviewQueue \}/);
  assert.match(src, /getClaims\(\)/);
  assert.doesNotMatch(src, /getSession\(/);
});

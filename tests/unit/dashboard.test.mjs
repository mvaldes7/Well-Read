import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barPercents, dashboardData, laDayKey, last7Days, nextStep } from '../../src/lib/progress/dashboard.mjs';
import { completionLookup } from '../../src/lib/progress/logic.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const frow = (lesson_id, score, total, passed, completed_at = null, first_passed_at = null) => ({ lesson_id, score, total, passed, completed_at, first_passed_at });
const TOTAL = disciplines.reduce((n, d) => n + d.topics.reduce((m, t) => m + t.lessons.length, 0), 0);

test('stats: lessons passed (distinct, content only), badges earned, disciplines started', () => {
  const empty = dashboardData([], disciplines);
  assert.deepEqual([empty.lessons, empty.badges.earned, empty.disciplines], [{ passed: 0, total: TOTAL }, 0, { started: 0, total: disciplines.length }]);
  assert.equal(empty.badges.total, 3 + 2 * disciplines.length);
  const rows = [frow('les_st01', 3, 3, true, '2026-10-01T17:00:00Z'), frow('les_st01', 3, 3, true), frow('les_so01', 1, 4, false), frow('les_rr01', 4, 4, true, '2026-10-02T17:00:00Z'), frow('les_gone01', 4, 4, true)];
  const d = dashboardData(rows, disciplines);
  assert.deepEqual(d.lessons, { passed: 2, total: TOTAL });
  assert.deepEqual(d.disciplines, { started: 2, total: disciplines.length });
  // First Lesson + Perfect Score + 2 mastery Novice = 4.
  assert.equal(d.badges.earned, 4);
  assert.equal(d.badges.earned, d.achievements.filter((a) => a.earned).length);
  const ph = d.perDiscipline.find((x) => x.slug === 'philosophy');
  assert.deepEqual([ph.passed, ph.total, ph.mastery.tier], [1, 4, 'Novice']);
});

test('continue link: first unpassed lesson in content order; start when none passed; review when all passed', () => {
  const ph = disciplines.find((d) => d.slug === 'philosophy'); // socrates/so01, stoicism/st01, st02, aristotle-virtue-ethics/ar01 (TSK-022)
  const lesson = (id) => { for (const t of ph.topics) for (const l of t.lessons) if (l.id === id) return [t, l]; };
  const href = (id) => { const [t, l] = lesson(id); return `/d/philosophy/${t.slug}/${l.slug}`; };
  const lk = (...ids) => completionLookup(ids.map((id) => frow(id, 4, 4, true)), disciplines);
  assert.deepEqual(nextStep(ph, lk()), { kind: 'start', href: href('les_so01'), lessonTitle: lesson('les_so01')[1].title });
  assert.deepEqual(nextStep(ph, lk('les_so01')), { kind: 'continue', href: href('les_st01'), lessonTitle: lesson('les_st01')[1].title });
  // Skips passed lessons even out of order: st01 passed, so01 not -> so01.
  assert.equal(nextStep(ph, lk('les_st01')).href, href('les_so01'));
  assert.equal(nextStep(ph, lk('les_st01')).kind, 'continue');
  assert.deepEqual(nextStep(ph, lk('les_so01', 'les_st01', 'les_st02')), { kind: 'continue', href: href('les_ar01'), lessonTitle: lesson('les_ar01')[1].title });
  assert.deepEqual(nextStep(ph, lk('les_so01', 'les_st01', 'les_st02', 'les_ar01')), { kind: 'review', href: '/d/philosophy', lessonTitle: null });
  // A failed attempt doesn't count as passed.
  assert.equal(nextStep(ph, completionLookup([frow('les_so01', 1, 4, false)], disciplines)).kind, 'start');
});

test('laDayKey: America/Los_Angeles calendar day, across midnight and DST', () => {
  assert.equal(laDayKey('2026-10-10T06:59:59Z'), '2026-10-09'); // 23:59:59 PDT
  assert.equal(laDayKey('2026-10-10T07:00:00Z'), '2026-10-10'); // 00:00 PDT
  assert.equal(laDayKey('2026-12-10T07:59:59Z'), '2026-12-09'); // 23:59:59 PST
  assert.equal(laDayKey('2026-12-10T08:00:00Z'), '2026-12-10'); // 00:00 PST
  assert.equal(laDayKey('2026-10-10T05:30:00+00:00'), '2026-10-09');
  assert.equal(laDayKey(null), null);
  assert.equal(laDayKey('garbage'), null);
});

test('last7Days: 7 LA days ending today, first-pass date per lesson, edges excluded', () => {
  const now = Date.parse('2026-10-14T22:00:00Z'); // Wed Oct 14, 15:00 PDT
  const rows = [
    frow('les_st01', 4, 4, true, '2026-10-14T23:00:00Z', '2026-10-14T06:30:00Z'), // first pass Oct 13 23:30 PDT -> Tue (not the completed_at day)
    frow('les_rr01', 4, 4, true, '2026-10-08T07:00:00Z'),                          // no first_passed_at: completed_at Oct 8 00:00 PDT -> Thu (oldest bucket)
    frow('les_fr01', 4, 4, true, '2026-10-08T06:59:00Z'),                          // Oct 7 23:59 PDT -> outside the window
    frow('les_so01', 4, 4, true, null, '2026-10-14T21:59:00Z'),                   // today
    frow('les_so01', 2, 4, false, '2026-10-14T21:00:00Z'),                       // duplicate worse row: no double count
    frow('les_st02', 1, 4, false, '2026-10-12T17:00:00Z'),                       // failed: not counted
    frow('les_cc01', 4, 4, true, '2026-10-15T07:30:00Z'),                        // tomorrow LA: outside
  ];
  const days = last7Days(rows, disciplines, now);
  assert.deepEqual(days.map((d) => d.key), ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
  assert.deepEqual(days.map((d) => d.label), ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed']);
  assert.deepEqual(days.map((d) => d.count), [1, 0, 0, 0, 0, 1, 1]);
  assert.deepEqual(days.map((d) => d.isToday), [false, false, false, false, false, false, true]);
  // Late-evening "now" in LA (after UTC midnight) is still the LA day.
  assert.equal(last7Days([], disciplines, Date.parse('2026-10-15T06:30:00Z')).at(-1).key, '2026-10-14');
  // Across the DST end (Nov 1 2026): 7 distinct consecutive days.
  assert.deepEqual(last7Days([], disciplines, Date.parse('2026-11-03T20:00:00Z')).map((d) => d.key), ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
});

test('barPercents', () => {
  assert.deepEqual(barPercents([0, 0]), [0, 0]);
  assert.deepEqual(barPercents([1, 2, 4]), [25, 50, 100]);
  assert.deepEqual(barPercents([]), []);
});

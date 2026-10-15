import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeStreaks, daysLabel } from '../../src/lib/streaks/streaks.mjs';
import { isMissingTableError as missing } from '../../src/lib/supabase/errors.mjs';
const isMissingTableError = (e) => missing(e, 'activity_log');

// Fixed "now": Wed Oct 14 2026, 15:00 PDT.
const NOW = Date.parse('2026-10-14T22:00:00Z');
// Noon PDT on Oct d (any instant inside that LA day).
const oct = (d, h = 19) => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`;

test('no activity -> 0 / 0', () => {
  assert.deepEqual(computeStreaks([], NOW), { current: 0, best: 0, activeToday: false });
  assert.deepEqual(computeStreaks([null, undefined, 'garbage'], NOW), { current: 0, best: 0, activeToday: false });
});

test('today vs yesterday: a streak ending yesterday is still current; ending the day before is broken', () => {
  assert.deepEqual(computeStreaks([oct(12), oct(13), oct(14)], NOW), { current: 3, best: 3, activeToday: true });
  assert.deepEqual(computeStreaks([oct(12), oct(13)], NOW), { current: 2, best: 2, activeToday: false });
  assert.deepEqual(computeStreaks([oct(11), oct(12)], NOW), { current: 0, best: 2, activeToday: false });
  assert.deepEqual(computeStreaks([oct(14)], NOW), { current: 1, best: 1, activeToday: true });
});

test('gaps: best is the longest run; several activities on one day count once', () => {
  const rows = [oct(1), oct(2), oct(3), oct(4), /* gap */ oct(6), oct(7), /* gap */ oct(13), oct(13, 20), oct(14), oct(14, 21)];
  assert.deepEqual(computeStreaks(rows, NOW), { current: 2, best: 4, activeToday: true });
  // Order of rows doesn't matter.
  assert.deepEqual(computeStreaks([...rows].reverse(), NOW), { current: 2, best: 4, activeToday: true });
});

test('midnight edge: days are LA calendar days, not UTC days', () => {
  // 23:59 PDT Oct 13 (= 06:59Z Oct 14) is Oct 13; 00:00 PDT Oct 14 (= 07:00Z) is Oct 14.
  assert.deepEqual(computeStreaks(['2026-10-14T06:59:00Z'], NOW), { current: 1, best: 1, activeToday: false });
  assert.deepEqual(computeStreaks(['2026-10-14T07:00:00Z'], NOW), { current: 1, best: 1, activeToday: true });
  // Two activities 2 minutes apart across LA midnight are two consecutive days.
  assert.deepEqual(computeStreaks(['2026-10-14T06:59:00Z', '2026-10-14T07:01:00Z'], NOW).best, 2);
  // Same UTC day, different LA days (and vice versa).
  assert.equal(computeStreaks(['2026-10-13T01:00:00Z', '2026-10-13T20:00:00Z'], NOW).best, 2);
  // "now" just after LA midnight: yesterday's activity keeps the streak; it's 00:05 PDT Oct 15.
  assert.deepEqual(computeStreaks([oct(13), oct(14)], Date.parse('2026-10-15T07:05:00Z')), { current: 2, best: 2, activeToday: false });
  // "now" just before LA midnight (23:55 PDT Oct 14 = 06:55Z Oct 15) is still Oct 14.
  assert.equal(computeStreaks([oct(14)], Date.parse('2026-10-15T06:55:00Z')).activeToday, true);
});

test('DST transitions: 23h and 25h days still count as one day each', () => {
  // DST ends Sun Nov 1 2026 (25h day); 23:30 local each night.
  const fall = ['2026-10-31T06:30:00Z' /* Oct 30 23:30 PDT */, '2026-11-01T06:30:00Z' /* Oct 31 23:30 PDT */, '2026-11-02T07:30:00Z' /* Nov 1 23:30 PST */, '2026-11-03T07:30:00Z' /* Nov 2 23:30 PST */];
  // now = Nov 3 10:00 PST, nothing yet today: the 4-day run ending yesterday is current.
  assert.deepEqual(computeStreaks(fall, Date.parse('2026-11-03T18:00:00Z')), { current: 4, best: 4, activeToday: false });
  // DST starts Sun Mar 8 2026 (23h day); 00:30 local each morning.
  const spring = ['2026-03-07T08:30:00Z' /* Mar 7 00:30 PST */, '2026-03-08T08:30:00Z' /* Mar 8 00:30 PST */, '2026-03-09T07:30:00Z' /* Mar 9 00:30 PDT */];
  assert.deepEqual(computeStreaks(spring, Date.parse('2026-03-09T20:00:00Z')), { current: 3, best: 3, activeToday: true });
  // 00:30 PDT and 23:29 PST on Nov 1 are ~24h apart but the SAME LA day (the 25h day).
  assert.equal(computeStreaks(['2026-11-01T07:30:00Z' /* Nov 1 00:30 PDT */, '2026-11-02T07:29:00Z' /* Nov 1 23:29 PST */], Date.parse('2026-11-02T18:00:00Z')).best, 1);
});

test('future-dated activity (clock skew) does not extend the current streak past today', () => {
  assert.deepEqual(computeStreaks([oct(14), oct(15)], NOW), { current: 1, best: 2, activeToday: true });
});

test('isMissingTableError: PGRST205 / 42P01 naming activity_log only', () => {
  assert.equal(isMissingTableError({ code: 'PGRST205', message: "Could not find the table 'public.activity_log' in the schema cache" }), true);
  assert.equal(isMissingTableError({ code: '42P01', message: 'relation "public.activity_log" does not exist' }), true);
  assert.equal(isMissingTableError({ code: '42P01' }), true);
  assert.equal(isMissingTableError({ code: '42P01', message: 'relation "public.other" does not exist' }), false);
  assert.equal(isMissingTableError({ code: '42501', message: 'permission denied for table activity_log' }), false);
  assert.equal(isMissingTableError(null), false);
  assert.equal(daysLabel(1), '1 day');
  assert.equal(daysLabel(0), '0 days');
});

test('before the migration: logging and reading degrade, never crash (wiring)', () => {
  const src = (f) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
  const data = src('lib/streaks/data.ts');
  assert.match(data, /isMissingTableError\(error, ACTIVITY_TABLE\)/);
  assert.match(data, /from "@\/lib\/supabase\/errors.mjs"/);
  assert.match(data, /return \{ status: "unavailable" \}/);
  assert.doesNotMatch(data, /service_role|SERVICE_ROLE/);
  const actions = src('lib/quiz/actions.ts');
  // The log call comes after the save and its result is not used in the response.
  assert.ok(actions.indexOf('logActivity(') > actions.indexOf('saveBestAttempt('));
  assert.match(actions, /await logActivity\(supabase, userId, "quiz_attempt", lessonId\);/);
  assert.match(actions, /return \{ status: "graded", score, total, passed, questions, save \};/);
  // Dashboard + sidebar show "Not available yet" instead of a number when unavailable.
  assert.match(src('app/page.tsx'), /STREAK_UNAVAILABLE/);
  assert.match(src('components/SidebarStreak.tsx'), /STREAK_UNAVAILABLE/);
});

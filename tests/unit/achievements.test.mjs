import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACHIEVEMENTS, earnedLabel, evaluateAchievements, formatEarnedDate, kthEarliest, kthEarliestDate, passDate } from '../../src/achievements/definitions.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const row = (lesson_id, score, total, passed, completed_at = null) => ({ lesson_id, score, total, passed, completed_at });
const byId = (rows, ds = disciplines) => Object.fromEntries(evaluateAchievements(rows, ds).map((a) => [a.id, a]));
const D1 = '2026-10-01T17:00:00Z', D2 = '2026-10-02T17:00:00Z', D3 = '2026-10-03T17:00:00Z', D4 = '2026-10-04T17:00:00Z', D5 = '2026-10-05T17:00:00Z', D6 = '2026-10-06T17:00:00Z';
const iso = (d) => new Date(d).toISOString();
const frow = (lesson_id, score, total, passed, completed_at, first_passed_at) => ({ lesson_id, score, total, passed, completed_at, first_passed_at });
const ALL = disciplines.flatMap((d) => d.topics.flatMap((t) => t.lessons.map((l) => l.id)));

test('starter set: ids unique, mastery + completionist per discipline, content order', () => {
  const a = evaluateAchievements([], disciplines);
  const ids = a.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [
    'first-lesson', 'perfect-score', 'discipline-explorer',
    ...disciplines.map((d) => `mastery:${d.slug}`),
    ...disciplines.map((d) => `completionist:${d.slug}`),
  ]);
  assert.equal(ACHIEVEMENTS.length, 5);
  assert.equal(a.length, 3 + 2 * disciplines.length); // 15 with today's 6 disciplines
  // Mike's call: no per-topic completionist badges.
  assert.ok(!ids.some((id) => /^completionist:.+\//.test(id)));
  // TSK-019: the topic-level "Level X" achievements are gone.
  assert.ok(!ids.some((id) => id.startsWith('topic-level:')));
  assert.ok(!a.some((x) => /Level \d/.test(x.title)));
});

test('nothing earned with no rows; locked ones carry requirement text', () => {
  const a = byId([]);
  for (const x of Object.values(a)) { assert.equal(x.earned, false, x.id); assert.equal(x.earnedAt, null); assert.ok(x.requirement.length > 0); }
  assert.equal(a['first-lesson'].requirement, 'Pass any lesson.');
  assert.equal(a['mastery:philosophy'].requirement, 'Pass a lesson in Philosophy.');
  assert.equal(a['mastery:philosophy'].title, 'Philosophy: Novice');
  assert.equal(a['mastery:philosophy'].progress, '0/1 to Novice');
  assert.equal(a['completionist:philosophy'].progress, '0/4 lessons');
  assert.equal(a['completionist:philosophy'].progress, '0/4 lessons');
  assert.equal(a['discipline-explorer'].progress, `0/${disciplines.length} disciplines`);
});

test('First Lesson: earliest completed_at among passed rows; failed rows ignored', () => {
  const a = byId([row('les_st01', 1, 3, false, D1), row('les_rr01', 4, 4, true, D3), row('les_so01', 3, 4, true, D2)]);
  assert.equal(a['first-lesson'].earned, true);
  assert.equal(a['first-lesson'].earnedAt, iso(D2));
  assert.equal(byId([row('les_st01', 1, 3, false, D1)])['first-lesson'].earned, false);
});

test('Perfect Score: only best attempts with score == total', () => {
  assert.equal(byId([row('les_st01', 3, 4, true, D1)])['perfect-score'].earned, false);
  const a = byId([row('les_st01', 3, 4, true, D1), row('les_rr01', 4, 4, true, D3), row('les_fr01', 4, 4, true, D2)]);
  assert.equal(a['perfect-score'].earned, true);
  assert.equal(a['perfect-score'].earnedAt, iso(D2));
  // A duplicate worse row for the same lesson doesn't hide the perfect best.
  assert.equal(byId([row('les_rr01', 2, 4, false, D1), row('les_rr01', 4, 4, true, D4)])['perfect-score'].earnedAt, iso(D4));
});

test('Discipline Explorer: every discipline; date = latest of each discipline\'s first pass', () => {
  assert.equal(byId([row('les_st01', 3, 3, true, D1)])['discipline-explorer'].earned, false);
  assert.equal(byId([row('les_st01', 3, 3, true, D1)])['discipline-explorer'].progress, `1/${disciplines.length} disciplines`);
  // Scoped to the two seed disciplines so the fixture can cover every discipline.
  const seed = disciplines.slice(0, 2);
  const a = byId([row('les_st01', 3, 3, true, D1), row('les_so01', 3, 4, true, D2), row('les_rr01', 4, 4, true, D3), row('les_fr01', 4, 4, true, D5)], seed);
  assert.equal(a['discipline-explorer'].earned, true);
  assert.equal(a['discipline-explorer'].earnedAt, iso(D3)); // philosophy first by D1, world history first by D3
  assert.equal(a['discipline-explorer'].progress, null);
});

test('Mastery: counts distinct passed lessons across every topic of the discipline', () => {
  // Philosophy: socrates (so01) + stoicism (st01, st02) + aristotle (ar01, TSK-022). Duplicate and failed rows don't count.
  const a = byId([row('les_st01', 3, 3, true, D2), row('les_st01', 3, 3, true, D1), row('les_so01', 3, 4, true, D3), row('les_st02', 1, 4, false, D4)]);
  const m = a['mastery:philosophy'];
  assert.deepEqual([m.earned, m.tier, m.title, m.requirement, m.progress], [true, 1, 'Philosophy: Novice', 'Pass 1 lesson in Philosophy.', '2/5 to Apprentice']);
  assert.equal(m.earnedAt, iso(D2)); // Novice = 1st lesson passed in the discipline (best row of st01)
  assert.equal(a['mastery:world-history'].earned, false);
  assert.equal(a['mastery:world-history'].tier, null);
});

// Fixture discipline with 25 lessons split across two topics: tiers ignore topic boundaries.
const fxLessons = Array.from({ length: 25 }, (_, i) => ({ id: `les_fx${String(i).padStart(2, '0')}` }));
const fx = [{ slug: 'fx', title: 'Fixture', color: 'slate', topics: [{ slug: 'a', title: 'Topic A', lessons: fxLessons.slice(0, 7) }, { slug: 'b', title: 'Topic B', lessons: fxLessons.slice(7) }] }];
const day = (i) => new Date(Date.UTC(2026, 8, 1 + i, 19)).toISOString();

test('Mastery tiers and first-earned dates: the Nth first pass in the discipline is the tier date', () => {
  // Pass lessons in a shuffled order so the date order differs from content/topic order.
  const order = [24, 3, 11, 0, 18, 7, 2, 20, 9, 15, 1, 22, 5, 13, 8, 19, 4, 23, 10, 16, 6, 21, 12, 17, 14];
  const rows = (n) => order.slice(0, n).map((li, k) => frow(fxLessons[li].id, 4, 4, true, day(30 + k), day(k)));
  const at = (n) => byId(rows(n), fx)['mastery:fx'];
  const cases = [
    [1, 1, 'Fixture: Novice', 0, '1/5 to Apprentice'],
    [4, 1, 'Fixture: Novice', 0, '4/5 to Apprentice'],
    [5, 2, 'Fixture: Apprentice', 4, '5/10 to Scholar'],
    [9, 2, 'Fixture: Apprentice', 4, '9/10 to Scholar'],
    [10, 3, 'Fixture: Scholar', 9, '10/20 to Luminary'],
    [19, 3, 'Fixture: Scholar', 9, '19/20 to Luminary'],
    [20, 4, 'Fixture: Luminary', 19, 'Highest tier reached'],
    [25, 4, 'Fixture: Luminary', 19, 'Highest tier reached'],
  ];
  for (const [n, tier, title, k, progress] of cases) {
    const m = at(n);
    // Tier date = first_passed_at of the k-th (0-based) lesson first passed, NOT completed_at.
    assert.deepEqual([m.earned, m.tier, m.title, m.earnedAt, m.earnedExact, m.progress], [true, tier, title, day(k), true, progress], `n=${n}`);
  }
  assert.equal(byId([], fx)['mastery:fx'].earned, false);
  // Rows arriving in any order give the same dates (sorted by first_passed_at).
  assert.equal(byId(rows(10).reverse(), fx)['mastery:fx'].earnedAt, day(9));
  // One undated-exact row among the qualifying ones makes the date an upper bound ("Earned by").
  const mixed = rows(5); mixed[2] = row(mixed[2].lesson_id, 4, 4, true, day(2));
  const m5 = byId(mixed, fx)['mastery:fx'];
  assert.deepEqual([m5.tier, m5.earnedAt, m5.earnedExact], [2, day(4), false]);
});

test('Completionist per discipline spans its topics (fixture)', () => {
  const rows = (ids) => ids.map((l, i) => row(l.id, 4, 4, true, day(i)));
  const a7 = byId(rows(fxLessons.slice(0, 7)), fx); // all of Topic A, none of Topic B
  assert.deepEqual([a7['completionist:fx'].earned, a7['completionist:fx'].progress], [false, '7/25 lessons']);
  assert.equal(a7['completionist:fx/a'], undefined);
  const all = byId(rows(fxLessons), fx);
  assert.deepEqual([all['completionist:fx'].earned, all['completionist:fx'].earnedAt], [true, day(24)]);
});

test('Completionist: all lessons in a discipline; date = latest; missing date -> no date', () => {
  const ph = [row('les_so01', 3, 4, true, D1), row('les_st01', 3, 3, true, D4), row('les_st02', 3, 4, true, D2), row('les_ar01', 3, 6, true, D3)]; // TSK-022: + aristotle (ar01)
  const a = byId(ph);
  assert.equal(a['completionist:philosophy'].earned, true);
  assert.equal(a['completionist:philosophy'].earnedAt, iso(D4));
  assert.equal(a['completionist:world-history'].earned, false);
  // Derived from content so adding lessons doesn't break the test.
  const whCount = disciplines.find((d) => d.slug === 'world-history').topics.reduce((n, t) => n + t.lessons.length, 0);
  assert.equal(a['completionist:world-history'].progress, `0/${whCount} lessons`);
  const noDate = byId([row('les_so01', 3, 4, true, D1), row('les_st01', 3, 3, true, null), row('les_st02', 3, 4, true, D2), row('les_ar01', 3, 6, true, D3)]);
  assert.deepEqual([noDate['completionist:philosophy'].earned, noDate['completionist:philosophy'].earnedAt], [true, null]);
  // One failed lesson keeps it locked.
  assert.equal(byId([...ph.slice(0, 2), row('les_st02', 1, 4, false, D2)])['completionist:philosophy'].earned, false);
});

test('unknown ids, malformed rows and missing dates are handled', () => {
  const a = byId([row('les_gone01', 4, 4, true, D1), { lesson_id: 'les_st01', score: '3', total: 3, passed: true }, null, row('les_rr01', 4, 4, true)]);
  assert.equal(a['first-lesson'].earned, true);
  assert.equal(a['first-lesson'].earnedAt, null); // the only valid passed row has no date
  assert.equal(a['mastery:philosophy'].earned, false);
  // Everything passed: all earned.
  const all = evaluateAchievements(ALL.map((id) => row(id, 4, 4, true, D6)), disciplines);
  assert.ok(all.every((x) => x.earned), all.filter((x) => !x.earned).map((x) => x.id).join());
});

test('kthEarliest and formatEarnedDate', () => {
  assert.equal(kthEarliest([{ completedAt: D3 }, { completedAt: null }, { completedAt: D1 }], 1).at, D1);
  assert.equal(kthEarliest([{ completedAt: D3 }, { completedAt: null }, { completedAt: D1 }], 2).at, D3);
  assert.equal(kthEarliest([{ completedAt: D3 }, { completedAt: null }], 2).at, null);
  assert.equal(kthEarliest([], 1).at, null);
  // Rendered in America/Los_Angeles: 05:30 UTC on Oct 10 is still Oct 9 in LA.
  assert.equal(formatEarnedDate('2026-10-10T05:30:00Z'), 'Oct 9, 2026');
  assert.equal(formatEarnedDate('2026-10-10T17:00:00Z'), 'Oct 10, 2026');
  assert.equal(formatEarnedDate(null), null);
  assert.equal(formatEarnedDate('garbage'), null);
});

// ---------- TSK-012: first_passed_at gives exact dates ----------

test('first_passed_at present: exact "Earned <date>" from the first pass, not the best attempt', () => {
  // Passed first on D1, improved on D4: completed_at = D4, first_passed_at = D1.
  const a = byId([frow('les_st01', 4, 6, true, D4, D1)]);
  assert.deepEqual([a['first-lesson'].earnedAt, a['first-lesson'].earnedExact], [iso(D1), true]);
  assert.equal(earnedLabel(a['first-lesson']), 'Earned Oct 1, 2026');
  const t = a['mastery:philosophy'];
  assert.deepEqual([t.earnedAt, t.earnedExact], [iso(D1), true]);
  // Perfect Score keeps completed_at (the event is the first perfect attempt) as an upper bound.
  const p = byId([frow('les_st01', 6, 6, true, D4, D1)])['perfect-score'];
  assert.deepEqual([p.earnedAt, p.earnedExact], [iso(D4), false]);
  assert.equal(earnedLabel(p), 'Earned by Oct 4, 2026');
});

test('first_passed_at absent (column not migrated): falls back to "Earned by <completed_at>"', () => {
  const a = byId([row('les_st01', 4, 6, true, D4)]);
  assert.deepEqual([a['first-lesson'].earnedAt, a['first-lesson'].earnedExact], [iso(D4), false]);
  assert.equal(earnedLabel(a['first-lesson']), 'Earned by Oct 4, 2026');
  assert.equal(earnedLabel({ earned: true, earnedAt: null, earnedExact: false }), 'Earned');
  assert.equal(earnedLabel({ earned: false, earnedAt: null, earnedExact: false }), 'Locked');
});

test('mixed rows: exact only when every qualifying lesson has first_passed_at', () => {
  const ph = [frow('les_so01', 4, 6, true, D2, D1), frow('les_st01', 4, 6, true, D5, D3), frow('les_st02', 4, 6, true, D6, null), frow('les_ar01', 4, 6, true, D3, D2)];
  const c = byId(ph)['completionist:philosophy'];
  assert.deepEqual([c.earnedAt, c.earnedExact], [iso(D6), false]); // st02 has only an upper bound
  const exact = byId([ph[0], ph[1], frow('les_st02', 4, 6, true, D6, D4), ph[3]])['completionist:philosophy'];
  assert.deepEqual([exact.earnedAt, exact.earnedExact], [iso(D4), true]); // latest first pass, not D6
  assert.equal(earnedLabel(exact), 'Earned Oct 4, 2026');
  // first_passed_at on a failed row is ignored (can't happen with the check constraint).
  assert.equal(byId([frow('les_st01', 1, 6, false, D1, D1)])['first-lesson'].earned, false);
});

test('passDate and kthEarliestDate', () => {
  assert.deepEqual(passDate({ completedAt: D3, firstPassedAt: D1 }), { at: D1, exact: true });
  assert.deepEqual(passDate({ completedAt: D3, firstPassedAt: null }), { at: D3, exact: false });
  assert.deepEqual(passDate({ completedAt: D3 }), { at: D3, exact: false });
  assert.deepEqual(kthEarliestDate([{ at: D2, exact: true }, { at: D1, exact: true }], 1), { at: D1, exact: true });
  assert.deepEqual(kthEarliestDate([{ at: D2, exact: true }, { at: D1, exact: false }], 1), { at: D1, exact: false });
  assert.deepEqual(kthEarliestDate([{ at: D2, exact: true }, { at: null, exact: false }], 1), { at: D2, exact: false });
  assert.deepEqual(kthEarliestDate([], 1), { at: null, exact: false });
});

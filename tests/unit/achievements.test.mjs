import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACHIEVEMENTS, earnedLabel, evaluateAchievements, formatEarnedDate, kthEarliest, kthEarliestDate, passDate } from '../../src/achievements/definitions.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const row = (lesson_id, score, total, passed, completed_at = null) => ({ lesson_id, score, total, passed, completed_at });
const byId = (rows, ds = disciplines) => Object.fromEntries(evaluateAchievements(rows, ds).map((a) => [a.id, a]));
const D1 = '2026-10-01T17:00:00Z', D2 = '2026-10-02T17:00:00Z', D3 = '2026-10-03T17:00:00Z', D4 = '2026-10-04T17:00:00Z', D5 = '2026-10-05T17:00:00Z', D6 = '2026-10-06T17:00:00Z';
const iso = (d) => new Date(d).toISOString();
const ALL = disciplines.flatMap((d) => d.topics.flatMap((t) => t.lessons.map((l) => l.id)));

test('starter set: ids unique, one per topic and per discipline, content order', () => {
  const a = evaluateAchievements([], disciplines);
  const ids = a.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  const topics = disciplines.flatMap((d) => d.topics.map((t) => `topic-level:${d.slug}/${t.slug}`));
  assert.deepEqual(ids, ['first-lesson', 'perfect-score', 'discipline-explorer', ...topics, ...disciplines.map((d) => `completionist:${d.slug}`)]);
  assert.equal(ACHIEVEMENTS.length, 5);
});

test('nothing earned with no rows; locked ones carry requirement text', () => {
  const a = byId([]);
  for (const x of Object.values(a)) { assert.equal(x.earned, false, x.id); assert.equal(x.earnedAt, null); assert.ok(x.requirement.length > 0); }
  assert.equal(a['first-lesson'].requirement, 'Pass any lesson.');
  assert.equal(a['topic-level:philosophy/stoicism'].requirement, 'Pass a lesson in Stoicism');
  assert.equal(a['topic-level:philosophy/stoicism'].title, 'Stoicism: Level 1');
  assert.equal(a['completionist:philosophy'].progress, '0/3 lessons');
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

test('Topic level: earned at Level 1, current tier, locked text; distinct passed only', () => {
  const a = byId([row('les_st01', 3, 3, true, D2), row('les_st01', 3, 3, true, D1), row('les_st02', 1, 4, false, D3)]);
  const s = a['topic-level:philosophy/stoicism'];
  assert.deepEqual([s.earned, s.tier, s.title, s.progress], [true, 1, 'Stoicism: Level 1', '1/5 to Level 2']);
  assert.equal(a['topic-level:philosophy/socrates'].earned, false);
  assert.equal(a['topic-level:philosophy/socrates'].tier, null);
});

test('Topic level tiers and dates with a larger fixture topic (Level 3 at 10 lessons)', () => {
  const lessons = Array.from({ length: 12 }, (_, i) => ({ id: `les_fx${String(i).padStart(2, '0')}` }));
  const ds = [{ slug: 'fx', title: 'Fixture', color: 'slate', topics: [{ slug: 'big', title: 'Big Topic', lessons }] }];
  const day = (i) => `2026-09-${String(i + 1).padStart(2, '0')}T12:00:00Z`;
  const rows = (n) => lessons.slice(0, n).map((l, i) => row(l.id, 4, 4, true, day(i)));
  const at = (n) => byId(rows(n), ds)['topic-level:fx/big'];
  assert.deepEqual([at(4).tier, at(4).earnedAt], [1, iso(day(0))]);              // Level 1: 1st pass
  assert.deepEqual([at(5).tier, at(5).earnedAt, at(5).title], [2, iso(day(4)), 'Big Topic: Level 2']); // 5th pass
  assert.deepEqual([at(10).tier, at(10).earnedAt, at(10).progress], [3, iso(day(9)), '0/5 to Level 4']);
  assert.deepEqual([at(12).tier, at(12).earnedAt], [3, iso(day(9))]);
  // Completionist in the fixture discipline needs all 12.
  assert.equal(byId(rows(11), ds)['completionist:fx'].earned, false);
  assert.equal(byId(rows(12), ds)['completionist:fx'].earnedAt, iso(day(11)));
});

test('Completionist: all lessons in a discipline; date = latest; missing date -> no date', () => {
  const ph = [row('les_so01', 3, 4, true, D1), row('les_st01', 3, 3, true, D4), row('les_st02', 3, 4, true, D2)];
  const a = byId(ph);
  assert.equal(a['completionist:philosophy'].earned, true);
  assert.equal(a['completionist:philosophy'].earnedAt, iso(D4));
  assert.equal(a['completionist:world-history'].earned, false);
  // Derived from content so adding lessons doesn't break the test.
  const whCount = disciplines.find((d) => d.slug === 'world-history').topics.reduce((n, t) => n + t.lessons.length, 0);
  assert.equal(a['completionist:world-history'].progress, `0/${whCount} lessons`);
  const noDate = byId([row('les_so01', 3, 4, true, D1), row('les_st01', 3, 3, true, null), row('les_st02', 3, 4, true, D2)]);
  assert.deepEqual([noDate['completionist:philosophy'].earned, noDate['completionist:philosophy'].earnedAt], [true, null]);
  // One failed lesson keeps it locked.
  assert.equal(byId([...ph.slice(0, 2), row('les_st02', 1, 4, false, D2)])['completionist:philosophy'].earned, false);
});

test('unknown ids, malformed rows and missing dates are handled', () => {
  const a = byId([row('les_gone01', 4, 4, true, D1), { lesson_id: 'les_st01', score: '3', total: 3, passed: true }, null, row('les_rr01', 4, 4, true)]);
  assert.equal(a['first-lesson'].earned, true);
  assert.equal(a['first-lesson'].earnedAt, null); // the only valid passed row has no date
  assert.equal(a['topic-level:philosophy/stoicism'].earned, false);
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
const frow = (lesson_id, score, total, passed, completed_at, first_passed_at) => ({ lesson_id, score, total, passed, completed_at, first_passed_at });

test('first_passed_at present: exact "Earned <date>" from the first pass, not the best attempt', () => {
  // Passed first on D1, improved on D4: completed_at = D4, first_passed_at = D1.
  const a = byId([frow('les_st01', 4, 6, true, D4, D1)]);
  assert.deepEqual([a['first-lesson'].earnedAt, a['first-lesson'].earnedExact], [iso(D1), true]);
  assert.equal(earnedLabel(a['first-lesson']), 'Earned Oct 1, 2026');
  const t = a['topic-level:philosophy/stoicism'];
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
  const ph = [frow('les_so01', 4, 6, true, D2, D1), frow('les_st01', 4, 6, true, D5, D3), frow('les_st02', 4, 6, true, D6, null)];
  const c = byId(ph)['completionist:philosophy'];
  assert.deepEqual([c.earnedAt, c.earnedExact], [iso(D6), false]); // st02 has only an upper bound
  const exact = byId([ph[0], ph[1], frow('les_st02', 4, 6, true, D6, D4)])['completionist:philosophy'];
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACHIEVEMENTS, evaluateAchievements, formatEarnedDate, kthEarliest } from '../../src/achievements/definitions.mjs';

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
  for (const x of Object.values(a)) { assert.equal(x.earned, false, x.id); assert.equal(x.earnedBy, null); assert.ok(x.requirement.length > 0); }
  assert.equal(a['first-lesson'].requirement, 'Pass any lesson.');
  assert.equal(a['topic-level:philosophy/stoicism'].requirement, 'Pass a lesson in Stoicism');
  assert.equal(a['topic-level:philosophy/stoicism'].title, 'Stoicism: Level 1');
  assert.equal(a['completionist:philosophy'].progress, '0/3 lessons');
  assert.equal(a['discipline-explorer'].progress, '0/2 disciplines');
});

test('First Lesson: earliest completed_at among passed rows; failed rows ignored', () => {
  const a = byId([row('les_st01', 1, 3, false, D1), row('les_rr01', 4, 4, true, D3), row('les_so01', 3, 4, true, D2)]);
  assert.equal(a['first-lesson'].earned, true);
  assert.equal(a['first-lesson'].earnedBy, iso(D2));
  assert.equal(byId([row('les_st01', 1, 3, false, D1)])['first-lesson'].earned, false);
});

test('Perfect Score: only best attempts with score == total', () => {
  assert.equal(byId([row('les_st01', 3, 4, true, D1)])['perfect-score'].earned, false);
  const a = byId([row('les_st01', 3, 4, true, D1), row('les_rr01', 4, 4, true, D3), row('les_fr01', 4, 4, true, D2)]);
  assert.equal(a['perfect-score'].earned, true);
  assert.equal(a['perfect-score'].earnedBy, iso(D2));
  // A duplicate worse row for the same lesson doesn't hide the perfect best.
  assert.equal(byId([row('les_rr01', 2, 4, false, D1), row('les_rr01', 4, 4, true, D4)])['perfect-score'].earnedBy, iso(D4));
});

test('Discipline Explorer: every discipline; date = latest of each discipline\'s first pass', () => {
  assert.equal(byId([row('les_st01', 3, 3, true, D1)])['discipline-explorer'].earned, false);
  assert.equal(byId([row('les_st01', 3, 3, true, D1)])['discipline-explorer'].progress, '1/2 disciplines');
  const a = byId([row('les_st01', 3, 3, true, D1), row('les_so01', 3, 4, true, D2), row('les_rr01', 4, 4, true, D3), row('les_fr01', 4, 4, true, D5)]);
  assert.equal(a['discipline-explorer'].earned, true);
  assert.equal(a['discipline-explorer'].earnedBy, iso(D3)); // philosophy first by D1, world history first by D3
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
  assert.deepEqual([at(4).tier, at(4).earnedBy], [1, iso(day(0))]);              // Level 1: 1st pass
  assert.deepEqual([at(5).tier, at(5).earnedBy, at(5).title], [2, iso(day(4)), 'Big Topic: Level 2']); // 5th pass
  assert.deepEqual([at(10).tier, at(10).earnedBy, at(10).progress], [3, iso(day(9)), '0/5 to Level 4']);
  assert.deepEqual([at(12).tier, at(12).earnedBy], [3, iso(day(9))]);
  // Completionist in the fixture discipline needs all 12.
  assert.equal(byId(rows(11), ds)['completionist:fx'].earned, false);
  assert.equal(byId(rows(12), ds)['completionist:fx'].earnedBy, iso(day(11)));
});

test('Completionist: all lessons in a discipline; date = latest; missing date -> no date', () => {
  const ph = [row('les_so01', 3, 4, true, D1), row('les_st01', 3, 3, true, D4), row('les_st02', 3, 4, true, D2)];
  const a = byId(ph);
  assert.equal(a['completionist:philosophy'].earned, true);
  assert.equal(a['completionist:philosophy'].earnedBy, iso(D4));
  assert.equal(a['completionist:world-history'].earned, false);
  assert.equal(a['completionist:world-history'].progress, '0/3 lessons');
  const noDate = byId([row('les_so01', 3, 4, true, D1), row('les_st01', 3, 3, true, null), row('les_st02', 3, 4, true, D2)]);
  assert.deepEqual([noDate['completionist:philosophy'].earned, noDate['completionist:philosophy'].earnedBy], [true, null]);
  // One failed lesson keeps it locked.
  assert.equal(byId([...ph.slice(0, 2), row('les_st02', 1, 4, false, D2)])['completionist:philosophy'].earned, false);
});

test('unknown ids, malformed rows and missing dates are handled', () => {
  const a = byId([row('les_gone01', 4, 4, true, D1), { lesson_id: 'les_st01', score: '3', total: 3, passed: true }, null, row('les_rr01', 4, 4, true)]);
  assert.equal(a['first-lesson'].earned, true);
  assert.equal(a['first-lesson'].earnedBy, null); // the only valid passed row has no date
  assert.equal(a['topic-level:philosophy/stoicism'].earned, false);
  // Everything passed: all earned.
  const all = evaluateAchievements(ALL.map((id) => row(id, 4, 4, true, D6)), disciplines);
  assert.ok(all.every((x) => x.earned), all.filter((x) => !x.earned).map((x) => x.id).join());
});

test('kthEarliest and formatEarnedDate', () => {
  assert.equal(kthEarliest([{ completedAt: D3 }, { completedAt: null }, { completedAt: D1 }], 1), D1);
  assert.equal(kthEarliest([{ completedAt: D3 }, { completedAt: null }, { completedAt: D1 }], 2), D3);
  assert.equal(kthEarliest([{ completedAt: D3 }, { completedAt: null }], 2), null);
  assert.equal(kthEarliest([], 1), null);
  // Rendered in America/Los_Angeles: 05:30 UTC on Oct 10 is still Oct 9 in LA.
  assert.equal(formatEarnedDate('2026-10-10T05:30:00Z'), 'Oct 9, 2026');
  assert.equal(formatEarnedDate('2026-10-10T17:00:00Z'), 'Oct 10, 2026');
  assert.equal(formatEarnedDate(null), null);
  assert.equal(formatEarnedDate('garbage'), null);
});

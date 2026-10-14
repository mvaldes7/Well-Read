import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MASTERY_TIERS, NOT_STARTED, masteryFor, masteryLine, nextTierText, passedInDiscipline } from '../../src/lib/progress/mastery.mjs';
import { completionLookup } from '../../src/lib/progress/logic.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const row = (lesson_id, score, total, passed) => ({ lesson_id, score, total, passed });

test('tier thresholds: Novice 1, Apprentice 5, Scholar 10, Luminary 20', () => {
  assert.deepEqual(MASTERY_TIERS.map((t) => [t.name, t.min]), [['Novice', 1], ['Apprentice', 5], ['Scholar', 10], ['Luminary', 20]]);
  assert.equal(NOT_STARTED, 'Not started');
});

test('masteryFor at the boundaries, with next-tier progress', () => {
  // [n, tier, tierIndex, next, toward, needed, remaining, line, hint]
  const cases = [
    [0, null, 0, 'Novice', 0, 1, 1, '0 lessons · Not started', '0/1 to Novice'],
    [1, 'Novice', 1, 'Apprentice', 1, 5, 4, '1 lesson · Novice', '1/5 to Apprentice'],
    [4, 'Novice', 1, 'Apprentice', 4, 5, 1, '4 lessons · Novice', '4/5 to Apprentice'],
    [5, 'Apprentice', 2, 'Scholar', 5, 10, 5, '5 lessons · Apprentice', '5/10 to Scholar'],
    [9, 'Apprentice', 2, 'Scholar', 9, 10, 1, '9 lessons · Apprentice', '9/10 to Scholar'],
    [10, 'Scholar', 3, 'Luminary', 10, 20, 10, '10 lessons · Scholar', '10/20 to Luminary'],
    [19, 'Scholar', 3, 'Luminary', 19, 20, 1, '19 lessons · Scholar', '19/20 to Luminary'],
    [20, 'Luminary', 4, null, 0, 0, 0, '20 lessons · Luminary', 'Highest tier reached'],
    [25, 'Luminary', 4, null, 0, 0, 0, '25 lessons · Luminary', 'Highest tier reached'],
  ];
  for (const [n, tier, tierIndex, next, toward, needed, remaining, line, hint] of cases) {
    const info = masteryFor(n);
    assert.deepEqual([info.passed, info.tier, info.tierIndex, info.next?.name ?? null, info.toward, info.needed, info.remaining], [n, tier, tierIndex, next, toward, needed, remaining], `n=${n}`);
    assert.equal(masteryLine(info), line, `n=${n}`);
    assert.equal(nextTierText(info), hint, `n=${n}`);
  }
});

test('masteryFor clamps bad input instead of throwing', () => {
  for (const bad of [-1, -0.5, NaN, Infinity, -Infinity, '5', null, undefined, {}, [5]]) {
    assert.deepEqual([masteryFor(bad).passed, masteryFor(bad).tier], [0, null], String(bad));
  }
  assert.equal(masteryFor(4.9).tier, 'Novice');
  assert.equal(masteryFor(19.99).tier, 'Scholar');
});

test('passedInDiscipline: distinct passed content lessons across all topics', () => {
  const ph = disciplines.find((d) => d.slug === 'philosophy');
  const rows = [row('les_st01', 3, 3, true), row('les_st01', 3, 3, true), row('les_so01', 3, 4, true), row('les_st02', 1, 4, false), row('les_gone01', 4, 4, true), row('les_rr01', 4, 4, true)];
  assert.equal(passedInDiscipline(ph, completionLookup(rows, disciplines)), 2);
  assert.equal(passedInDiscipline(ph, completionLookup([...rows, row('les_st02', 4, 4, true)], disciplines)), 3);
  assert.equal(passedInDiscipline(ph, completionLookup([], disciplines)), 0);
  // A lesson added to content counts with no other change.
  const grown = { ...ph, topics: [...ph.topics, { slug: 'new', title: 'New', lessons: [{ id: 'les_zz01' }] }] };
  assert.equal(passedInDiscipline(grown, new Map([['les_zz01', { passed: true }], ['les_st01', { passed: true }]])), 2);
});

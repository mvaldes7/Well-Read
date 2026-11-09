import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ICON_PATHS, iconFor } from '../../src/achievements/icons.mjs';
import { evaluateAchievements } from '../../src/achievements/definitions.mjs';
const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));

test('Completionist set uses the requested subject icons', () => {
  assert.deepEqual(
    Object.fromEntries(['world-history', 'ancient-history', 'philosophy', 'american-civics', 'art-history', 'poetry-and-literature', 'religious-studies'].map((s) => [s, iconFor(`completionist:${s}`)])),
    { 'world-history': 'globe', 'ancient-history': 'column', philosophy: 'lamp', 'american-civics': 'capitol', 'art-history': 'palette', 'poetry-and-literature': 'quill', 'religious-studies': 'candle' },
  );
});

test('milestones get fitting icons; unknown ids fall back to the seal', () => {
  assert.equal(iconFor('first-lesson'), 'book');
  assert.equal(iconFor('perfect-score'), 'laurel');
  assert.equal(iconFor('discipline-explorer'), 'compass');
  assert.equal(iconFor('completionist:new-subject'), 'seal');
  assert.equal(iconFor('something-new'), 'seal');
  assert.equal(iconFor('__proto__'), 'seal');
});

test('every current achievement maps to a drawable icon', () => {
  for (const a of evaluateAchievements([], disciplines)) {
    const name = iconFor(a.id);
    assert.ok(ICON_PATHS[name] && /^M[\d.\s,MmLlHhVvCcSsQqTtAaZz-]+$/.test(ICON_PATHS[name]), `${a.id} -> ${name}`);
    if (a.group === 'completionist') assert.notEqual(name, 'seal', `${a.id} should have a subject icon`);
  }
});

test('Achievements page draws SVG icons, no glyphs or emoji', () => {
  const src = readFileSync(new URL('../../src/app/achievements/page.tsx', import.meta.url), 'utf8');
  assert.match(src, /<BadgeIcon id=\{a\.id\} \/>/);
  assert.doesNotMatch(src, /[★◇]/u);
  assert.doesNotMatch(readFileSync(new URL('../../src/achievements/icons.mjs', import.meta.url), 'utf8'), /\p{Extended_Pictographic}/u);
});

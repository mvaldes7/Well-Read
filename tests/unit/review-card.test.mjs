// /review card meta line (mobile bug): Pacific time formatter, card markup, and the model name staying owner-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { formatPacific, isoOrEmpty } from '../../src/lib/ui/pacific-time.mjs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('formatPacific: "Nov 4, 1:41 PM PT" in America/Los_Angeles regardless of input form', () => {
  assert.equal(formatPacific('2026-11-04T21:41:07.123Z'), 'Nov 4, 1:41 PM PT'); // PST (UTC-8)
  assert.equal(formatPacific(new Date('2026-07-04T16:05:00Z')), 'Jul 4, 9:05 AM PT'); // PDT (UTC-7)
  assert.equal(formatPacific('2026-11-05T07:59:00Z'), 'Nov 4, 11:59 PM PT'); // still Nov 4 in LA
  assert.equal(formatPacific(Date.parse('2026-11-01T09:30:00Z')), 'Nov 1, 1:30 AM PT'); // DST fallback day (first 1:30, PDT)
  assert.equal(formatPacific('2026-11-01T10:30:00Z'), 'Nov 1, 2:30 AM PT');
  for (const bad of [null, undefined, '', 'not a date']) assert.equal(formatPacific(bad), '');
  assert.doesNotMatch(formatPacific('2026-11-04T21:41:07Z'), /[\u202f\u2009\u00a0]/, 'plain spaces only (stable across ICU versions)');
  assert.equal(isoOrEmpty('2026-11-04T21:41:07.123Z'), '2026-11-04T21:41:07.123Z'); assert.equal(isoOrEmpty('x'), '');
});

test('formatPacific ignores the process time zone (server and client agree)', async () => {
  const { execFileSync } = await import('node:child_process');
  const url = new URL('../../src/lib/ui/pacific-time.mjs', import.meta.url).href;
  for (const tz of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `import { formatPacific } from ${JSON.stringify(url)}; process.stdout.write(formatPacific('2026-11-04T21:41:07Z'))`], { env: { ...process.env, TZ: tz } }).toString();
    assert.equal(out, 'Nov 4, 1:41 PM PT', tz);
  }
});

test('review card: meta row is its own full-width class (not .eyebrow/.entry), status pill, choice title, Pacific time', () => {
  const card = read('src/components/ReviewCard.tsx');
  assert.doesNotMatch(card, /^"use client"/, 'server component: time formatted once, nothing to hydrate differently');
  assert.doesNotMatch(card, /className="[^"]*\b(eyebrow|entry)\b/, 'the letter-spaced uppercase / 120px grid classes are gone');
  assert.match(card, /<div className="review-meta">/);
  assert.match(card, /<span className=\{`pill pill-\$\{row\.review_status\}`\}>\{row\.review_status\}<\/span>/);
  assert.match(card, /<time dateTime=\{isoOrEmpty\(row\.created_at\)\}>\{when\}<\/time>/);
  assert.match(card, /<h2 id=\{`rv-\$\{row\.id\}`\}>\{choiceLabel\}<\/h2>/);
  assert.match(card, /from \{parentTitle\}/);
  assert.doesNotMatch(card, /String\(row\.created_at\)/);
  // id and model only inside the collapsed Details block
  const details = card.slice(card.indexOf('<details className="review-details">'), card.indexOf('</details>') + 10);
  assert.match(details, /<summary>Details<\/summary>/);
  assert.doesNotMatch(details, /<details[^>]* open/);
  const rest = card.replace(details, '');
  assert.match(details, /\{row\.model\}/); assert.doesNotMatch(rest, /\{row\.model\}/);
  assert.match(details, /\{row\.id\}/); assert.doesNotMatch(rest.replace(/rv-\$\{row\.id\}/g, ''), /\{row\.id\}/);
  const page = read('src/app/review/page.tsx');
  assert.match(page, /choiceLabel=\{choice\?\.label \?\? row\.choice_id\}/);
  assert.match(page, /parentTitle=\{parent\?\.title \?\? row\.parent_lesson_id\}/);
  const css = read('src/app/globals.css');
  const meta = /\.review-meta \{([^}]*)\}/.exec(css)[1];
  assert.match(meta, /flex-wrap: wrap/); assert.match(meta, /text-transform: none/); assert.match(meta, /letter-spacing: normal/);
});

test('model name never reaches learner-facing /dig pages or their data payload', () => {
  const data = read('src/lib/drilldowns/data.ts');
  const cols = /GENERATED_LESSON_COLUMNS = "([^"]+)"/.exec(data)[1].split(',').map((s) => s.trim());
  assert.ok(!cols.includes('model') && !cols.includes('prompt_version') && !cols.includes('created_by'), cols.join(','));
  assert.doesNotMatch(data, /\bmodel\b/);
  const learner = ['src/app/dig/page.tsx', 'src/components/ReportLesson.tsx', 'src/components/DigDeeper.tsx'];
  for (const f of learner) assert.doesNotMatch(read(f), /\.model\b|\bmodel:|gemini/i, f);
  // The generation API reply carries no model either.
  assert.doesNotMatch(read('src/lib/drilldowns/service.mjs').match(/body: \{ ok: true[^}]*\}/)[0], /model/);
  // Only the owner-only review card renders a model.
  const users = readdirSync(new URL('../../src/components/', import.meta.url)).filter((f) => /\{row\.model\}/.test(read(`src/components/${f}`)));
  assert.deepEqual(users, ['ReviewCard.tsx']);
});

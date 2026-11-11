// Dig deeper on lessons whose curated sources are all blocked (QA defect: les_ch01/hammurabi -> 422 after 0 model calls).
// No network, no database: fetch and DB are mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lessonHasFetchableSource, lessonOffersDigDeeper } from '../../src/lib/drilldowns/sources.mjs';
import { handleDigDeeper, createMinuteLimiter, describeReport } from '../../src/lib/drilldowns/service.mjs';
import { DRILLDOWN_MESSAGES, DRILLDOWN_STATUS } from '../../src/lib/drilldowns/messages.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const lessons = disciplines.flatMap((d) => d.topics.flatMap((t) => t.lessons));
const byId = (id) => lessons.find((l) => l.id === id);

test('lessonHasFetchableSource: Britannica-only lesson is not eligible; mixed lesson is', () => {
  assert.equal(lessonHasFetchableSource({ sources: byId('les_ch01').sources.filter((s) => s.url.includes('britannica.com')) }), false);
  assert.equal(lessonHasFetchableSource(byId('les_fr02')), true);
  assert.equal(lessonHasFetchableSource({ sources: [{ url: 'http://example.edu/x' }] }), false);
  assert.equal(lessonHasFetchableSource({ sources: [] }), false);
  assert.equal(lessonHasFetchableSource(null), false);
});

test('every lesson offers Dig deeper; blocked-only curated sources are still listed for Unreliable Narrator, Meiji, Surrealism, Athenian Democracy, and Protestant beliefs', () => {
  const missing = lessons.filter((l) => !lessonOffersDigDeeper(l)).map((l) => l.id);
  assert.deepEqual(missing, []);
  const blockedOnly = lessons.filter((l) => !lessonHasFetchableSource(l)).map((l) => l.id).sort();
  assert.deepEqual(blockedOnly, ['les_ad01', 'les_mr01', 'les_pc01', 'les_su01', 'les_un01']);
  assert.equal(lessonOffersDigDeeper(byId('les_un01')), true);
  assert.equal(lessonOffersDigDeeper({ digDeeper: [] }), false);
  assert.equal(lessonOffersDigDeeper(null), false);
});

test('service: all-blocked lesson reserves, tries generation (fallback), and if sources still fail returns no_sources and releases the slot', async () => {
  const db = { reserves: [], releases: [], async reserve(...a) { db.reserves.push(a); }, async releaseLesson(u) { db.releases.push(u); }, async saveLesson() { throw new Error('no save'); } };
  const logs = [];
  let generated = 0;
  const blockedOnly = structuredClone(disciplines);
  for (const d of blockedOnly) for (const t of d.topics) for (const l of t.lessons) if (l.id === 'les_ch01') l.sources = l.sources.filter((s) => s.url.includes('britannica.com'));
  const r = await handleDigDeeper({
    enabled: true, body: { lessonId: 'les_ch01', choiceId: 'hammurabi' }, disciplines: blockedOnly, promptVersion: 't',
    limiter: createMinuteLimiter(4, () => 0), billing: { stopped: false },
    getUserId: async () => '11111111-1111-4111-8111-111111111111',
    getCompletionRows: async (id) => [{ lesson_id: id }], db,
    generate: async () => {
      generated++;
      return { verdict: 'rejected', stoppedOn: 'no usable fetched sources: no fetchable source passed the fetch check (blocked sites never count)', calls: [], attempts: [], sourceFetch: { results: [], problems: ['no fetchable source'] } };
    },
    log: (m) => logs.push(m),
  });
  assert.equal(r.status, 422);
  assert.equal(DRILLDOWN_STATUS.no_sources, 422);
  assert.equal(r.body.code, 'no_sources');
  assert.equal(r.body.message, DRILLDOWN_MESSAGES.no_sources);
  assert.equal(db.reserves.length, 1);
  assert.deepEqual(db.releases, ['11111111-1111-4111-8111-111111111111']);
  assert.equal(generated, 1);
  assert.match(logs.join('\n'), /les_ch01\/hammurabi: rejected \(no usable fetched sources/);
});

test('describeReport names the failing step and per-URL results without secrets', () => {
  const s = describeReport({ calls: [], attempts: [], sourceFetch: { results: [
    { url: 'https://www.britannica.com/x', blocked: true, problems: [], status: 0, chars: 0 },
    { url: 'https://a.edu/y', blocked: false, problems: ['HTTP 403'], status: 403, chars: 0 },
    { url: 'https://b.edu/z', blocked: false, problems: [], status: 200, chars: 1234 },
  ] } });
  assert.match(s, /^step=source_fetch calls=0/);
  assert.match(s, /blocked https:\/\/www\.britannica\.com\/x/);
  assert.match(s, /fail\(HTTP 403\) https:\/\/a\.edu\/y/);
  assert.match(s, /ok 200 1234c https:\/\/b\.edu\/z/);
  const g = describeReport({ calls: [1, 2, 3, 4], sourceFetch: { results: [] }, attempts: [
    { schemaProblems: [], sourceProblems: [], contentProblems: [], factCheck: { unconfirmed: ['fact2', 'quiz5'] }, outcome: 'reject' }] });
  assert.match(g, /step=generate\/factcheck calls=4/);
  assert.match(g, /unconfirmed \[fact2,quiz5\] -> reject/);
});

// QA retest (PR #34): no Dig deeper button on revisit of an already completed lesson.
import { digDeeperUnlocked } from '../../src/lib/drilldowns/gate.mjs';
test('digDeeperUnlocked: any recorded attempt for THIS lesson unlocks it on revisit', () => {
  assert.equal(digDeeperUnlocked(new Map([['les_ch01', { passed: true }]]), 'les_ch01'), true);
  assert.equal(digDeeperUnlocked(new Map([['les_ch01', { passed: false }]]), 'les_ch01'), true);
  assert.equal(digDeeperUnlocked(new Map([['les_fr02', { passed: true }]]), 'les_ch01'), false);
  assert.equal(digDeeperUnlocked(new Map(), 'les_ch01'), false);
  assert.equal(digDeeperUnlocked(null, 'les_ch01'), false);
});

test('revisit wiring: page uses QuizWithProgress; Quiz form renders DigDeeper when unlocked', () => {
  const page = readFileSync(new URL('../../src/app/d/[discipline]/[topic]/[lesson]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /<QuizWithProgress \{\.\.\.quizProps\} \/>/);
  const progress = readFileSync(new URL('../../src/components/Progress.tsx', import.meta.url), 'utf8');
  assert.match(progress, /digDeeperUnlocked\(progress\.lookup, props\.lessonId\)/);
  const quiz = readFileSync(new URL('../../src/components/Quiz.tsx', import.meta.url), 'utf8');
  const form = quiz.slice(quiz.indexOf('<form'));
  assert.match(form, /unlocked && digDeeper && digDeeper\.length > 0 && <DigDeeper/);
  assert.equal((quiz.match(/<DigDeeper /g) ?? []).length, 2); // result screen + revisit (form), never both at once
});

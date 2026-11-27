// Static checks on the Dig deeper quiz progress migration (step 3). Behaviour: tests/db/dig-quiz-progress.test.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../../supabase/migrations/', import.meta.url);
const FILE = '20261119063000_dig_quiz_progress.sql';
const raw = readFileSync(new URL(FILE, dir), 'utf8');
const sql = raw.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

test('file is newest; header stays UNAPPLIED; README records it as applied under a different version', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  assert.equal(files.at(-1), FILE);
  assert.match(raw, /STATUS: UNAPPLIED/);
  assert.match(raw, /until Mike has\s*\n?--\s*separately approved/);
  const readme = readFileSync(new URL('../../supabase/README.md', import.meta.url), 'utf8');
  assert.match(readme, /`20261127232541`[\s\S]*20261119063000_dig_quiz_progress\.sql/);
  assert.match(readme, /20261119063000_dig_quiz_progress\.sql[\s\S]*Recorded version differs from the filename/);
  assert.doesNotMatch(readme, /20261119063000_dig_quiz_progress\.sql.*Not applied/);
});

test('no functions, no service_role or anon grants, no destructive statements beyond the policy/constraint swap', () => {
  assert.doesNotMatch(sql, /create (or replace )?function|security definer/i);
  assert.doesNotMatch(sql, /grant [^;]* to [^;]*(service_role|anon|public)/i);
  assert.doesNotMatch(sql, /drop table|truncate|delete from|update public\./i);
  assert.deepEqual([...sql.matchAll(/\bdrop (policy|constraint) "?(\w+)"?/g)].map((m) => m[2]), ['generated_lesson_completions_insert_own_visible', 'activity_log_ref_format']);
});

test('grants: revoke all first, then select/insert and column-level update only', () => {
  const revoke = sql.indexOf('revoke all on table public.generated_lesson_completions from public, anon, authenticated, service_role;');
  assert.ok(revoke > 0);
  assert.ok(sql.indexOf('grant select, insert on table public.generated_lesson_completions to authenticated;') > revoke);
  assert.match(sql, /grant update \(score, total, passed, completed_at, first_passed_at\) on table public\.generated_lesson_completions to authenticated;/);
  assert.doesNotMatch(sql, /grant [^;]*delete/i);
});

test('insert policy requires the parent lesson completion, with the outer lesson_id qualified', () => {
  assert.match(sql, /join public\.lesson_completions c\s+on c\.lesson_id = g\.parent_lesson_id\s+and c\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /where g\.id = generated_lesson_completions\.lesson_id/);
  assert.match(sql, /check \(ref ~ '\^les_\[a-z0-9\]\{4,12\}\$' or ref ~ '\^gen_\[a-z0-9\]\{8,16\}\$'\)/);
});

test('the applied drilldowns migration is untouched by this step', () => {
  const applied = readFileSync(new URL('20261102231600_drilldowns.sql', dir), 'utf8');
  assert.match(applied, /create policy "generated_lesson_completions_insert_own_visible"/);
});

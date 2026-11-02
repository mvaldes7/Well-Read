// Static checks on the drill-downs P2 migration (CI has no Postgres; behaviour is tested by `pnpm test:db` locally).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../../supabase/migrations/', import.meta.url);
const raw = readFileSync(new URL('20261102231600_drilldowns.sql', dir), 'utf8');
const sql = raw.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

test('drilldowns migration is new, last, and marked unapplied', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  assert.equal(files.at(-1), '20261102231600_drilldowns.sql');
  assert.match(raw, /STATUS: UNAPPLIED/);
});

test('every function is SECURITY INVOKER with search_path pinned and EXECUTE revoked from clients', () => {
  const fns = [...sql.matchAll(/create function (public\.\w+)\(([^)]*)\)[\s\S]*?\$\$;/g)];
  assert.equal(fns.length, 2);
  for (const [body, name] of fns) {
    assert.match(body, /security invoker\s+set search_path = ''/, name);
    assert.doesNotMatch(body, /security definer/i, name);
    assert.match(sql, new RegExp(`revoke all on function ${name.replace('.', '\\.')}\\([^)]*\\) from public, anon, authenticated;`), name);
  }
  assert.doesNotMatch(sql, /security definer/i);
});

test('RLS on every table; users get no write on lessons, keys or counters; user_id defaults to auth.uid()', () => {
  for (const t of ['generated_lessons', 'generated_quiz_keys', 'lesson_reports', 'drilldown_usage_user', 'drilldown_usage_global', 'generated_lesson_completions'])
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
  for (const t of ['generated_lessons', 'generated_quiz_keys', 'drilldown_usage_user', 'drilldown_usage_global'])
    assert.doesNotMatch(sql, new RegExp(`grant [^;]*(insert|update|delete)[^;]*on table public\\.${t}[^;]* to authenticated;`), t);
  assert.doesNotMatch(sql, /on table public\.generated_quiz_keys to authenticated/);
  assert.equal((sql.match(/default auth\.uid\(\)/g) ?? []).length, 3);
  assert.doesNotMatch(sql, /to anon;|to anon,/);
  assert.match(sql, /using \(review_status = 'published'\s+or \(created_by = \(select auth\.uid\(\)\) and review_status in \('pending', 'flagged'\)\)\)/);
});

test('publish is admin-only (trigger), caps are CHECK constraints at 2 / 25 / 100', () => {
  assert.match(sql, /pg_has_role\(current_user, 'drilldown_admin', 'MEMBER'\)/);
  assert.match(sql, /errcode = 'WR403'/);
  assert.match(sql, /check \(lessons between 0 and 2\)/);
  assert.match(sql, /check \(lessons between 0 and 25\)/);
  assert.match(sql, /check \(calls between 0 and 100\)/);
  assert.match(sql, /errcode = 'WR429'/);
});

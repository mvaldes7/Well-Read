// Static checks on the drill-downs P2 migration; behaviour is covered by throwaway Postgres tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../../supabase/migrations/', import.meta.url);
const raw = readFileSync(new URL('20261102231600_drilldowns.sql', dir), 'utf8');
const sql = raw.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

test('drilldowns migrations retain their order and P2 is marked unapplied', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  assert.deepEqual(files.filter((f) => f.includes("_drilldown")), ['20261102231600_drilldowns.sql', '20261104214500_drilldown_review.sql', '20261105000000_drilldown_release.sql']);
  assert.match(raw, /STATUS: UNAPPLIED/);
});

test('functions pin search_path; definer ones are server-only except drilldown_my_lessons', () => {
  const fns = [...sql.matchAll(/create function (public\.\w+)\(([^)]*)\)[\s\S]*?\$\$;/g)];
  assert.equal(fns.length, 6);
  const definer = [];
  for (const [body, name] of fns) {
    assert.match(body, /security (invoker|definer)\s+set search_path = ''/, name);
    if (/security definer/.test(body)) definer.push(name);
    assert.match(sql, new RegExp(`revoke all on function ${name.replace('.', '\\.')}\\([^)]*\\) from public, anon, authenticated, service_role;`), name);
  }
  assert.deepEqual(definer.sort(), ['public.drilldown_my_lessons', 'public.drilldown_quiz_key', 'public.drilldown_require_verified', 'public.drilldown_reserve', 'public.drilldown_save_lesson']);
  const grants = [...sql.matchAll(/grant execute on function (public\.\w+)\([^)]*\) to (\w+);/g)].map((m) => `${m[1]}:${m[2]}`).sort();
  assert.deepEqual(grants, ['public.drilldown_my_lessons:authenticated', 'public.drilldown_quiz_key:drilldown_server', 'public.drilldown_reserve:drilldown_server', 'public.drilldown_save_lesson:drilldown_server']);
});

test('no service_role grants, no drilldown_admin, server role has no table grants or password', () => {
  assert.doesNotMatch(sql, /to [^;]*service_role/);
  assert.doesNotMatch(raw, /drilldown_admin/);
  assert.doesNotMatch(sql, /on table [^;]* to [^;]*drilldown_server/);
  assert.doesNotMatch(sql, /password/i);
  assert.match(sql, /create role drilldown_server login noinherit nobypassrls/);
  assert.match(sql, /email_confirmed_at is not null/);
});

test('RLS on every table; column-level select on lessons; user_id defaults to auth.uid()', () => {
  for (const t of ['generated_lessons', 'generated_quiz_keys', 'lesson_reports', 'drilldown_usage_user', 'drilldown_usage_global', 'generated_lesson_completions'])
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
  for (const t of ['generated_lessons', 'generated_quiz_keys', 'drilldown_usage_user', 'drilldown_usage_global'])
    assert.doesNotMatch(sql, new RegExp(`grant [^;]*(insert|update|delete)[^;]*on table public\\.${t}[^;]* to authenticated;`), t);
  assert.doesNotMatch(sql, /grant select on table public\.generated_lessons/);
  const cols = sql.match(/grant select \(([^)]*)\)\s+on table public\.generated_lessons to authenticated;/);
  assert.ok(cols);
  assert.doesNotMatch(cols[1], /created_by|unconfirmed_claims/);
  assert.equal((sql.match(/default auth\.uid\(\)/g) ?? []).length, 3);
  assert.doesNotMatch(sql, /to anon;|to anon,/);
  assert.match(sql, /revoke all on table public\.generated_lesson_completions from public, anon, authenticated, service_role;/);
});

test('publish is owner-SQL only; caps are CHECK constraints at 2 / 8 / 25 / 100', () => {
  assert.match(sql, /not in \('pending', 'flagged', 'rejected'\)/);
  assert.match(sql, /check \(lessons between 0 and 2\)/);
  assert.match(sql, /check \(calls between 0 and 8\)/);
  assert.match(sql, /check \(lessons between 0 and 25\)/);
  assert.match(sql, /check \(calls between 0 and 100\)/);
  assert.match(sql, /errcode = 'WR429'/);
});

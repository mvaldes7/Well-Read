// insertActivity (what logActivity runs) with a fake Supabase client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { insertActivity as logActivity } from '../../src/lib/streaks/streaks.mjs';

const fake = (result) => {
  const calls = [];
  return { calls, from: (table) => ({ insert: async (row) => { calls.push([table, row]); if (result instanceof Error) throw result; return result; } }) };
};
const quiet = async (fn) => { const orig = console.error; const logs = []; console.error = (m) => logs.push(String(m)); try { return [await fn(), logs]; } finally { console.error = orig; } };

test('logActivity: inserts one own-session row', async () => {
  const sb = fake({ error: null });
  assert.equal(await logActivity(sb, 'u1', 'quiz_attempt', 'les_st01'), 'logged');
  assert.deepEqual(sb.calls, [['activity_log', { user_id: 'u1', kind: 'quiz_attempt', ref: 'les_st01' }]]);
});

test('logActivity: table missing (migration not applied) -> "unavailable", no error log, no throw', async () => {
  const sb = fake({ error: { code: 'PGRST205', message: "Could not find the table 'public.activity_log' in the schema cache" } });
  const [out, logs] = await quiet(() => logActivity(sb, 'u1', 'quiz_attempt', 'les_st01'));
  assert.equal(out, 'unavailable');
  assert.deepEqual(logs, []);
});

test('logActivity: other errors and exceptions -> "failed", logged by code only, no throw', async () => {
  const [out, logs] = await quiet(() => logActivity(fake({ error: { code: '42501', message: 'secret detail' } }), 'u1', 'quiz_attempt', 'les_st01'));
  assert.equal(out, 'failed');
  assert.deepEqual(logs, ['activity_log insert failed (42501)']);
  const [out2, logs2] = await quiet(() => logActivity(fake(new Error('network')), 'u1', 'quiz_attempt', 'les_st01'));
  assert.equal(out2, 'failed');
  assert.deepEqual(logs2, ['activity_log insert failed (exception)']);
});

test('migration: append-only RLS, own rows, index, idempotent single-row-per-completion backfill', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261014232500_activity_log.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table public\.activity_log/);
  assert.match(sql, /alter table public\.activity_log enable row level security;/);
  assert.match(sql, /revoke all on table public\.activity_log from anon, authenticated;/);
  assert.match(sql, /grant select, insert on table public\.activity_log to authenticated;/);
  assert.doesNotMatch(sql, /for update|for delete|grant[^;]*(update|delete)/i);
  assert.equal((sql.match(/\(select auth\.uid\(\)\)/g) ?? []).length, 2);
  assert.match(sql, /on public\.activity_log \(user_id, occurred_at\)/);
  assert.match(sql, /check \(kind in \('lesson_passed', 'quiz_attempt'\)\)/);
  assert.match(sql, /where not exists/);
});

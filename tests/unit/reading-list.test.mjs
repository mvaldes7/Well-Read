import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KINDS, STATUSES, MESSAGES, TITLE_MAX, URL_MAX, validateNewItem, validateUrl, parseItemId, moveTargets,
  completedAtAfter, safeHref, isMissingTableError, groupItems, kindLabel,
} from '../../src/lib/reading-list/logic.mjs';
import { PUBLIC_PATHS, classifyPath, decideAuth } from '../../src/lib/auth/logic.mjs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ok = (o) => validateNewItem({ title: 'Meditations', kind: 'book', url: '', ...o });

test('title: required, trimmed, whitespace collapsed, 1..300 characters (code points)', () => {
  assert.deepEqual(ok({}).value, { title: 'Meditations', kind: 'book', url: null });
  assert.equal(ok({ title: '  The  Republic\n ' }).value.title, 'The Republic');
  for (const t of ['', '   ', '\n\t', undefined, null, 42]) assert.equal(ok({ title: t }).errors.title, MESSAGES.titleRequired, String(t));
  assert.equal(ok({ title: 'x'.repeat(TITLE_MAX) }).ok, true);
  assert.equal(ok({ title: 'x'.repeat(TITLE_MAX + 1) }).errors.title, MESSAGES.titleTooLong);
  // 300 emoji are 600 UTF-16 units but 300 characters, as Postgres char_length counts them.
  assert.equal(ok({ title: '📚'.repeat(TITLE_MAX) }).ok, true);
});

test('kind: only the six allowed values, matching the dropdown', () => {
  assert.deepEqual(KINDS.map((k) => k.label), ['Book', 'Article', 'Poem', 'Essay', 'Video', 'Other']);
  for (const k of KINDS) assert.equal(ok({ kind: k.value }).ok, true, k.value);
  for (const k of ['Book', 'BOOK', 'podcast', '', undefined, ['book']]) assert.equal(ok({ kind: k }).errors.kind, MESSAGES.kindInvalid, String(k));
  assert.equal(kindLabel('essay'), 'Essay');
});

test('url: optional; only absolute http(s); javascript:, data:, relative and others rejected', () => {
  for (const u of ['', '   ', undefined, null]) assert.deepEqual(validateUrl(u), { ok: true, value: null });
  for (const u of ['https://example.com', 'http://example.com/a?b=c#d', 'HTTPS://Example.com/x', '  https://example.com/pad  ']) {
    assert.equal(validateUrl(u).ok, true, u);
  }
  assert.equal(validateUrl('  https://example.com/pad  ').value, 'https://example.com/pad');
  const bad = [
    'javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>', 'DATA:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox(1)',
    'file:///etc/passwd', 'ftp://example.com', 'mailto:a@b.c', '//example.com', '/relative', 'example.com',
    'https://', 'https:example.com', 'http://',
  ];
  for (const u of bad) assert.equal(validateUrl(u).ok, false, u);
  assert.equal(ok({ url: 'javascript:alert(1)' }).errors.url, MESSAGES.urlInvalid);
  const long = 'https://e.com/' + 'a'.repeat(URL_MAX);
  assert.equal(validateUrl(long).error, MESSAGES.urlTooLong);
  assert.equal(validateUrl(('https://e.com/' + 'a'.repeat(URL_MAX)).slice(0, URL_MAX)).ok, true);
});

test('safeHref re-checks at render: unsafe stored values render as plain text', () => {
  assert.equal(safeHref('https://example.com'), 'https://example.com');
  for (const u of ['javascript:alert(1)', 'data:,x', null, undefined, '', 5]) assert.equal(safeHref(u), null, String(u));
});

test('validation reports every field at once and never reads a user id', () => {
  const r = validateNewItem({ title: '', kind: 'nope', url: 'data:,x', user_id: 'someone-else' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['kind', 'title', 'url']);
  assert.equal('user_id' in ok({ user_id: 'x' }).value, false);
});

test('item ids: positive integers only', () => {
  for (const v of ['1', '42', '9007199254740991']) assert.equal(parseItemId(v), v);
  for (const v of ['0', '-1', '1.5', '01', 'abc', '', ' 1', '1e3', '99999999999999999', undefined, 7]) assert.equal(parseItemId(v), null, String(v));
});

test('status transitions: any status can move to each of the other two', () => {
  assert.deepEqual(STATUSES.map((s) => s.label), ['To Read', 'In Progress', 'Completed']);
  assert.deepEqual(moveTargets('to_read'), ['in_progress', 'completed']);
  assert.deepEqual(moveTargets('in_progress'), ['to_read', 'completed']);
  assert.deepEqual(moveTargets('completed'), ['to_read', 'in_progress']);
});

test('completed_at rule (mirrors the trigger): set on completion, kept while completed, cleared otherwise', () => {
  const now = '2026-10-14T20:00:00.000Z', earlier = '2026-10-01T10:00:00.000Z';
  assert.equal(completedAtAfter(null, 'to_read', now), null);
  assert.equal(completedAtAfter(null, 'completed', now), now);
  assert.equal(completedAtAfter({ status: 'in_progress', completed_at: null }, 'completed', now), now);
  assert.equal(completedAtAfter({ status: 'completed', completed_at: earlier }, 'completed', now), earlier);
  assert.equal(completedAtAfter({ status: 'completed', completed_at: earlier }, 'in_progress', now), null);
  assert.equal(completedAtAfter({ status: 'completed', completed_at: earlier }, 'to_read', now), null);
  // Re-completing after reopening is a new completion.
  assert.equal(completedAtAfter({ status: 'to_read', completed_at: null }, 'completed', now), now);
});

test('missing table detection (pre-migration): PGRST205 / 42P01 naming this table only', () => {
  assert.equal(isMissingTableError({ code: 'PGRST205', message: "Could not find the table 'public.reading_list_items' in the schema cache" }), true);
  assert.equal(isMissingTableError({ code: '42P01', message: 'relation "public.reading_list_items" does not exist' }), true);
  assert.equal(isMissingTableError({ code: 'PGRST205' }), true);
  assert.equal(isMissingTableError({ code: 'PGRST205', message: "Could not find the table 'public.other'" }), false);
  for (const e of [null, undefined, {}, { code: '42501', message: 'permission denied for table reading_list_items' }, { code: 'PGRST204' }]) {
    assert.equal(isMissingTableError(e), false, JSON.stringify(e));
  }
});

test('groupItems: by status, drops malformed rows, queue order / newest completed first', () => {
  const row = (id, status, created_at, extra = {}) => ({ id, title: `T${id}`, kind: 'book', url: null, status, created_at, completed_at: null, ...extra });
  const g = groupItems([
    row(2, 'to_read', '2026-10-02T00:00:00Z'), row(1, 'to_read', '2026-10-01T00:00:00Z'),
    row(3, 'in_progress', '2026-10-03T00:00:00Z'),
    row(4, 'completed', '2026-09-01T00:00:00Z', { completed_at: '2026-10-05T00:00:00Z' }),
    row(5, 'completed', '2026-09-02T00:00:00Z', { completed_at: '2026-10-09T00:00:00Z' }),
    row(6, 'archived', '2026-10-01T00:00:00Z'), { id: 7, title: 'no kind', status: 'to_read', created_at: 'x' }, null, 'junk',
  ]);
  assert.deepEqual(g.to_read.map((i) => i.id), ['1', '2']);
  assert.deepEqual(g.in_progress.map((i) => i.id), ['3']);
  assert.deepEqual(g.completed.map((i) => i.id), ['5', '4']);
  assert.deepEqual(groupItems([]), { to_read: [], in_progress: [], completed: [] });
});

test('/reading-list stays protected by the unchanged proxy: signed out -> 307 to /login', () => {
  assert.equal(PUBLIC_PATHS.has('/reading-list'), false);
  assert.equal(classifyPath('/reading-list'), 'protected');
  assert.deepEqual(decideAuth({ pathname: '/reading-list', authed: false }), { type: 'redirect', location: '/login?next=%2Freading-list' });
  // The proxy turns a redirect decision into NextResponse.redirect, whose default status is 307.
  const proxy = read('src/proxy.ts');
  assert.match(proxy, /NextResponse\.redirect\(/);
  assert.doesNotMatch(proxy, /NextResponse\.redirect\([^)]*,\s*30[128]\)/);
});

test('wiring: session client only, getClaims re-check, server validation, id-scoped writes, trigger owns completed_at', () => {
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  const actions = read('src/lib/reading-list/actions.ts');
  const data = read('src/lib/reading-list/data.ts');
  for (const src of [actions, data]) {
    assert.doesNotMatch(src, /service_role|SERVICE_ROLE|secret/i);
    assert.match(src, /createClient\(\)/);
    assert.match(src, /getClaims\(\)/);
  }
  assert.match(actions, /^"use server";/);
  assert.match(actions, /validateNewItem\(values\)/);
  assert.doesNotMatch(actions, /formData\.get\("user_id"\)|user_id:/);
  assert.doesNotMatch(code(actions), /completed_at/);
  assert.match(actions, /\.update\(\{ status: to \}\)\.eq\("id", id\)/);
  assert.match(actions, /\.delete\(\)\.eq\("id", id\)/);
  assert.match(data, /isMissingTableError\(error\)\) return \{ status: "unavailable" \}/);
  const page = read('src/app/reading-list/page.tsx');
  assert.match(page, /list\.status === "unavailable"/);
  assert.match(page, /MESSAGES\.unavailable/);
  assert.equal(MESSAGES.unavailable, 'Not available yet');
  const item = read('src/components/ReadingListItem.tsx');
  assert.match(item, /rel="noopener noreferrer"/);
  assert.match(item, /safeHref\(item\.url\)/);
  assert.match(item, /<dialog/);
  assert.match(item, /showModal\(\)/);
  assert.match(item, /aria-haspopup="dialog"/);
});

test('migration SQL: table, checks, trigger with search_path, RLS own-row CRUD, grants, index', () => {
  const name = '20261014234000_reading_list_items.sql';
  const sql = read(`supabase/migrations/${name}`);
  assert.ok(name.slice(0, 14) > '20261014232500', 'version after TSK-016 activity_log');
  assert.match(sql, new RegExp(`version ${name.slice(0, 14)}`));
  const s = sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
  assert.match(s, /create table public\.reading_list_items \(/);
  assert.match(s, /id bigint generated always as identity primary key/);
  assert.match(s, /user_id uuid not null default auth\.uid\(\) references auth\.users \(id\) on delete cascade/);
  assert.match(s, /check \(char_length\(btrim\(title\)\) between 1 and 300\)/);
  assert.match(s, /check \(kind in \('book', 'article', 'poem', 'essay', 'video', 'other'\)\)/);
  assert.match(s, /check \(url is null or \(url ~\* '\^https\?:\/\/' and char_length\(url\) <= 2048\)\)/);
  assert.match(s, /status text not null default 'to_read'/);
  assert.match(s, /check \(status in \('to_read', 'in_progress', 'completed'\)\)/);
  assert.match(s, /check \(\(status = 'completed'\) = \(completed_at is not null\)\)/);
  assert.match(s, /created_at timestamptz not null default now\(\)/);
  assert.match(s, /updated_at timestamptz not null default now\(\)/);
  assert.match(s, /completed_at timestamptz,/);
  assert.match(s, /create index reading_list_items_user_id_status_idx on public\.reading_list_items \(user_id, status\)/);
  assert.match(s, /set search_path = ''/);
  assert.match(s, /new\.updated_at := pg_catalog\.now\(\)/);
  assert.match(s, /before insert or update on public\.reading_list_items for each row execute function public\.reading_list_items_touch\(\)/);
  assert.match(s, /enable row level security/);
  assert.match(s, /revoke all on table public\.reading_list_items from anon, authenticated/);
  assert.match(s, /grant select, insert, update, delete on table public\.reading_list_items to authenticated/);
  assert.doesNotMatch(s, /to anon|grant [^;]* anon/);
  for (const op of ['select', 'insert', 'update', 'delete']) assert.match(s, new RegExp(`"reading_list_items_${op}_own" on public\\.reading_list_items for ${op} to authenticated`), op);
  assert.match(s, /for update to authenticated using \(user_id = \(select auth\.uid\(\)\)\) with check \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.equal((s.match(/\(select auth\.uid\(\)\)/g) ?? []).length, 5);
  assert.doesNotMatch(s, /using \(user_id = auth\.uid\(\)\)|security definer/);
});

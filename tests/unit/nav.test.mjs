import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIDEBAR_LINKS, NO_SIDEBAR, activeHref, showSidebar } from '../../src/lib/ui/nav.mjs';
import { classifyPath, decideAuth } from '../../src/lib/auth/logic.mjs';

test('sidebar link set: exactly Dashboard, Learn, Library Wall, Reading List, Progress, Badges, Settings (no Ledger/Search)', () => {
  assert.deepEqual(SIDEBAR_LINKS.map((l) => [l.label, l.href]), [
    ['Dashboard', '/'], ['Learn', '/learn'], ['Library Wall', '/bookshelf'], ['Reading List', '/reading-list'], ['Progress', '/progress'], ['Badges', '/achievements'], ['Settings', '/account'],
  ]);
  const labels = SIDEBAR_LINKS.map((l) => l.label.toLowerCase()).join('|');
  for (const banned of ['ledger', 'search']) assert.ok(!labels.includes(banned), banned);
  // Sign out is the UserMenu form in the sidebar footer, not a link.
  const sidebar = readFileSync(new URL('../../src/components/Sidebar.tsx', import.meta.url), 'utf8');
  assert.match(sidebar, /<nav aria-label="Main">/);
  assert.match(sidebar, /aria-expanded=\{open\}/);
  assert.match(sidebar, /aria-controls="sidebar-panel"/);
  assert.match(sidebar, /e\.key !== "Escape"/);
  assert.match(readFileSync(new URL('../../src/components/UserMenu.tsx', import.meta.url), 'utf8'), /Sign out/);
});

test('active link: one per section; content pages count as Learn', () => {
  const cases = [['/', '/'], ['/learn', '/learn'], ['/learn/', '/learn'], ['/d/philosophy', '/learn'], ['/d/philosophy/stoicism/les', '/learn'],
    ['/bookshelf', '/bookshelf'], ['/progress', '/progress'], ['/achievements', '/achievements'], ['/account', '/account'], ['/reading-list', '/reading-list'], ['/reading-list/', '/reading-list'], ['/nope', null], ['/dashboard', null]];
  for (const [p, want] of cases) assert.equal(activeHref(p), want, p);
});

test('no sidebar on the auth pages only', () => {
  for (const p of ['/login', '/signup', '/auth/forgot', '/auth/reset', '/login/']) assert.equal(showSidebar(p), false, p);
  for (const p of ['/', '/learn', '/progress', '/account', '/d/philosophy']) assert.equal(showSidebar(p), true, p);
  assert.equal(NO_SIDEBAR.size, 4);
});

test('new routes are protected by the default rule: signed out -> redirect to /login (307 in the proxy)', () => {
  for (const p of ['/learn', '/progress', '/reading-list']) {
    assert.equal(classifyPath(p), 'protected', p);
    assert.deepEqual(decideAuth({ pathname: p, authed: false }), { type: 'redirect', location: `/login?next=${encodeURIComponent(p)}` }, p);
    assert.deepEqual(decideAuth({ pathname: p, authed: true }), { type: 'next' }, p);
  }
  assert.deepEqual(decideAuth({ pathname: '/', authed: false }), { type: 'redirect', location: '/login' });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { trapTab, escReturnsFocus } from '../../src/lib/ui/nav.mjs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('focus trap: Tab wraps last -> first, Shift+Tab first -> last, else the browser moves focus', () => {
  // 5 focusables: [toggle, link, link, link, sign out]
  assert.equal(trapTab(5, 4, false), 0);
  assert.equal(trapTab(5, 0, true), 4);
  assert.equal(trapTab(5, 2, false), null);
  assert.equal(trapTab(5, 2, true), null);
  assert.equal(trapTab(5, 0, false), null);
  assert.equal(trapTab(5, 4, true), null);
  // Focus escaped the menu somehow (e.g. clicked the page): pull it back in.
  assert.equal(trapTab(5, -1, false), 0);
  assert.equal(trapTab(5, -1, true), 4);
  // Single item: always stays on it. No items: nothing to do.
  assert.equal(trapTab(1, 0, false), 0);
  assert.equal(trapTab(1, 0, true), 0);
  assert.equal(trapTab(0, -1, false), null);
});

test('Esc returns focus to the toggle only when focus was inside the menu', () => {
  assert.equal(escReturnsFocus(true), true);
  assert.equal(escReturnsFocus(false), false);
});

test('Sidebar: plain wrapper with a labelled <nav>, trap + conditional Esc wired in', () => {
  const src = read('src/components/Sidebar.tsx');
  assert.doesNotMatch(src, /<aside|<\/aside>/);
  assert.match(src, /<div className=\{`sidebar\$\{open \? " open" : ""\}`\}>/);
  assert.match(src, /<nav aria-label="Main">/);
  assert.match(src, /e\.key === "Escape"[\s\S]*if \(escReturnsFocus\(inside\)\) toggle\.focus\(\);/);
  assert.match(src, /const inside = focused === toggle \|\| box\.contains\(focused\);/);
  assert.match(src, /e\.key !== "Tab"/);
  assert.match(src, /trapTab\(items\.length, items\.indexOf\(focused as HTMLElement\), e\.shiftKey\)/);
  assert.match(src, /e\.preventDefault\(\);/);
  // Desktop (toggle hidden): no trap.
  assert.match(src, /toggle\.offsetParent === null\) return;/);
});

test('sidebar hover and active styles differ in colour, background and edge', () => {
  const css = read('src/app/globals.css');
  const rule = (sel) => {
    const m = css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'));
    assert.ok(m, sel);
    return Object.fromEntries(m[1].split(';').map((d) => d.split(':').map((x) => x.trim())).filter((d) => d[0]));
  };
  const hover = rule('.sidebar nav a:hover');
  const active = rule('.sidebar nav a[aria-current="page"]');
  for (const prop of ['color', 'background', 'border-left-color']) assert.notEqual(hover[prop], active[prop], prop);
  assert.equal(active['font-weight'], '600');
  assert.equal(hover['font-weight'], undefined);
  // Hovering the active item keeps it looking active.
  assert.equal(rule('.sidebar nav a[aria-current="page"]:hover').color, active.color);
});

test('dashboard reads progress and streak in parallel', () => {
  const page = read('src/app/page.tsx');
  assert.match(page, /const \[progress, streak\] = await Promise\.all\(\[getMyProgress\(\), getMyStreak\(\)\]\);/);
  assert.equal((page.match(/await getMyStreak\(\)/g) ?? []).length, 0);
});

test('SidebarStreak words both values with daysLabel', () => {
  const src = read('src/components/SidebarStreak.tsx');
  assert.match(src, /daysLabel\(s\.current\)/);
  assert.match(src, /daysLabel\(s\.best\)/);
  assert.doesNotMatch(src, /=== 1 \? "day" : "days"/);
});

test('activity kinds: the app logs quiz_attempt only (lesson_passed dropped from app code)', () => {
  const log = read('src/lib/streaks/log.ts').replace(/\/\/[^\n]*/g, '');
  assert.match(log, /export type ActivityKind = "quiz_attempt";/);
  assert.doesNotMatch(log, /lesson_passed/);
  assert.doesNotMatch(read('src/lib/streaks/streaks.mjs'), /"lesson_passed"/);
  assert.match(read('src/lib/quiz/actions.ts'), /logActivity\(supabase, userId, "quiz_attempt", lessonId\)/);
});

test('supabase/README.md lists every migration file with its version and marks headers historical', () => {
  const readme = read('supabase/README.md');
  const files = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql'));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const version = f.slice(0, 14);
    assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/);
    // One table row per file: its version cell and its file cell.
    assert.match(readme, new RegExp(`\\| \`${version}\` +\\| \`migrations/${f.replace('.', '\\.')}\` +\\|`), f);
  }
  assert.match(readme, /historical/i);
  assert.match(readme, /STATUS: UNAPPLIED/);
  assert.match(read('docs/architecture.md'), /supabase\/README\.md/);
});

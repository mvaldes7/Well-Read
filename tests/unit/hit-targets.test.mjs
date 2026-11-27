import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// UI PR1: 44px mobile hit areas (web-interface-guidelines "Targets", make-interfaces-feel-better #16),
// >= 24px on desktop, and the sticky mobile top bar never covers focus.
const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** Body of every `@media (max-width: <px>px) { ... }` block, concatenated (one level of nesting). */
function mediaBlocks(px) {
  const out = [];
  const re = new RegExp(`@media \\(max-width: ${px}px\\) \\{`, 'g');
  while (re.exec(css)) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < css.length && depth; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    out.push(css.slice(re.lastIndex, i - 1));
  }
  return out.join('\n');
}

/** Declarations of the LAST top-level-in-scope rule for `sel` inside `scope`. */
function decls(scope, sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const all = [...scope.matchAll(new RegExp(`(?:^|\\n)\\s*${esc} \\{([^}]*)\\}`, 'g'))];
  assert.ok(all.length, `missing rule: ${sel}`);
  return all.map((m) => m[1]).join(';');
}

const mobile = mediaBlocks(820);

test('mobile (<= 820px): covered controls get a 44px minimum height', () => {
  for (const sel of ['.menu-toggle', '.btn-ghost', '.logo', '.user-link', '.breadcrumbs a', '.view-toggle button', '.rl-btn']) {
    assert.match(decls(mobile, sel), /min-height:\s*44px/, sel);
  }
  assert.match(mobile, /\.forgot a, \.auth-alt a, \.subject-cta a \{[^}]*min-height:\s*44px/);
  assert.match(mobile, /\.entry h2 a, \.entry-title a \{[^}]*min-height:\s*44px/);
  // The old 10px / 6px-10px shrink that made Sign out 30px tall is gone.
  assert.doesNotMatch(decls(mobile, '.btn-ghost'), /font-size:\s*10px/);
});

test('all widths: sidebar links, back link and reminder switch are >= 44px; small text links >= 24px', () => {
  assert.match(decls(css, '.sidebar nav a'), /min-height:\s*44px/);
  assert.match(decls(css, '.back-link a'), /min-height:\s*44px/);
  assert.match(decls(css, '.reminder-switch'), /min-height:\s*44px/);
  for (const sel of ['.breadcrumbs a', '.subject-cta a']) assert.match(decls(css, sel), /min-height:\s*24px/, sel);
  assert.match(css, /\.forgot a, \.auth-alt a \{[^}]*min-height:\s*24px/);
  assert.match(read('src/components/LessonReminder.tsx'), /<label className="reminder-switch"><input type="checkbox" role="switch"/);
});

test('sticky mobile top bar: scroll padding clears it; sidebar user placeholder matches the 44px row', () => {
  assert.match(css, /--topbar-h:\s*73px/);
  assert.match(css, /\.opts input\[type="radio"\] \{ scroll-margin-top: 96px; \}/);
  assert.match(decls(mobile, 'html'), /scroll-padding-top:\s*calc\(var\(--topbar-h\) \+ 14px\)/);
  assert.match(decls(mobile, '.sidebar-user .user-placeholder'), /height:\s*44px/);
});

test('touch polish: touch-action, tap highlight, opacity press feedback, no transition: all', () => {
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /-webkit-tap-highlight-color:/);
  assert.match(css, /\.btn-ghost:active:not\(:disabled\), \.rl-btn:active:not\(:disabled\)[^{]*\{ opacity: 0\.8; \}/);
  assert.doesNotMatch(css, /transition:\s*all/);
});

test('breadcrumb separators trail their crumb, so a wrapped line never starts with "/"', () => {
  assert.match(css, /\.breadcrumbs li:not\(:last-child\)::after \{ content: "\/";/);
  assert.doesNotMatch(css, /\.breadcrumbs li \+ li::before/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRoman } from '../../src/lib/ui/roman.mjs';

test('toRoman', () => {
  const cases = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 9: 'IX', 14: 'XIV', 40: 'XL', 90: 'XC', 400: 'CD', 1994: 'MCMXCIV', 3999: 'MMMCMXCIX' };
  for (const [n, r] of Object.entries(cases)) assert.equal(toRoman(Number(n)), r);
  for (const bad of [0, -1, 4000, 1.5, NaN]) assert.equal(toRoman(bad), String(bad));
});

test('display name is Well-Read: the old display names are gone from app source', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('../../src/', import.meta.url).pathname;
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(root);
  const hits = files.filter((f) => /\.(tsx?|mjs|css|json)$/.test(f) && /foundation\s*-?learn|curio/i.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
  const layout = readFileSync(join(root, 'app/layout.tsx'), 'utf8');
  assert.match(layout, /title: \{ default: "Well-Read", template: "%s · Well-Read" \}/);
  assert.match(layout, /appleWebApp: \{ capable: true, title: "Well-Read"/);
  // TSK-015: the logo (icon + wordmark) moved from the layout header into the Sidebar.
  const sidebar = readFileSync(join(root, 'components/Sidebar.tsx'), 'utf8');
  assert.match(sidebar, />\s*Well-Read<small>/);
  // Logo icon (TSK-018): inline, decorative only, inside the logo link next to the wordmark.
  assert.match(sidebar, /<Link href="\/" className="logo">\s*<LogoMark \/>/);
  assert.match(layout, /<Sidebar\b/);
  const mark = readFileSync(join(root, 'components/LogoMark.tsx'), 'utf8');
  assert.match(mark, /<svg[^>]*aria-hidden="true"/);
  assert.match(mark, /<svg[^>]*focusable="false"/);
  assert.doesNotMatch(mark, /<title|aria-label|role="img"/);
  assert.match(readFileSync(join(root, 'app/page.tsx'), 'utf8'), /<h1>Dashboard<\/h1>/);
  assert.match(readFileSync(join(root, 'app/learn/page.tsx'), 'utf8'), /<h1>Learn<\/h1>/);
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.name, 'well-read');
});

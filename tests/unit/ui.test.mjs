import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRoman } from '../../src/lib/ui/roman.mjs';

test('toRoman', () => {
  const cases = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 9: 'IX', 14: 'XIV', 40: 'XL', 90: 'XC', 400: 'CD', 1994: 'MCMXCIV', 3999: 'MMMCMXCIX' };
  for (const [n, r] of Object.entries(cases)) assert.equal(toRoman(Number(n)), r);
  for (const bad of [0, -1, 4000, 1.5, NaN]) assert.equal(toRoman(bad), String(bad));
});

test('display name is Curio: the old display name is gone from app source', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('../../src/', import.meta.url).pathname;
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(root);
  const hits = files.filter((f) => /\.(tsx?|mjs|css|json)$/.test(f) && /foundation\s*-?learn/i.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
  const layout = readFileSync(join(root, 'app/layout.tsx'), 'utf8');
  assert.match(layout, /title: \{ default: "Curio", template: "%s · Curio" \}/);
  assert.match(readFileSync(join(root, 'app/page.tsx'), 'utf8'), /<h1>Curio<\/h1>/);
});

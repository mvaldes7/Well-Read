import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRoman } from '../../src/lib/ui/roman.mjs';

test('toRoman', () => {
  const cases = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 9: 'IX', 14: 'XIV', 40: 'XL', 90: 'XC', 400: 'CD', 1994: 'MCMXCIV', 3999: 'MMMCMXCIX' };
  for (const [n, r] of Object.entries(cases)) assert.equal(toRoman(Number(n)), r);
  for (const bad of [0, -1, 4000, 1.5, NaN]) assert.equal(toRoman(bad), String(bad));
});

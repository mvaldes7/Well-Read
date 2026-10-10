import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAME_MAX, NAME_MESSAGES, headerDisplay, namesFromMetadata, validateName, validateNames } from '../../src/lib/account/names.mjs';

test('validateName trims and accepts normal names', () => {
  assert.deepEqual(validateName('  Mike  ', 'first_name'), { ok: true, value: 'Mike' });
  assert.deepEqual(validateName('\tValdes\n', 'last_name'), { ok: true, value: 'Valdes' });
});

test('validateName rejects empty, whitespace-only and non-string values', () => {
  for (const v of ['', '   ', '\n\t', undefined, null, 42, {}]) {
    assert.deepEqual(validateName(v, 'first_name'), { ok: false, error: NAME_MESSAGES.first_name.missing }, String(v));
  }
});

test('validateName enforces 1..50 characters, counted in code points', () => {
  assert.equal(validateName('a', 'first_name').ok, true);
  assert.equal(validateName('a'.repeat(NAME_MAX), 'first_name').ok, true);
  assert.deepEqual(validateName('a'.repeat(NAME_MAX + 1), 'last_name'), { ok: false, error: NAME_MESSAGES.last_name.tooLong });
  // 50 astral characters are 100 UTF-16 units but still 50 characters.
  assert.equal(validateName('𝒜'.repeat(NAME_MAX), 'first_name').ok, true);
  // Surrounding spaces don't count toward the limit.
  assert.equal(validateName(` ${'b'.repeat(NAME_MAX)} `, 'first_name').ok, true);
});

test('validateName rejects control and bidi-override characters', () => {
  for (const v of ['Mi\u0000ke', 'Mi\u0007ke', 'Mi\u007fke', 'Mi\u0085ke', 'Mike\u202e', 'Mi\u2066ke', 'Mi\nke']) {
    assert.deepEqual(validateName(v, 'first_name'), { ok: false, error: NAME_MESSAGES.first_name.invalid }, JSON.stringify(v));
  }
});

test('validateName allows unicode names in any script', () => {
  for (const v of ['José', 'Zoë', 'Ngũgĩ', "O'Brien", 'Jean-Luc', '李', 'Владимир', 'محمد', 'Åsa Maria', '😀']) {
    assert.deepEqual(validateName(v, 'first_name'), { ok: true, value: v.normalize('NFC') }, v);
  }
  // Decomposed input is normalised to NFC.
  assert.equal(validateName('Jose\u0301', 'first_name').value, 'Jos\u00e9');
});

test('validateNames returns cleaned data or per-field errors', () => {
  assert.deepEqual(validateNames(' Mike ', ' Valdes '), { ok: true, data: { first_name: 'Mike', last_name: 'Valdes' } });
  assert.deepEqual(validateNames('', 'x'.repeat(51)), { ok: false, errors: { first_name: NAME_MESSAGES.first_name.missing, last_name: NAME_MESSAGES.last_name.tooLong } });
  assert.deepEqual(validateNames('Mike', null), { ok: false, errors: { last_name: NAME_MESSAGES.last_name.missing } });
});

test('namesFromMetadata reads valid names and ignores bad shapes', () => {
  assert.deepEqual(namesFromMetadata({ first_name: 'Mike', last_name: 'Valdes' }), { firstName: 'Mike', lastName: 'Valdes' });
  assert.deepEqual(namesFromMetadata({ first_name: ' Mike ' }), { firstName: 'Mike', lastName: null });
  for (const meta of [undefined, null, 'x', {}, { first_name: 7 }, { first_name: '' }, { first_name: 'a'.repeat(60) }, { first_name: 'a\u0000b' }]) {
    assert.deepEqual(namesFromMetadata(meta), { firstName: null, lastName: null }, JSON.stringify(meta));
  }
});

test('headerDisplay falls back from first name to email', () => {
  assert.deepEqual(headerDisplay({ firstName: 'Mike', email: 'm@example.test' }), { label: 'Mike', isName: true });
  assert.deepEqual(headerDisplay({ firstName: null, email: 'm@example.test' }), { label: 'm@example.test', isName: false });
  assert.deepEqual(headerDisplay({ firstName: '', email: 'm@example.test' }), { label: 'm@example.test', isName: false });
});

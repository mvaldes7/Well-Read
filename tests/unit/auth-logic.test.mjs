import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGES,
  authErrorMessage,
  classifyPath,
  decideAuth,
  loginRedirectFor,
  safeNextPath,
  validateCredentials,
} from '../../src/lib/auth/logic.mjs';

test('classifyPath: auth pages, public assets, everything else protected', () => {
  assert.equal(classifyPath('/login'), 'auth');
  assert.equal(classifyPath('/signup/'), 'auth');
  assert.equal(classifyPath('/_next/static/chunk.js'), 'public');
  assert.equal(classifyPath('/favicon.ico'), 'public');
  for (const p of ['/', '/bookshelf', '/bookshelf/', '/d/philosophy', '/d/philosophy/stoicism/the-roman-stoics', '/d/nope', '/loginx', '/anything']) {
    assert.equal(classifyPath(p), 'protected', p);
  }
});

test('signed-out users on protected paths are redirected to /login with a safe next', () => {
  assert.deepEqual(decideAuth({ pathname: '/', authed: false }), { type: 'redirect', location: '/login' });
  assert.deepEqual(decideAuth({ pathname: '/d/philosophy', authed: false }), {
    type: 'redirect',
    location: '/login?next=%2Fd%2Fphilosophy',
  });
  assert.deepEqual(decideAuth({ pathname: '/d/philosophy/stoicism', search: '?x=1', authed: false }), {
    type: 'redirect',
    location: '/login?next=%2Fd%2Fphilosophy%2Fstoicism%3Fx%3D1',
  });
  // Unknown slugs also redirect for signed-out users (no 404 hint).
  assert.equal(decideAuth({ pathname: '/d/nope', authed: false }).type, 'redirect');
});

test('signed-out users can reach auth pages and public assets', () => {
  assert.deepEqual(decideAuth({ pathname: '/login', authed: false }), { type: 'next' });
  assert.deepEqual(decideAuth({ pathname: '/signup', authed: false }), { type: 'next' });
  assert.deepEqual(decideAuth({ pathname: '/_next/static/a.js', authed: false }), { type: 'next' });
});

test('signed-in users on auth pages are redirected to /, and pass through elsewhere', () => {
  assert.deepEqual(decideAuth({ pathname: '/login', authed: true }), { type: 'redirect', location: '/' });
  assert.deepEqual(decideAuth({ pathname: '/signup', search: '?next=/d', authed: true }), { type: 'redirect', location: '/' });
  assert.deepEqual(decideAuth({ pathname: '/', authed: true }), { type: 'next' });
  assert.deepEqual(decideAuth({ pathname: '/d/philosophy', authed: true }), { type: 'next' });
});

test('safeNextPath keeps same-origin relative paths', () => {
  assert.equal(safeNextPath('/d/philosophy'), '/d/philosophy');
  assert.equal(safeNextPath('/d/philosophy?x=1#top'), '/d/philosophy?x=1#top');
  assert.equal(safeNextPath('/'), '/');
});

test('safeNextPath rejects open redirects and junk', () => {
  const bad = [
    'https://evil.example',
    '//evil.example',
    '//evil.example/path',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'evil.example',
    '/%0a//evil.example'.replace('%0a', '\n'),
    '/\t/evil.example',
    '',
    '/' + 'a'.repeat(600),
    '/login',
    '/signup?x=1',
  ];
  for (const v of bad) assert.equal(safeNextPath(v), '/', JSON.stringify(v));
  assert.equal(safeNextPath(undefined), '/');
  assert.equal(safeNextPath(null), '/');
  assert.equal(safeNextPath(42), '/');
  assert.equal(safeNextPath('https://evil.example', '/home'), '/home');
});

test('loginRedirectFor never embeds an unsafe next', () => {
  assert.equal(loginRedirectFor('//evil.example'), '/login');
  assert.equal(loginRedirectFor('/'), '/login');
  assert.equal(loginRedirectFor('/login'), '/login');
});

test('validateCredentials requires both fields', () => {
  assert.equal(validateCredentials('', 'pw'), MESSAGES.missingFields);
  assert.equal(validateCredentials('   ', 'pw'), MESSAGES.missingFields);
  assert.equal(validateCredentials('a@b.c', ''), MESSAGES.missingFields);
  assert.equal(validateCredentials(null, null), MESSAGES.missingFields);
  assert.equal(validateCredentials('a@b.c', 'pw'), null);
});

test('authErrorMessage maps Supabase error codes without revealing accounts on sign-in', () => {
  assert.equal(authErrorMessage('invalid_credentials', 'signin'), 'Invalid email or password.');
  assert.equal(authErrorMessage('user_not_found', 'signin'), MESSAGES.invalidCredentials);
  assert.equal(authErrorMessage('email_address_invalid', 'signin'), MESSAGES.invalidCredentials);
  assert.equal(authErrorMessage('email_not_confirmed', 'signin'), MESSAGES.emailNotConfirmed);
  assert.equal(authErrorMessage('weak_password', 'signup'), MESSAGES.weakPassword);
  assert.equal(authErrorMessage('user_already_exists', 'signup'), MESSAGES.signupFailed);
  assert.equal(authErrorMessage('signup_disabled', 'signup'), MESSAGES.signupDisabled);
  assert.equal(authErrorMessage('over_request_rate_limit', 'signin'), MESSAGES.rateLimited);
  assert.equal(authErrorMessage(undefined, 'signin', 429), MESSAGES.rateLimited);
  assert.equal(authErrorMessage('not_configured', 'signin'), MESSAGES.notConfigured);
  assert.equal(authErrorMessage('something_new', 'signin'), MESSAGES.generic);
  assert.equal(authErrorMessage(undefined, 'signup'), MESSAGES.generic);
});

test('path guard: a file extension never makes a path public', () => {
  for (const p of ['/d/philosophy.png', '/secret.json', '/logo.png', '/d/x/y.ico', '/favicon.ico.json', '/_next/data/x.json', '/.env']) {
    assert.equal(classifyPath(p), 'protected', p);
    assert.equal(decideAuth({ pathname: p, authed: false }).type, 'redirect', p);
  }
});

test('path guard: only allow-listed assets and framework paths are public', () => {
  for (const p of ['/favicon.ico', '/_next/static/chunks/main.js', '/_next/image', '/auth/confirm']) {
    assert.equal(classifyPath(p), 'public', p);
    assert.deepEqual(decideAuth({ pathname: p, authed: false }), { type: 'next' }, p);
  }
});

test('confirm helpers: OTP types and login error codes', async () => {
  const { isEmailOtpType, loginErrorMessage, MESSAGES: M } = await import('../../src/lib/auth/logic.mjs');
  assert.equal(isEmailOtpType('email'), true);
  assert.equal(isEmailOtpType('signup'), true);
  assert.equal(isEmailOtpType('sms'), false);
  assert.equal(isEmailOtpType(null), false);
  assert.equal(loginErrorMessage('confirm_failed'), M.confirmFailed);
  assert.equal(loginErrorMessage('<script>'), null);
  assert.equal(loginErrorMessage(null), null);
});

test('bookshelf is protected: signed-out redirect keeps next', () => {
  assert.deepEqual(decideAuth({ pathname: '/bookshelf', authed: false }), { type: 'redirect', location: '/login?next=%2Fbookshelf' });
  assert.deepEqual(decideAuth({ pathname: '/bookshelf', authed: true }), { type: 'next' });
});

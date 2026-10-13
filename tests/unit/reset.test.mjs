import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD_MIN, PRODUCTION_ORIGIN, RECOVERY_WINDOW_S, RESET_MESSAGES,
  forgotOutcome, isRecoverySession, noticeMessage, passwordErrorMessage,
  resetRedirectTo, resolveSiteOrigin, trustedOrigins, validateEmail, validateNewPassword,
} from '../../src/lib/auth/reset.mjs';

test('validateEmail accepts plain addresses and rejects junk', () => {
  assert.equal(validateEmail(' a@b.co '), null);
  for (const v of ['', '   ', 'a', 'a@b', '@b.co', 'a b@c.co', null, 42, `${'x'.repeat(250)}@b.co`]) {
    assert.equal(validateEmail(v), RESET_MESSAGES.invalidEmail, String(v));
  }
});

test('validateNewPassword: minimum length, byte maximum, must match', () => {
  assert.equal(PASSWORD_MIN, 8);
  assert.equal(validateNewPassword('12345678', '12345678'), null);
  assert.deepEqual(validateNewPassword('1234567', '1234567'), { password: RESET_MESSAGES.passwordTooShort });
  assert.deepEqual(validateNewPassword(undefined, undefined), { password: RESET_MESSAGES.passwordTooShort });
  assert.deepEqual(validateNewPassword('x'.repeat(73), 'x'.repeat(73)), { password: RESET_MESSAGES.passwordTooLong });
  assert.deepEqual(validateNewPassword('é'.repeat(37), 'é'.repeat(37)), { password: RESET_MESSAGES.passwordTooLong }); // 74 bytes
  assert.deepEqual(validateNewPassword('12345678', '12345679'), { confirm: RESET_MESSAGES.passwordMismatch });
  assert.deepEqual(validateNewPassword('12345678', null), { confirm: RESET_MESSAGES.passwordMismatch });
});

test('forgotOutcome: one neutral message for every Supabase outcome (no enumeration)', () => {
  const neutral = forgotOutcome();
  assert.deepEqual(neutral, { status: 'sent', message: 'If that account exists, we sent a link.' });
  // The action calls forgotOutcome() with no Supabase info at all, so success, unknown email,
  // rate limits (per-address or project) and server errors can't produce different replies.
  assert.equal(forgotOutcome({}).message, neutral.message);
  assert.equal(forgotOutcome({ invalidEmail: true }).message, RESET_MESSAGES.invalidEmail);
  assert.equal(forgotOutcome({ notConfigured: true }).status, 'error');
  assert.match(RESET_MESSAGES.neutralHint, /try again later/);
});

test('passwordErrorMessage maps Supabase codes', () => {
  assert.equal(passwordErrorMessage('same_password'), RESET_MESSAGES.samePassword);
  assert.equal(passwordErrorMessage('weak_password'), RESET_MESSAGES.weakPassword);
  assert.equal(passwordErrorMessage('current_password_mismatch'), RESET_MESSAGES.currentWrong);
  assert.equal(passwordErrorMessage('invalid_credentials'), RESET_MESSAGES.currentWrong);
  assert.equal(passwordErrorMessage('current_password_required'), RESET_MESSAGES.currentRequired);
  assert.equal(passwordErrorMessage('reauthentication_needed'), RESET_MESSAGES.reauthNeeded);
  assert.equal(passwordErrorMessage('session_not_found'), RESET_MESSAGES.sessionEnded);
  assert.equal(passwordErrorMessage('over_request_rate_limit'), RESET_MESSAGES.rateLimited);
  assert.equal(passwordErrorMessage(undefined, 429), RESET_MESSAGES.rateLimited);
  assert.equal(passwordErrorMessage('something_new', 500), RESET_MESSAGES.generic);
});

test('isRecoverySession: only a fresh email-link sign-in counts', () => {
  const now = 1_800_000_000;
  const c = (amr) => ({ sub: 'u1', amr });
  assert.equal(isRecoverySession(c([{ method: 'recovery', timestamp: now - 60 }]), now), true);
  assert.equal(isRecoverySession(c([{ method: 'otp', timestamp: now - 60 }]), now), true);
  assert.equal(isRecoverySession(c([{ method: 'password', timestamp: now - 60 }]), now), false);
  assert.equal(isRecoverySession(c([{ method: 'recovery', timestamp: now - RECOVERY_WINDOW_S - 1 }]), now), false);
  assert.equal(isRecoverySession(c([{ method: 'recovery', timestamp: now + 3600 }]), now), false);
  assert.equal(isRecoverySession(c([{ method: 'password', timestamp: now }, { method: 'otp', timestamp: now - 10 }]), now), true);
  for (const bad of [null, {}, { sub: 'u1' }, { amr: [{ method: 'otp', timestamp: now }] }, c('otp'), c([null]), c([{ method: 'otp' }])]) {
    assert.equal(isRecoverySession(bad, now), false, JSON.stringify(bad));
  }
});

test('resolveSiteOrigin trusts only allow-listed origins, never a raw Host header', () => {
  const vercel = { VERCEL: '1', VERCEL_URL: 'well-read-abc123.vercel.app', VERCEL_BRANCH_URL: 'well-read-git-x.vercel.app' };
  assert.equal(resolveSiteOrigin(PRODUCTION_ORIGIN, vercel), PRODUCTION_ORIGIN);
  assert.equal(resolveSiteOrigin('https://well-read-abc123.vercel.app', vercel), 'https://well-read-abc123.vercel.app');
  assert.equal(resolveSiteOrigin('https://well-read-git-x.vercel.app/path', vercel), 'https://well-read-git-x.vercel.app');
  for (const evil of ['https://evil.example', 'http://well-read-learn.vercel.app', 'https://well-read-learn.vercel.app.evil.com',
    'http://localhost:3000', 'javascript:alert(1)', 'not a url', '', null]) {
    assert.equal(resolveSiteOrigin(evil, vercel), PRODUCTION_ORIGIN, String(evil));
  }
  // Off Vercel (local dev / pnpm start) localhost is allowed.
  assert.equal(resolveSiteOrigin('http://localhost:3913', {}), 'http://localhost:3913');
  assert.equal(resolveSiteOrigin('http://127.0.0.1:3000', {}), 'http://127.0.0.1:3000');
  assert.equal(resolveSiteOrigin('http://localhost.evil.com', {}), PRODUCTION_ORIGIN);
  assert.equal(trustedOrigins({ VERCEL_URL: 'bad host/x' }).size, 1);
});

test('resetRedirectTo goes through /auth/confirm to /auth/reset; notice codes', () => {
  assert.equal(resetRedirectTo(PRODUCTION_ORIGIN), 'https://well-read-learn.vercel.app/auth/confirm?next=%2Fauth%2Freset');
  assert.equal(noticeMessage('password_updated'), RESET_MESSAGES.updated);
  assert.equal(noticeMessage('<script>'), null);
  assert.equal(noticeMessage(null), null);
});

test('reset actions source: neutral reply, local-only sign-out, server-side recovery check', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/lib/auth/reset-actions.ts', import.meta.url), 'utf8');
  // The reset request ignores Supabase's result entirely and always returns forgotOutcome().
  assert.match(src, /resetPasswordForEmail\([^)]*\{ redirectTo: resetRedirectTo\(origin\) \}\)\.catch\(\(\) => undefined\);/);
  assert.match(src, /return forgotOutcome\(\);/);
  assert.doesNotMatch(src, /const \{[^}]*error[^}]*\} = await supabase\.auth\.resetPasswordForEmail/);
  assert.match(src, /resolveSiteOrigin\(/);
  // The throwaway verifier must never sign out globally (that would end the user's sessions).
  assert.match(src, /signOut\(\{ scope: "local" \}\)/);
  assert.doesNotMatch(src, /scope: "global"|service_role|SERVICE_ROLE/i);
  assert.match(src, /isRecoverySession\(data\?\.claims\)/);
  assert.doesNotMatch(src, /console\.(log|info|warn|error)/);
  const confirm = readFileSync(new URL('../../src/app/auth/confirm/route.ts', import.meta.url), 'utf8');
  assert.match(confirm, /exchangeCodeForSession\(code\)/);
  assert.match(confirm, /\/auth\/reset\?error=invalid_link|RESET_PATH\}\?error=invalid_link/);
});

test('login links to /auth/forgot; reset page sends normal sessions to /account', async () => {
  const { readFileSync } = await import('node:fs');
  const login = readFileSync(new URL('../../src/app/login/page.tsx', import.meta.url), 'utf8');
  assert.match(login, /<Link href="\/auth\/forgot">Forgot password\?<\/Link>/);
  const reset = readFileSync(new URL('../../src/app/auth/reset/page.tsx', import.meta.url), 'utf8');
  assert.match(reset, /if \(isRecoverySession\(claims\)\)/);
  assert.match(reset, /redirect\("\/account"\)/);
  assert.match(reset, /href=\{FORGOT_PATH\}/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { strayAuthLanding, afterCodeExchangePath, RESET_PATH } from "../../src/lib/auth/reset.mjs";

const q = (s) => new URLSearchParams(s);

test("root landing with a PKCE code is forwarded to /auth/confirm with its params", () => {
  assert.equal(strayAuthLanding("/", q("code=abc")), "/auth/confirm?code=abc");
  assert.equal(
    strayAuthLanding("/", q("token_hash=t&type=recovery")),
    "/auth/confirm?token_hash=t&type=recovery",
  );
  assert.equal(
    strayAuthLanding("/", q("error=access_denied&error_code=otp_expired")),
    "/auth/confirm?error=access_denied&error_code=otp_expired",
  );
});

test("other requests are left alone", () => {
  assert.equal(strayAuthLanding("/", q("")), null);
  assert.equal(strayAuthLanding("/", q("notice=password_updated")), null);
  assert.equal(strayAuthLanding("/learn", q("code=abc")), null);
  assert.equal(strayAuthLanding("/auth/confirm", q("code=abc")), null);
});

test("after a code exchange, recovery sessions go to the reset form", () => {
  const now = 1_800_000_000;
  const recovery = { sub: "u1", amr: [{ method: "recovery", timestamp: now - 10 }] };
  const password = { sub: "u1", amr: [{ method: "password", timestamp: now - 10 }] };
  assert.equal(afterCodeExchangePath(recovery, "/", now), RESET_PATH);
  assert.equal(afterCodeExchangePath(password, "/learn", now), "/learn");
  assert.equal(afterCodeExchangePath(null, "/", now), "/");
  assert.equal(afterCodeExchangePath(null, RESET_PATH, now), RESET_PATH);
});

test("a signup confirmation (amr otp) without next is not sent to the reset form", () => {
  const now = 1_800_000_000;
  const signup = { sub: "u1", amr: [{ method: "otp", timestamp: now - 10 }] };
  assert.equal(afterCodeExchangePath(signup, "/", now), "/");
  const stale = { sub: "u1", amr: [{ method: "recovery", timestamp: now - 86_400 }] };
  assert.equal(afterCodeExchangePath(stale, "/", now), "/");
});

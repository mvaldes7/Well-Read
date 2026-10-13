// @ts-check
// Pure password-reset logic (TSK-018), shared by server actions, pages and unit tests.

export const FORGOT_PATH = "/auth/forgot";
export const RESET_PATH = "/auth/reset";
/** Canonical production origin; the fallback when a request's origin isn't trusted. */
export const PRODUCTION_ORIGIN = "https://well-read-learn.vercel.app";
export const PASSWORD_MIN = 8;
/** bcrypt (used by Supabase Auth) ignores bytes past 72. */
export const PASSWORD_MAX = 72;
/** A recovery sign-in counts for this long (seconds) after the email link was used. */
export const RECOVERY_WINDOW_S = 15 * 60;
/**
 * AMR methods Supabase Auth itself treats as a recovery context (GoTrue
 * `Session.IsRecovery()`): `recovery` from the PKCE `?code` exchange, `otp` from the
 * token-hash `verifyOtp` link, and `magiclink`.
 */
export const RECOVERY_AMR = Object.freeze(["recovery", "otp", "magiclink"]);

export const RESET_MESSAGES = Object.freeze({
  neutralSent: "If that account exists, we sent a link.",
  neutralHint: "It can take a few minutes to arrive. If nothing comes, check spam or try again later.",
  invalidEmail: "Enter a valid email address.",
  passwordTooShort: `Use at least ${PASSWORD_MIN} characters.`,
  passwordTooLong: `Use at most ${PASSWORD_MAX} characters.`,
  passwordMismatch: "The passwords don't match.",
  currentRequired: "Enter your current password.",
  currentWrong: "Your current password is incorrect.",
  samePassword: "Choose a password different from your current one.",
  weakPassword: "That password is too weak. Use a longer password.",
  rateLimited: "Too many attempts. Wait a moment and try again.",
  reauthNeeded: "For security, sign out and sign in again, then change your password.",
  linkInvalid: "That reset link is invalid or has expired.",
  sessionEnded: "Your session has ended. Sign in again.",
  notConfigured: "Password reset isn't configured on this server.",
  generic: "Couldn't change your password. Please try again.",
  updated: "Your password was updated.",
  changed: "Password changed. Other devices have been signed out.",
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {unknown} email
 * @returns {string | null} error message or null
 */
export function validateEmail(email) {
  if (typeof email !== "string") return RESET_MESSAGES.invalidEmail;
  const e = email.trim();
  if (e === "" || e.length > 254 || !EMAIL_RE.test(e)) return RESET_MESSAGES.invalidEmail;
  return null;
}

/**
 * Validate a new password + confirmation. Returns per-field errors, or null when valid.
 * @param {unknown} password
 * @param {unknown} confirm
 * @returns {{ password?: string, confirm?: string } | null}
 */
export function validateNewPassword(password, confirm) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) return { password: RESET_MESSAGES.passwordTooShort };
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return { password: RESET_MESSAGES.passwordTooLong };
  if (typeof confirm !== "string" || confirm !== password) return { confirm: RESET_MESSAGES.passwordMismatch };
  return null;
}

/**
 * Outcome of a reset request. Anti-enumeration: every Supabase outcome (success, unknown
 * email, per-address or project rate limit, other errors) gets the SAME neutral message.
 * The per-address limit (one email per 60 s) only applies to existing accounts, so
 * surfacing it would reveal that the account exists. Only local problems differ.
 * @param {{ invalidEmail?: boolean, notConfigured?: boolean }} [local]
 * @returns {{ status: "sent" | "error", message: string }}
 */
export function forgotOutcome(local = {}) {
  if (local.invalidEmail) return { status: "error", message: RESET_MESSAGES.invalidEmail };
  if (local.notConfigured) return { status: "error", message: RESET_MESSAGES.notConfigured };
  return { status: "sent", message: RESET_MESSAGES.neutralSent };
}

/**
 * Map an updateUser / password-check AuthError to a message.
 * @param {string | undefined | null} code
 * @param {number} [status]
 */
export function passwordErrorMessage(code, status) {
  switch (code) {
    case "same_password":
      return RESET_MESSAGES.samePassword;
    case "weak_password":
      return RESET_MESSAGES.weakPassword;
    case "invalid_credentials":
    case "current_password_mismatch":
      return RESET_MESSAGES.currentWrong;
    case "current_password_required":
      return RESET_MESSAGES.currentRequired;
    case "reauthentication_needed":
    case "insufficient_aal":
      return RESET_MESSAGES.reauthNeeded;
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
      return RESET_MESSAGES.sessionEnded;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return RESET_MESSAGES.rateLimited;
    default:
      return status === 429 ? RESET_MESSAGES.rateLimited : RESET_MESSAGES.generic;
  }
}

/**
 * True when verified JWT claims come from a fresh email-link sign-in (recovery context).
 * A normal password session (amr "password") is not a recovery context.
 * @param {unknown} claims verified claims from supabase.auth.getClaims()
 * @param {number} [nowS] current time in seconds
 */
export function isRecoverySession(claims, nowS = Math.floor(Date.now() / 1000)) {
  if (!claims || typeof claims !== "object") return false;
  const c = /** @type {{ sub?: unknown, amr?: unknown }} */ (claims);
  if (typeof c.sub !== "string" || !c.sub || !Array.isArray(c.amr)) return false;
  return c.amr.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = /** @type {{ method?: unknown, timestamp?: unknown }} */ (entry);
    return (
      typeof method === "string" &&
      RECOVERY_AMR.includes(method) &&
      typeof timestamp === "number" &&
      timestamp <= nowS + 60 &&
      nowS - timestamp <= RECOVERY_WINDOW_S
    );
  });
}

/**
 * Hosts we trust to appear in the reset link. Built from deploy config, never from the
 * request alone: the production URL, Vercel's own system env (VERCEL_URL etc., set by
 * the platform), and localhost only when not running on Vercel.
 * @param {Record<string, string | undefined>} env
 * @returns {Set<string>} trusted origins
 */
export function trustedOrigins(env) {
  const set = new Set([PRODUCTION_ORIGIN]);
  for (const key of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) {
    const host = env[key];
    if (host && /^[a-z0-9.-]+$/i.test(host)) set.add(`https://${host.toLowerCase()}`);
  }
  return set;
}

/**
 * Pick the origin for redirectTo: the request's origin when it's trusted, else production.
 * @param {string | null | undefined} candidate e.g. "https://host" built from request headers
 * @param {Record<string, string | undefined>} env
 */
export function resolveSiteOrigin(candidate, env) {
  let origin;
  try {
    origin = candidate ? new URL(candidate).origin : null;
  } catch {
    origin = null;
  }
  if (!origin || origin === "null") return PRODUCTION_ORIGIN;
  if (trustedOrigins(env).has(origin)) return origin;
  if (!env.VERCEL && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin)) return origin;
  return PRODUCTION_ORIGIN;
}

/**
 * redirectTo for resetPasswordForEmail. PKCE (our @supabase/ssr client) appends ?code=,
 * which /auth/confirm exchanges before sending the user on to /auth/reset.
 * @param {string} origin trusted origin from resolveSiteOrigin
 */
export function resetRedirectTo(origin) {
  return `${origin}/auth/confirm?next=${encodeURIComponent(RESET_PATH)}`;
}

/**
 * Map a `?notice=` code (home page) to a message; unknown codes show nothing.
 * @param {string | null | undefined} code
 */
export function noticeMessage(code) {
  return code === "password_updated" ? RESET_MESSAGES.updated : null;
}

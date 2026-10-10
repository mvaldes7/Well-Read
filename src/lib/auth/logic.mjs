// @ts-check
// Pure auth logic shared by the proxy, server actions and unit tests.
// Plain ESM + JSDoc so Node 20's test runner can import it without a TS loader;
// `// @ts-check` + `allowJs` make `tsc --noEmit` type-check it when TS code imports it.

/** @typedef {"public" | "auth" | "protected"} RouteKind */
/** @typedef {{ type: "next" } | { type: "redirect", location: string }} AuthDecision */
/** @typedef {"signin" | "signup"} AuthFlow */

export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";
const AUTH_PAGES = new Set([LOGIN_PATH, SIGNUP_PATH]);
export const CONFIRM_PATH = "/auth/confirm";

/**
 * Exact public paths. Only real static files and the email-confirmation endpoint;
 * keep in sync with files in src/app (favicon.ico) and public/ (none yet).
 * A file extension alone never makes a path public.
 */
export const PUBLIC_PATHS = new Set(["/favicon.ico", CONFIRM_PATH]);
/** Framework asset prefixes (build output, image optimizer, dev HMR socket). */
export const PUBLIC_PREFIXES = ["/_next/static/", "/_next/image", "/_next/webpack-hmr"];
const MAX_NEXT_LENGTH = 512;
const BASE = "http://internal.invalid";

export const MESSAGES = Object.freeze({
  missingFields: "Enter your email and password.",
  invalidCredentials: "Invalid email or password.",
  emailNotConfirmed: "Please confirm your email address first. Check your inbox for the confirmation link.",
  weakPassword: "That password is too weak. Use a longer password.",
  invalidEmail: "Enter a valid email address.",
  signupFailed: "Couldn't create an account with these details.",
  signupDisabled: "Sign-ups are currently disabled.",
  rateLimited: "Too many attempts. Wait a moment and try again.",
  notConfigured: "Login isn't configured on this server.",
  confirmFailed: "That confirmation link is invalid or has expired. Try signing in, or sign up again.",
  generic: "Something went wrong. Please try again.",
  checkEmail: "Check your email to confirm your account, then sign in.",
});

/**
 * Normalise a pathname: strip a trailing slash (except for "/").
 * @param {string} pathname
 */
function normalise(pathname) {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/**
 * Classify a request path. Everything that isn't an allow-listed static asset,
 * framework asset or auth page requires login (the whole app is private).
 * @param {string} pathname
 * @returns {RouteKind}
 */
export function classifyPath(pathname) {
  const p = normalise(pathname);
  if (AUTH_PAGES.has(p)) return "auth";
  if (PUBLIC_PATHS.has(p) || PUBLIC_PREFIXES.some((prefix) => p.startsWith(prefix))) return "public";
  return "protected";
}

/**
 * Return a same-origin relative path ("/a/b?c#d") or the fallback. Rejects absolute
 * URLs, protocol-relative ("//host"), backslash tricks, control characters and
 * auth pages (to avoid redirect loops).
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function safeNextPath(value, fallback = "/") {
  if (typeof value !== "string" || value === "" || value.length > MAX_NEXT_LENGTH) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  let url;
  try {
    url = new URL(value, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  if (AUTH_PAGES.has(normalise(url.pathname))) return fallback;
  return url.pathname + url.search + url.hash;
}

/**
 * Build the login URL for a signed-out request, preserving where the user was going.
 * @param {string} pathname
 * @param {string} [search]
 */
export function loginRedirectFor(pathname, search = "") {
  const target = safeNextPath(pathname + search, "");
  if (!target || target === "/") return LOGIN_PATH;
  return `${LOGIN_PATH}?next=${encodeURIComponent(target)}`;
}

/**
 * Decide what the proxy does for a request.
 * @param {{ pathname: string, search?: string, authed: boolean }} input
 * @returns {AuthDecision}
 */
export function decideAuth({ pathname, search = "", authed }) {
  const kind = classifyPath(pathname);
  if (kind === "public") return { type: "next" };
  if (kind === "auth") return authed ? { type: "redirect", location: "/" } : { type: "next" };
  return authed ? { type: "next" } : { type: "redirect", location: loginRedirectFor(pathname, search) };
}

/**
 * Map a `?error=` code on /login to a message (unknown codes show nothing).
 * @param {string | null | undefined} code
 */
export function loginErrorMessage(code) {
  return code === "confirm_failed" ? MESSAGES.confirmFailed : null;
}

/** Email OTP types accepted by /auth/confirm (Supabase EmailOtpType). */
export const EMAIL_OTP_TYPES = Object.freeze(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

/**
 * @param {unknown} value
 * @returns {value is "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email"}
 */
export function isEmailOtpType(value) {
  return typeof value === "string" && EMAIL_OTP_TYPES.includes(value);
}

/**
 * Server-side form validation. Returns an error message or null.
 * @param {unknown} email
 * @param {unknown} password
 * @returns {string | null}
 */
export function validateCredentials(email, password) {
  if (typeof email !== "string" || email.trim() === "") return MESSAGES.missingFields;
  if (typeof password !== "string" || password === "") return MESSAGES.missingFields;
  return null;
}

/**
 * Map a Supabase AuthError code (and HTTP status) to a user-facing message.
 * Sign-in never reveals whether an account exists.
 * @param {string | undefined | null} code
 * @param {AuthFlow} flow
 * @param {number} [status]
 * @returns {string}
 */
export function authErrorMessage(code, flow, status) {
  switch (code) {
    case "invalid_credentials":
    case "user_not_found":
      return flow === "signin" ? MESSAGES.invalidCredentials : MESSAGES.signupFailed;
    case "email_not_confirmed":
      return MESSAGES.emailNotConfirmed;
    case "weak_password":
      return MESSAGES.weakPassword;
    case "email_address_invalid":
    case "validation_failed":
      return flow === "signin" ? MESSAGES.invalidCredentials : MESSAGES.invalidEmail;
    case "user_already_exists":
    case "email_exists":
      return MESSAGES.signupFailed;
    case "signup_disabled":
    case "email_provider_disabled":
      return MESSAGES.signupDisabled;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return MESSAGES.rateLimited;
    case "not_configured":
      return MESSAGES.notConfigured;
    default:
      if (status === 429) return MESSAGES.rateLimited;
      return MESSAGES.generic;
  }
}

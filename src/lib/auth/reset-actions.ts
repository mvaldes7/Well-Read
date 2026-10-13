"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  RESET_MESSAGES,
  forgotOutcome,
  isRecoverySession,
  passwordErrorMessage,
  resetRedirectTo,
  resolveSiteOrigin,
  validateEmail,
  validateNewPassword,
} from "./reset.mjs";

export interface ForgotState {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
}

export interface PasswordFormState {
  status: "idle" | "saved" | "error";
  message?: string;
  fieldErrors?: { current?: string; password?: string; confirm?: string };
}

/** Minimum time a reset request takes, so a fast "unknown email" reply looks like a real send. */
const FORGOT_MIN_MS = 1200;
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

// Passwords and emails are never logged or echoed back (only the email refills its field).

export async function requestPasswordReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = str(formData.get("email")).trim();
  if (validateEmail(email)) return { ...forgotOutcome({ invalidEmail: true }), email };
  const supabase = await createClient();
  if (!supabase) return { ...forgotOutcome({ notConfigured: true }), email };

  // redirectTo comes from a trusted origin: the request's origin only if it's on the allowlist
  // (production, this Vercel deployment, localhost off-Vercel), else the production URL.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = resolveSiteOrigin(host ? `${proto}://${host}` : null, process.env);

  const started = Date.now();
  // Every Supabase result, including rate limits and errors, gets the same neutral reply.
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: resetRedirectTo(origin) }).catch(() => undefined);
  const wait = FORGOT_MIN_MS - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return forgotOutcome();
}

export async function resetPassword(_prev: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: RESET_MESSAGES.notConfigured };
  // Re-check on the server: only a fresh email-link (recovery) session may set a password here.
  const { data, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !isRecoverySession(data?.claims)) return { status: "error", message: RESET_MESSAGES.linkInvalid };

  const invalid = validateNewPassword(formData.get("password"), formData.get("confirm"));
  if (invalid) return { status: "error", fieldErrors: invalid };

  const { error } = await supabase.auth.updateUser({ password: str(formData.get("password")) });
  if (error) return { status: "error", message: passwordErrorMessage(error.code, error.status) };
  redirect("/?notice=password_updated");
}

export async function changePassword(_prev: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const current = str(formData.get("current"));
  if (!current) return { status: "error", fieldErrors: { current: RESET_MESSAGES.currentRequired } };
  const invalid = validateNewPassword(formData.get("password"), formData.get("confirm"));
  if (invalid) return { status: "error", fieldErrors: invalid };

  const env = getSupabaseEnv();
  const supabase = await createClient();
  if (!env || !supabase) return { status: "error", message: RESET_MESSAGES.notConfigured };
  const { data, error: claimsError } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  if (claimsError || !data?.claims?.sub || typeof email !== "string" || !email) {
    return { status: "error", message: RESET_MESSAGES.sessionEnded };
  }

  // Re-check the current password on a throwaway client that keeps nothing (no cookies, memory
  // only), so the user's own session isn't replaced. It does create a short extra session at
  // Supabase, which we end right away (scope "local" = that session only, never "global").
  const verifier = createPlainClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const check = await verifier.auth.signInWithPassword({ email, password: current });
  if (check.error) {
    const code = check.error.code === "invalid_credentials" ? "current_password_mismatch" : check.error.code;
    return { status: "error", fieldErrors: code === "current_password_mismatch" ? { current: RESET_MESSAGES.currentWrong } : undefined, message: code === "current_password_mismatch" ? undefined : passwordErrorMessage(code, check.error.status) };
  }
  await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);

  // current_password is also sent so Supabase enforces it if "require current password" is on.
  // Supabase signs out every other session of this user after a password change.
  const { error } = await supabase.auth.updateUser({ password: str(formData.get("password")), current_password: current });
  if (error) {
    const message = passwordErrorMessage(error.code, error.status);
    return message === RESET_MESSAGES.currentWrong
      ? { status: "error", fieldErrors: { current: message } }
      : { status: "error", message };
  }
  return { status: "saved", message: RESET_MESSAGES.changed };
}

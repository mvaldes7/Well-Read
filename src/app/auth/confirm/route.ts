import { NextResponse, type NextRequest } from "next/server";
import { isEmailOtpType, safeNextPath } from "@/lib/auth/logic.mjs";
import { RESET_PATH } from "@/lib/auth/reset.mjs";
import { createClient } from "@/lib/supabase/server";

// Email links land here (Supabase SSR email-auth guide). Two formats:
// - Token hash: /auth/confirm?token_hash=...&type=...&next=... -> verifyOtp. Needs a custom
//   email template, e.g. Confirm signup:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
//   Reset password (TSK-018):
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset
// - PKCE code: the default {{ .ConfirmationURL }} template sends the user via Supabase back to
//   our redirectTo with ?code=... -> exchangeCodeForSession (needs the code-verifier cookie set
//   when the request was made, so it works only in the same browser).
// Templates are dashboard settings that need Mike's approval; none are changed here.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const isReset = type === "recovery" || next === RESET_PATH;

  const supabase = tokenHash || code ? await createClient() : null;
  if (supabase && tokenHash && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(type === "recovery" ? RESET_PATH : next, request.url));
  } else if (supabase && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  // Includes Supabase's own error redirect (?error=access_denied&error_code=otp_expired).
  const failure = isReset ? `${RESET_PATH}?error=invalid_link` : "/login?error=confirm_failed";
  return NextResponse.redirect(new URL(failure, request.url));
}

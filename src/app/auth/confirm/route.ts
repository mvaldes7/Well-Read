import { NextResponse, type NextRequest } from "next/server";
import { isEmailOtpType, safeNextPath } from "@/lib/auth/logic.mjs";
import { createClient } from "@/lib/supabase/server";

// Email confirmation (token-hash flow) per Supabase's SSR email-auth guide.
// Requires the Supabase "Confirm signup" email template to link to
// {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
// That's a dashboard setting and needs Mike's approval; it isn't changed here.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && isEmailOtpType(type)) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) return NextResponse.redirect(new URL(next, request.url));
    }
  }
  return NextResponse.redirect(new URL("/login?error=confirm_failed", request.url));
}

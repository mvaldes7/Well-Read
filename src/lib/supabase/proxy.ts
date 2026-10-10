import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

export interface SessionResult {
  /** Response carrying any refreshed auth cookies and cache headers. */
  response: NextResponse;
  /** True only when getClaims() verified the access token. */
  authed: boolean;
}

/**
 * Refresh the Supabase session (per Supabase's Next.js SSR guide) and report
 * whether the user is signed in. Fails safe: missing env or any error means
 * "signed out", never a crash.
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request });
  const env = getSupabaseEnv();
  if (!env) return { response, authed: false };

  try {
    const supabase = createServerClient(env.url, env.publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    });
    // Don't put code between createServerClient and getClaims(); it refreshes the token.
    const { data, error } = await supabase.auth.getClaims();
    return { response, authed: !error && typeof data?.claims?.sub === "string" };
  } catch {
    return { response, authed: false };
  }
}

/** Copy refreshed auth cookies and cache headers onto a different response. */
export function withSessionCookies<T extends NextResponse>(target: T, source: NextResponse): T {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = source.headers.get(header);
    if (value) target.headers.set(header, value);
  }
  return target;
}

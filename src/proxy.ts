import { NextResponse, type NextRequest } from "next/server";
import { getDiscipline, getLesson, getTopic } from "@/content";
import { decideAuth } from "@/lib/auth/logic.mjs";
import { updateSession, withSessionCookies } from "@/lib/supabase/proxy";

// Order of checks:
// 1. Refresh the Supabase session and verify it with getClaims().
// 2. Auth redirect: signed-out users on any protected path (including unknown
//    /d/... slugs) go to /login; signed-in users on /login or /signup go to /.
//    Signed-out users get no hint about which content URLs exist.
// 3. Slug check (signed-in only): unknown /d/... content returns a real 404.
//    With cacheComponents, notFound() inside a streamed page keeps a 200 status,
//    so the check has to happen here, before rendering.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null; // malformed percent-encoding
  }
}

function contentExists(pathname: string): boolean {
  const segments = pathname.split("/").slice(2).filter(Boolean).map(decode);
  if (!segments.every((s): s is string => s !== null)) return false;
  const [d, t, l] = segments;
  switch (segments.length) {
    case 1:
      return getDiscipline(d) !== undefined;
    case 2:
      return getTopic(d, t) !== undefined;
    case 3:
      return getLesson(d, t, l) !== undefined;
    default:
      return false;
  }
}

export async function proxy(request: NextRequest) {
  const { response, authed } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const decision = decideAuth({ pathname, search, authed });
  if (decision.type === "redirect") {
    return withSessionCookies(NextResponse.redirect(new URL(decision.location, request.url)), response);
  }

  if ((pathname === "/d" || pathname.startsWith("/d/")) && !contentExists(pathname)) {
    // No route matches this internal path, so Next renders the not-found page with a 404.
    return withSessionCookies(NextResponse.rewrite(new URL("/__not-found", request.url)), response);
  }

  return response;
}

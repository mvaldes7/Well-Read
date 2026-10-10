import { NextResponse, type NextRequest } from "next/server";
import { getDiscipline, getLesson, getTopic } from "@/content";

// With cacheComponents, pages for params not returned by generateStaticParams
// stream from a prerendered shell, so a notFound() inside the page arrives after
// a 200 status (a "soft 404"). Checking the slugs here, before rendering, lets
// unknown content URLs return a real 404 (see Next 16 docs: notFound + Proxy).
export const config = {
  matcher: "/d/:path*",
};

function exists(segments: string[]): boolean {
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

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null; // malformed percent-encoding
  }
}

export function proxy(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").slice(2).filter(Boolean).map(decode);
  const valid = segments.every((s): s is string => s !== null);
  if (segments.length === 0 || (valid && exists(segments as string[]))) return NextResponse.next();
  // No route matches this internal path, so Next renders the app's not-found page with status 404.
  return NextResponse.rewrite(new URL("/__not-found", request.url));
}

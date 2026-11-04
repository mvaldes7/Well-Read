// POST /api/drilldowns/review: Mike's publish / reject / clear-report actions (P4). Behind WELL_READ_DRILLDOWNS (404).
// Same-origin only; the owner is checked inside the DB (drilldown_review_action, draft migration 20261104214500)
// against the verified session's user id. Non-owners get 404.
import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { drilldownsEnabled } from "@/lib/drilldowns/config.mjs";
import { isSameOriginRequest } from "@/lib/drilldowns/messages.mjs";
import { handleReviewAction } from "@/lib/drilldowns/review.mjs";
import { drilldownDbConfigured, reviewAction } from "@/lib/drilldowns/server-db.mjs";

const reply = (r: { status: number; body: unknown }) => NextResponse.json(r.body, { status: r.status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  const enabled = drilldownsEnabled(process.env);
  if (!enabled) return reply({ status: 404, body: { ok: false, code: "not_found" } });
  let body: unknown = null;
  try { body = await request.json(); } catch { /* handled as bad_request */ }
  const supabase = await createClient();
  try {
    const result = await handleReviewAction({
      enabled,
      sameOrigin: isSameOriginRequest(request.headers, request.url),
      configured: drilldownDbConfigured() && Boolean(supabase),
      body,
      getUserId: async () => {
        if (!supabase) return null;
        const { data, error } = await supabase.auth.getClaims();
        const sub = data?.claims?.sub;
        return !error && typeof sub === "string" && sub ? sub : null;
      },
      db: { reviewAction },
      log: (m) => console.info(m),
    });
    return reply(result);
  } catch (e) {
    console.error(`drilldown review route failed (${e instanceof Error ? e.name : "unknown"})`);
    return reply({ status: 503, body: { ok: false, code: "unavailable" } });
  }
}

// POST /api/drilldowns: generate one Dig deeper lesson (P3). Behind WELL_READ_DRILLDOWNS (404 unless exactly "1").
// The body is exactly { lessonId, choiceId }; user_id comes ONLY from the verified session (getClaims).
// Server-only deps: GEMINI_API_KEY (Gemini, header only) and DRILLDOWN_DB_URL (drilldown_server, via server-db.mjs).
import "server-only";
import { NextResponse } from "next/server";
import { disciplines } from "@/content";
import { createClient } from "@/lib/supabase/server";
import { drilldownsEnabled } from "@/lib/drilldowns/config.mjs";
import { failure, isSameOriginRequest } from "@/lib/drilldowns/messages.mjs";
import { PROMPT_VERSION, runGeneration } from "@/lib/drilldowns/generate.mjs";
import { createMinuteLimiter, handleDigDeeper } from "@/lib/drilldowns/service.mjs";
import { drilldownDbConfigured, reserve, saveFactCheck, saveLesson } from "@/lib/drilldowns/server-db.mjs";

const limiter = createMinuteLimiter();

const reply = (r: { status: number; body: unknown }) => NextResponse.json(r.body, { status: r.status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  const enabled = drilldownsEnabled(process.env);
  if (!enabled) return reply(failure("disabled"));
  // Same-origin only (route handlers have no built-in CSRF check, unlike server actions).
  if (!isSameOriginRequest(request.headers, request.url)) return reply(failure("forbidden"));
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !drilldownDbConfigured()) return reply(failure("unavailable"));
  let body: unknown;
  try { body = await request.json(); } catch { return reply(failure("bad_request")); }
  const supabase = await createClient();
  if (!supabase) return reply(failure("unavailable"));
  try {
    const result = await handleDigDeeper({
      enabled,
      body,
      disciplines,
      promptVersion: PROMPT_VERSION,
      limiter,
      getUserId: async () => {
        const { data, error } = await supabase.auth.getClaims();
        const sub = data?.claims?.sub;
        return !error && typeof sub === "string" && sub ? sub : null;
      },
      getCompletionRows: async (lessonId) => {
        const { data, error } = await supabase.from("lesson_completions").select("lesson_id").eq("lesson_id", lessonId);
        return error || !data ? [] : data;
      },
      db: { reserve, saveLesson, saveFactCheck },
      generate: ({ lessonId, choiceId, onBeforeCall }) => runGeneration({ disciplines, lessonId, choiceId, apiKey, onBeforeCall }),
      log: (m) => console.info(m),
    });
    return reply(result);
  } catch (e) {
    console.error(`drilldown route failed (${e instanceof Error ? e.name : "unknown"})`);
    return reply(failure("unavailable"));
  }
}

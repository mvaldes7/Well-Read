// SERVER-ONLY. The single module allowed to read DRILLDOWN_DB_URL (a Postgres URL for the narrow
// `drilldown_server` role, see supabase/migrations/20261102231600_drilldowns.sql). Never import it from a client
// component; never rename the env var with a NEXT_PUBLIC_ prefix. The repo does not use the `server-only`
// package, so this guards at runtime instead, and tests/unit/client-bundle.test.mjs scans .next/static.
//
// P3 STUB: nothing calls this yet and the feature flag (WELL_READ_DRILLDOWNS, config.mjs) stays off. The P3 server
// action must, in this order:
//   1. verify the session server-side (supabase.auth.getClaims(), or getUser()); user_id = claims.sub ONLY,
//      never from the request body;
//   2. reserve: select public.drilldown_reserve(user_id, calls, true)   (WR403 = email not verified, WR429 = cap);
//   3. fetch sources and call Gemini server-side (GEMINI_API_KEY, also server-only);
//   4. write: select public.drilldown_save_lesson(user_id, ...)       (pending / flagged / rejected only);
//   5. grade later via public.drilldown_quiz_key(user_id, lesson_id).
// Users read lessons with their own session (RLS + column grants), never through this connection.

export const DRILLDOWN_DB_ENV = "DRILLDOWN_DB_URL";

/** @param {Record<string, string | undefined>} env */
export function drilldownDbUrl(env) {
  if (typeof window !== "undefined") throw new Error("server-db is server-only");
  const url = env[DRILLDOWN_DB_ENV];
  if (!url) throw new Error(`${DRILLDOWN_DB_ENV} is not set`);
  return url;
}

/** P3 stub: refuses until the generation server action is implemented and approved. */
export async function reserveAndSave() {
  throw new Error("drill-down generation is not implemented (P3)");
}

// SERVER-ONLY. The single module allowed to read DRILLDOWN_DB_URL (a Postgres URL for the narrow
// `drilldown_server` role, see supabase/migrations/20261102231600_drilldowns.sql). Never import it from a client
// component (`import "server-only"` makes that a build error); never rename the env var with a NEXT_PUBLIC_ prefix.
// Second layer: CI's `pnpm check:bundle` scans .next/static.
//
// drilldown_server has no table privileges: it can only call drilldown_reserve(), drilldown_save_lesson() and
// drilldown_quiz_key(). user_id always comes from the caller's verified session (route.ts -> service.mjs), never from
// the request. Users read lessons with their own session (RLS + column grants), never through this connection.
// Connection: max 1 per server instance (the role's connection limit is 5), prepare: false so Supavisor transaction
// mode (port 6543) works too.

import "server-only";
import postgres from "postgres";

export const DRILLDOWN_DB_ENV = "DRILLDOWN_DB_URL";

/** @param {Record<string, string | undefined>} env */
export function drilldownDbUrl(env) {
  if (typeof window !== "undefined") throw new Error("server-db is server-only");
  const url = env[DRILLDOWN_DB_ENV];
  if (!url) throw new Error(`${DRILLDOWN_DB_ENV} is not set`);
  return url;
}

/** @type {import("postgres").Sql | null} */
let sql = null;
function db() {
  if (!sql) sql = postgres(drilldownDbUrl(process.env), { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: "require" });
  return sql;
}

/** True when the server-only DB URL is configured (does not connect). */
export function drilldownDbConfigured() {
  return Boolean(process.env[DRILLDOWN_DB_ENV]);
}

/**
 * Bind the two SECURITY DEFINER calls to a postgres.js client. jsonb parameters go through sql.json(): binding
 * JSON.stringify(v) as ::jsonb double-encodes it (Postgres gets a jsonb *string*, the check constraints fail, REV-016).
 * Exported for the test:db Node test, which passes a client connected as drilldown_server to the throwaway cluster.
 * @param {import("postgres").Sql} s
 */
export function drilldownDbFor(s) {
  /** @param {unknown} v */
  const j = (v) => s.json(/** @type {any} */ (v));
  return {
    /** @param {string} userId @param {number} calls @param {boolean} newLesson */
    async reserve(userId, calls, newLesson) {
      await s`select public.drilldown_reserve(${userId}::uuid, ${calls}::integer, ${newLesson}::boolean)`;
    },
    /**
     * @param {{ userId: string, id: string, parentLessonId: string, choiceId: string, promptVersion: string, model: string,
     *   reviewStatus: "pending" | "flagged" | "rejected", lesson: unknown, sources: unknown, citations: unknown,
     *   unconfirmedClaims: unknown, answers: unknown, explanations: unknown }} p
     */
    async saveLesson(p) {
      await s`select public.drilldown_save_lesson(${p.userId}::uuid, ${p.id}, ${p.parentLessonId}, ${p.choiceId}, ${p.promptVersion},
        ${p.model}, ${p.reviewStatus}, ${j(p.lesson)}, ${j(p.sources)}, ${j(p.citations)},
        ${j(p.unconfirmedClaims)}, ${j(p.answers)}, ${j(p.explanations)})`;
    },
  };
}

/** @param {string} userId @param {number} calls @param {boolean} newLesson */
export const reserve = (userId, calls, newLesson) => drilldownDbFor(db()).reserve(userId, calls, newLesson);

/** @param {Parameters<ReturnType<typeof drilldownDbFor>["saveLesson"]>[0]} p */
export const saveLesson = (p) => drilldownDbFor(db()).saveLesson(p);

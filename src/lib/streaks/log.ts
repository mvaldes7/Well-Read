import { unstable_rethrow } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertActivity } from "./streaks.mjs";

export type ActivityKind = "lesson_passed" | "quiz_attempt";

/**
 * Append one activity row with the user's own session (RLS: insert own rows only; no service
 * role). Never throws and never affects the caller; see insertActivity for the outcomes.
 */
export function logActivity(supabase: SupabaseClient, userId: string, kind: ActivityKind, ref: string) {
  return insertActivity(supabase, userId, kind, ref, unstable_rethrow);
}

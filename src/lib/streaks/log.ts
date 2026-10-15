import { unstable_rethrow } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertActivity } from "./streaks.mjs";

// The app only ever logs quiz attempts (TSK-020). Every pass is a quiz submission, so it is
// already a streak day; a separate "lesson_passed" row would add nothing. The table's check
// still allows 'lesson_passed' for the rows the TSK-016 backfill wrote, and the streak reader
// counts every row regardless of kind.
export type ActivityKind = "quiz_attempt";

/**
 * Append one activity row with the user's own session (RLS: insert own rows only; no service
 * role). Never throws and never affects the caller; see insertActivity for the outcomes.
 */
export function logActivity(supabase: SupabaseClient, userId: string, kind: ActivityKind, ref: string) {
  return insertActivity(supabase, userId, kind, ref, unstable_rethrow);
}

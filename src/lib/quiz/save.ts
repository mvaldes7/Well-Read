import { unstable_rethrow } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { improvementCondition, type Attempt } from "./logic.mjs";

export type SaveOutcome = "saved" | "kept" | "failed";

const TABLE = "lesson_completions";

/**
 * Store the best attempt for (user, lesson) with the user's own session (RLS applies).
 *
 * Race safety:
 * 1. INSERT ... ON CONFLICT DO NOTHING creates the first row atomically.
 * 2. Otherwise a single conditional UPDATE only matches when the stored row is
 *    worse (see improvementCondition), so Postgres re-checks the condition under
 *    the row lock and concurrent submissions can't downgrade a passed row or
 *    lower a score. The only remaining race: two concurrent improvements both
 *    match, and the later write wins even if its score is the lower of the two.
 *    Both are still improvements over the earlier stored row.
 */
export async function saveBestAttempt(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
  attempt: Attempt,
): Promise<SaveOutcome> {
  try {
    const row = { user_id: userId, lesson_id: lessonId, ...attempt };
    const inserted = await supabase
      .from(TABLE)
      .upsert(row, { onConflict: "user_id,lesson_id", ignoreDuplicates: true })
      .select("lesson_id");
    if (inserted.error) return logFailure(inserted.error.code);
    if (inserted.data.length > 0) return "saved";

    const cond = improvementCondition(attempt);
    let update = supabase
      .from(TABLE)
      .update({ ...attempt, completed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("lesson_id", lessonId);
    update = cond.onlyIfNotPassed
      ? update.eq("passed", false).lt("score", cond.scoreBelow)
      : update.or(`passed.eq.false,score.lt.${cond.scoreBelow}`);
    const updated = await update.select("lesson_id");
    if (updated.error) return logFailure(updated.error.code);
    return updated.data.length > 0 ? "saved" : "kept";
  } catch (err) {
    unstable_rethrow(err); // never swallow Next's internal control flow
    return logFailure("exception");
  }
}

function logFailure(code: string | undefined): SaveOutcome {
  // Error code only: no user data, answers or messages.
  console.error(`lesson_completions save failed (${code ?? "unknown"})`);
  return "failed";
}

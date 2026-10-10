import { unstable_rethrow } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertRow, isMissingColumnError, updateSteps, type Attempt, type UpdateStep } from "./logic.mjs";

export type SaveOutcome = "saved" | "kept" | "failed";

const TABLE = "lesson_completions";

type DbError = { code?: string | null; message?: string | null } | null;

/**
 * Store the best attempt for (user, lesson) with the user's own session (RLS applies).
 *
 * Race safety:
 * 1. INSERT ... ON CONFLICT DO NOTHING creates the first row atomically (with
 *    first_passed_at when the first attempt passes).
 * 2. Otherwise conditional UPDATEs (see updateSteps) only match when the stored row is
 *    worse, so Postgres re-checks the condition under the row lock and concurrent
 *    submissions can't downgrade a passed row or lower a score. first_passed_at is only
 *    written by the step that matches a NOT-passed row, so it is set exactly once and
 *    never overwritten, even if two passing attempts race (the second sees passed = true).
 *    Remaining race, unchanged from before: two concurrent improvements both match, and
 *    the later write wins even if its score is the lower of the two; both are still
 *    improvements over the earlier stored row.
 *
 * first_passed_at uses the app server's clock (PostgREST can't send now()); completed_at on
 * insert uses the database default. They can differ by clock skew (normally milliseconds).
 *
 * Until the first_passed_at migration is applied, any write that mentions the column fails
 * with 42703/PGRST204; the write is retried once without it, and later steps skip it too.
 */
export async function saveBestAttempt(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
  attempt: Attempt,
): Promise<SaveOutcome> {
  try {
    const now = new Date().toISOString();
    let withFirstPass = true;

    // Run a write; if it failed only because first_passed_at doesn't exist yet, retry without it.
    async function write<T extends { error: DbError }>(run: (withCol: boolean) => PromiseLike<T>): Promise<T> {
      const res = await run(withFirstPass);
      if (withFirstPass && isMissingColumnError(res.error)) {
        withFirstPass = false;
        return run(false);
      }
      return res;
    }

    const inserted = await write((withCol) =>
      supabase
        .from(TABLE)
        .upsert(insertRow(userId, lessonId, attempt, now, withCol), { onConflict: "user_id,lesson_id", ignoreDuplicates: true })
        .select("lesson_id"),
    );
    if (inserted.error) return logFailure(inserted.error.code);
    if (inserted.data && inserted.data.length > 0) return "saved";

    const stepCount = updateSteps(attempt, now, true).length;
    for (let i = 0; i < stepCount; i++) {
      const updated = await write((withCol) => runStep(supabase, userId, lessonId, updateSteps(attempt, now, withCol)[i]));
      if (updated.error) return logFailure(updated.error.code);
      if (updated.data && updated.data.length > 0) return "saved";
    }
    return "kept";
  } catch (err) {
    unstable_rethrow(err); // never swallow Next's internal control flow
    return logFailure("exception");
  }
}

function runStep(supabase: SupabaseClient, userId: string, lessonId: string, step: UpdateStep) {
  let q = supabase.from(TABLE).update(step.patch).eq("user_id", userId).eq("lesson_id", lessonId);
  if (step.match.passed !== undefined) q = q.eq("passed", step.match.passed);
  if (step.match.scoreBelow !== undefined) q = q.lt("score", step.match.scoreBelow);
  return q.select("lesson_id");
}

function logFailure(code: string | null | undefined): SaveOutcome {
  // Error code only: no user data, answers or messages.
  console.error(`lesson_completions save failed (${code ?? "unknown"})`);
  return "failed";
}

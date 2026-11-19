import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { digQuizAvailability, unconfirmedQuizRefs } from "./dig-quiz.mjs";
import { drilldownDbConfigured, quizKey } from "./server-db.mjs";

/** Columns the quiz needs from generated_lessons (column-level grant; never select *). */
export const DIG_QUIZ_LESSON_COLUMNS = "id, parent_lesson_id, review_status, lesson";

export interface DigQuizLessonRow {
  id: string;
  parent_lesson_id: string;
  review_status: string;
  lesson: { title?: string; sections?: unknown; keyFacts?: unknown; quiz?: unknown };
}

export type DigQuizContext =
  | { status: "ok"; quiz: { question: string; options: string[]; answerIndex: number; explanation: string }[] }
  | { status: "locked" | "no_quiz" | "unavailable" };

/**
 * Decide whether this user may take this Dig deeper quiz, and load the key for grading.
 * - Parent check: the user's own lesson_completions row for the parent lesson (RLS: own rows). Any submitted attempt
 *   unlocks, the same rule as Dig deeper itself. Checked before the key is read.
 * - Key: drilldown_quiz_key() through the drilldown_server connection, only for a lesson this user may see.
 * - Flagged lessons: the user's own unconfirmed claims via drilldown_my_lessons(); a quiz item there hides the quiz.
 * The key never leaves the server; callers send only question text and options to the client.
 */
export async function loadDigQuiz(supabase: SupabaseClient, userId: string, row: DigQuizLessonRow): Promise<DigQuizContext> {
  const { data: parent, error: parentError } = await supabase
    .from("lesson_completions")
    .select("lesson_id")
    .eq("user_id", userId)
    .eq("lesson_id", row.parent_lesson_id)
    .maybeSingle();
  if (parentError) {
    console.error(`dig quiz: parent completion read failed (${parentError.code ?? "unknown"})`);
    return { status: "unavailable" };
  }
  if (!parent) return { status: "locked" };
  if (!drilldownDbConfigured()) return { status: "unavailable" };
  let key: { answers: unknown; explanations: unknown } | null;
  try {
    key = await quizKey(userId, row.id);
  } catch {
    console.error("dig quiz: key read failed");
    return { status: "unavailable" };
  }
  let refs: string[] = [];
  if (row.review_status === "flagged") {
    const { data, error } = await supabase.rpc("drilldown_my_lessons");
    if (error) return { status: "no_quiz" }; // fail closed: an unreviewed quiz item may be wrong
    const mine = Array.isArray(data) ? data.find((r: { id?: unknown }) => r?.id === row.id) : null;
    refs = unconfirmedQuizRefs(mine?.unconfirmed_claims);
  }
  const r = digQuizAvailability({ lesson: row.lesson, reviewStatus: row.review_status, parentCompleted: true, key, unconfirmedQuizRefs: refs });
  return r.status === "ok" ? { status: "ok", quiz: r.quiz } : { status: r.status };
}

/** The user's stored best Dig deeper attempt, or null (none yet, or the read failed). */
export async function getDigBest(supabase: SupabaseClient, userId: string, lessonId: string) {
  const { data, error } = await supabase
    .from("generated_lesson_completions")
    .select("score, total, passed")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (error || !data) return null;
  return data as { score: number; total: number; passed: boolean };
}

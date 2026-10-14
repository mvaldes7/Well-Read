"use server";

import { getLessonById } from "@/content";
import { createClient } from "@/lib/supabase/server";
import { QUIZ_ERRORS, gradeSubmission, type QuestionResult } from "./logic.mjs";
import { saveBestAttempt, type SaveOutcome } from "./save";
import { logActivity } from "@/lib/streaks/log";

export type QuizState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | {
      status: "graded";
      score: number;
      total: number;
      passed: boolean;
      questions: QuestionResult[];
      save: SaveOutcome;
    };

/**
 * Grade a quiz on the server. The payload may only influence which lesson and
 * which answers; score/total/passed are always computed here.
 */
export async function submitQuiz(_prev: QuizState, payload: unknown): Promise<QuizState> {
  const supabase = await createClient();
  if (!supabase) return { status: "error", error: QUIZ_ERRORS.notConfigured };

  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string" || !userId) return { status: "error", error: QUIZ_ERRORS.signedOut };

  const graded = gradeSubmission(payload, (id) => getLessonById(id)?.lesson.quiz);
  if (!graded.ok) return { status: "error", error: graded.error };

  const { lessonId, score, total, passed, questions } = graded.value;
  const save = await saveBestAttempt(supabase, userId, lessonId, { score, total, passed });
  // Streak activity (TSK-016): one quiz_attempt per graded submission. Never throws and its
  // outcome is ignored, so a missing table or failed insert can't affect the quiz result.
  await logActivity(supabase, userId, "quiz_attempt", lessonId);
  return { status: "graded", score, total, passed, questions, save };
}

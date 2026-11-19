"use server";

import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { QuestionResult } from "@/lib/quiz/logic.mjs";
import { saveBestAttempt, type SaveOutcome } from "@/lib/quiz/save";
import { drilldownsEnabled } from "./config.mjs";
import { DIG_QUIZ_ERRORS, createSubmitLimiter, gradeDigQuiz, parseDigSubmission } from "./dig-quiz.mjs";
import { DIG_QUIZ_LESSON_COLUMNS, loadDigQuiz, type DigQuizLessonRow } from "./quiz-data";

export type DigQuizState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "graded"; score: number; total: number; passed: boolean; questions: QuestionResult[]; save: SaveOutcome };

const limiter = createSubmitLimiter();

/**
 * Grade a Dig deeper quiz on the server (docs/plans/dig-deeper-quizzes.md, section b). The payload may only choose
 * the lesson and the answers; score, total and passed are computed here against the server-side key. The parent
 * lesson's quiz must have been submitted first (section d). The best attempt goes to generated_lesson_completions
 * with the user's own session (RLS). Not counted toward mastery or achievements; streak credit comes in a later step.
 */
export async function submitDigQuiz(_prev: DigQuizState, payload: unknown): Promise<DigQuizState> {
  if (!drilldownsEnabled(process.env)) return { status: "error", error: DIG_QUIZ_ERRORS.disabled };
  const parsed = parseDigSubmission(payload);
  if (!parsed.ok) return { status: "error", error: parsed.error };
  try {
    const supabase = await createClient();
    if (!supabase) return { status: "error", error: DIG_QUIZ_ERRORS.unavailable };
    const { data, error } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (error || typeof userId !== "string" || !userId) return { status: "error", error: DIG_QUIZ_ERRORS.signedOut };
    if (!limiter.allow(userId)) return { status: "error", error: DIG_QUIZ_ERRORS.rateLimited };

    const { lessonId, answers } = parsed.value;
    const { data: row, error: rowError } = await supabase.from("generated_lessons").select(DIG_QUIZ_LESSON_COLUMNS).eq("id", lessonId).maybeSingle();
    if (rowError) return { status: "error", error: DIG_QUIZ_ERRORS.unavailable };
    if (!row) return { status: "error", error: DIG_QUIZ_ERRORS.notFound };

    const ctx = await loadDigQuiz(supabase, userId, row as unknown as DigQuizLessonRow);
    if (ctx.status === "locked") return { status: "error", error: DIG_QUIZ_ERRORS.locked };
    if (ctx.status === "no_quiz") return { status: "error", error: DIG_QUIZ_ERRORS.noQuiz };
    if (ctx.status !== "ok") return { status: "error", error: DIG_QUIZ_ERRORS.unavailable };

    const graded = gradeDigQuiz(ctx.quiz, answers);
    if (!graded.ok) return { status: "error", error: graded.error };
    const { score, total, passed, questions } = graded.value;
    const save = await saveBestAttempt(supabase, userId, lessonId, { score, total, passed }, "generated_lesson_completions");
    return { status: "graded", score, total, passed, questions, save };
  } catch (err) {
    unstable_rethrow(err);
    console.error("dig quiz: submit failed (exception)");
    return { status: "error", error: DIG_QUIZ_ERRORS.unavailable };
  }
}

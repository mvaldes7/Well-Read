import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { disciplines } from "@/content";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/quiz/logic.mjs";
import { buildBookshelf, completionLookup, progressColumns, type BookshelfGroup, type Completion } from "./logic.mjs";

export type ProgressResult =
  | { status: "ok"; rows: unknown[]; lookup: Map<string, Completion>; groups: BookshelfGroup[] }
  | { status: "signedOut" }
  | { status: "error" };

/**
 * The signed-in user's completions, read with their cookie-based session (RLS).
 * Re-checks auth with getClaims(). Never throws: failures become { status: "error" }.
 * Cached per request so several components on one page share one query.
 */
export const getMyProgress = cache(async (): Promise<ProgressResult> => {
  try {
    const supabase = await createClient();
    if (!supabase) return { status: "error" };
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (claimsError || typeof userId !== "string" || !userId) return { status: "signedOut" };

    const read = (withFirstPass: boolean) =>
      supabase.from("lesson_completions").select(progressColumns(withFirstPass)).eq("user_id", userId);
    let { data, error } = await read(true);
    // Until the first_passed_at migration is applied the column doesn't exist: read without it.
    if (error && isMissingColumnError(error)) ({ data, error } = await read(false));
    if (error) {
      console.error(`lesson_completions read failed (${error.code ?? "unknown"})`);
      return { status: "error" };
    }
    const rows: unknown[] = data ?? [];
    return { status: "ok", rows, lookup: completionLookup(rows, disciplines), groups: buildBookshelf(rows, disciplines) };
  } catch (err) {
    // Let Next's internal control flow through (prerender aborts from cookies()/connection(),
    // redirects): swallowing them would bake an error state into the prerendered stage.
    unstable_rethrow(err);
    console.error("lesson_completions read failed (exception)");
    return { status: "error" };
  }
});

export const PROGRESS_ERROR = "Your progress couldn't be loaded right now. Please try again later.";

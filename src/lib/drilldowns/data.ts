import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/errors.mjs";

/** Columns authenticated may read (column-level grant; never created_by / unconfirmed_claims, never select *). */
export const GENERATED_LESSON_COLUMNS = "id, parent_lesson_id, choice_id, review_status, lesson, sources, created_at, published_at";

export interface GeneratedLessonRow {
  id: string;
  parent_lesson_id: string;
  choice_id: string;
  review_status: "pending" | "flagged" | "published" | "rejected";
  lesson: { title: string; sections: { heading: string; body: string }[]; keyFacts: string[] };
  sources: { publisher?: string; title?: string; url: string }[];
  created_at: string;
  published_at: string | null;
}

export type GeneratedLessonResult =
  | { status: "ok"; row: GeneratedLessonRow }
  | { status: "signedOut" | "notFound" | "unavailable" | "error" };

/** Read one generated lesson with the user's own session (RLS: own pending/flagged or published). */
export async function getGeneratedLesson(id: string): Promise<GeneratedLessonResult> {
  if (!/^gen_[a-z0-9]{8,16}$/.test(id)) return { status: "notFound" };
  const supabase = await createClient();
  if (!supabase) return { status: "unavailable" };
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claims?.claims?.sub) return { status: "signedOut" };
  const { data, error } = await supabase.from("generated_lessons").select(GENERATED_LESSON_COLUMNS).eq("id", id).maybeSingle();
  if (error) return { status: isMissingTableError(error, "generated_lessons") ? "unavailable" : "error" };
  if (!data) return { status: "notFound" };
  return { status: "ok", row: data as unknown as GeneratedLessonRow };
}

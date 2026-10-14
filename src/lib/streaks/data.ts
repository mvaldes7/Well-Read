import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_TABLE, computeStreaks, isMissingTableError } from "./streaks.mjs";

export type StreakResult =
  | { status: "ok"; current: number; best: number; activeToday: boolean }
  | { status: "unavailable" } // activity_log not migrated yet, or the read failed
  | { status: "signedOut" };

/** Upper bound on rows read per request (newest first); ~years of daily use. */
const MAX_ROWS = 5000;

/**
 * The signed-in user's streaks from activity_log (RLS: own rows only). Never throws.
 * Missing table (migration not applied) or any error -> "unavailable", never a crash.
 * Cached per request so the dashboard and the sidebar share one query.
 */
export const getMyStreak = cache(async (): Promise<StreakResult> => {
  try {
    const supabase = await createClient();
    if (!supabase) return { status: "unavailable" };
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (claimsError || typeof userId !== "string" || !userId) return { status: "signedOut" };
    const { data, error } = await supabase
      .from(ACTIVITY_TABLE)
      .select("occurred_at")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(MAX_ROWS);
    if (error) {
      if (!isMissingTableError(error)) console.error(`activity_log read failed (${error.code ?? "unknown"})`);
      return { status: "unavailable" };
    }
    const instants = (data ?? []).map((r: { occurred_at?: unknown }) => (typeof r.occurred_at === "string" ? r.occurred_at : null));
    return { status: "ok", ...computeStreaks(instants) };
  } catch (err) {
    unstable_rethrow(err);
    console.error("activity_log read failed (exception)");
    return { status: "unavailable" };
  }
});

export const STREAK_UNAVAILABLE = "Not available yet";

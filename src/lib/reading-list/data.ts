import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { READING_LIST_TABLE, groupItems, isMissingTableError, type Item, type Status } from "./logic.mjs";

export type ReadingListResult =
  | { status: "ok"; groups: Record<Status, Item[]> }
  | { status: "unavailable" }
  | { status: "signedOut" }
  | { status: "error" };

export const ITEM_COLUMNS = "id, title, kind, url, status, created_at, completed_at";

/**
 * The signed-in user's reading list, read with their cookie-based session (RLS; no service role).
 * Until the reading_list_items migration is applied the table is missing: "unavailable".
 * Never throws.
 */
export const getMyReadingList = cache(async (): Promise<ReadingListResult> => {
  try {
    const supabase = await createClient();
    if (!supabase) return { status: "error" };
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (claimsError || typeof userId !== "string" || !userId) return { status: "signedOut" };

    const { data, error } = await supabase.from(READING_LIST_TABLE).select(ITEM_COLUMNS).eq("user_id", userId).limit(1000);
    if (error) {
      if (isMissingTableError(error)) return { status: "unavailable" };
      console.error(`reading_list_items read failed (${error.code ?? "unknown"})`);
      return { status: "error" };
    }
    return { status: "ok", groups: groupItems(data ?? []) };
  } catch (err) {
    unstable_rethrow(err);
    console.error("reading_list_items read failed (exception)");
    return { status: "error" };
  }
});

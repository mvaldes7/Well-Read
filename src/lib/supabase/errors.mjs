// @ts-check
// Shared Supabase error classification (pure). Used by streaks (activity_log) and the reading
// list (reading_list_items) so code can ship before its migration is applied.

/**
 * True when a PostgREST/Postgres error means "this table doesn't exist" (migration not applied):
 * PGRST205 (table not in PostgREST's schema cache) or 42P01 (undefined_table). When the error
 * has a message it must name the table, so unrelated errors aren't mistaken for it.
 * The table is required: each caller names the one it queried.
 * @param {{ code?: string | null, message?: string | null } | null | undefined} error
 * @param {string} table
 */
export function isMissingTableError(error, table) {
  if (!error || (error.code !== "PGRST205" && error.code !== "42P01")) return false;
  return typeof error.message !== "string" || error.message === "" || error.message.includes(table);
}

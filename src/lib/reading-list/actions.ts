"use server";

import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/errors.mjs";
import { MESSAGES, READING_LIST_TABLE, isStatus, parseItemId, validateNewItem } from "./logic.mjs";

export interface AddItemState {
  status: "idle" | "added" | "error";
  message?: string;
  fieldErrors?: { title?: string; kind?: string; url?: string };
  /** Echoed back so a failed submit keeps what was typed. */
  values?: { title: string; kind: string; url: string };
  /** Bumped on success so the form resets. */
  nonce?: number;
}

export interface ItemActionState {
  status: "idle" | "done" | "error";
  message?: string;
}

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/**
 * The user's session client, after re-checking auth (a server action is a public endpoint;
 * the proxy alone isn't enough). Returns an error message instead when that fails.
 */
async function sessionClient() {
  const supabase = await createClient();
  if (!supabase) return { error: MESSAGES.notConfigured } as const;
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string" || !userId) return { error: MESSAGES.signedOut } as const;
  return { supabase } as const;
}

const writeError = (error: { code?: string | null; message?: string | null }, what: string) => {
  if (isMissingTableError(error, READING_LIST_TABLE)) return MESSAGES.unavailable;
  console.error(`reading_list_items ${what} failed (${error.code ?? "unknown"})`);
  return MESSAGES.saveFailed;
};

/** Add an item. user_id is never taken from the client: the column defaults to auth.uid() and RLS checks it. */
export async function addItem(_prev: AddItemState, formData: FormData): Promise<AddItemState> {
  const values = { title: str(formData.get("title")), kind: str(formData.get("kind")), url: str(formData.get("url")) };
  const v = validateNewItem(values);
  if (!v.ok) return { status: "error", message: "Check the highlighted fields.", fieldErrors: v.errors, values };
  try {
    const s = await sessionClient();
    if ("error" in s) return { status: "error", message: s.error, values };
    const { error } = await s.supabase.from(READING_LIST_TABLE).insert(v.value);
    if (error) return { status: "error", message: writeError(error, "insert"), values };
  } catch (err) {
    unstable_rethrow(err);
    console.error("reading_list_items insert failed (exception)");
    return { status: "error", message: MESSAGES.saveFailed, values };
  }
  refresh();
  return { status: "added", message: `Added “${v.value.title}”.`, nonce: Date.now() };
}

/** Move an item to another status. Scoped by id; RLS makes other users' rows invisible (0 rows -> not found). */
export async function moveItem(_prev: ItemActionState, formData: FormData): Promise<ItemActionState> {
  const id = parseItemId(formData.get("id"));
  const to = formData.get("to");
  if (!id || !isStatus(to)) return { status: "error", message: MESSAGES.saveFailed };
  try {
    const s = await sessionClient();
    if ("error" in s) return { status: "error", message: s.error };
    // completed_at is set/cleared by the database trigger, never sent from here.
    const { data, error } = await s.supabase.from(READING_LIST_TABLE).update({ status: to }).eq("id", id).select("id");
    if (error) return { status: "error", message: writeError(error, "update") };
    if (!data?.length) return { status: "error", message: MESSAGES.notFound };
  } catch (err) {
    unstable_rethrow(err);
    console.error("reading_list_items update failed (exception)");
    return { status: "error", message: MESSAGES.saveFailed };
  }
  refresh();
  return { status: "done" };
}

/** Delete an item (after the confirm dialog). Scoped by id; RLS enforces ownership. */
export async function deleteItem(_prev: ItemActionState, formData: FormData): Promise<ItemActionState> {
  const id = parseItemId(formData.get("id"));
  if (!id) return { status: "error", message: MESSAGES.saveFailed };
  try {
    const s = await sessionClient();
    if ("error" in s) return { status: "error", message: s.error };
    const { data, error } = await s.supabase.from(READING_LIST_TABLE).delete().eq("id", id).select("id");
    if (error) return { status: "error", message: writeError(error, "delete") };
    if (!data?.length) return { status: "error", message: MESSAGES.notFound };
  } catch (err) {
    unstable_rethrow(err);
    console.error("reading_list_items delete failed (exception)");
    return { status: "error", message: MESSAGES.saveFailed };
  }
  refresh();
  return { status: "done" };
}

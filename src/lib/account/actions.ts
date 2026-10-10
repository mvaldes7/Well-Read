"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateNames } from "./names.mjs";

export interface AccountFormState {
  status: "idle" | "saved" | "error";
  message?: string;
  firstName?: string;
  lastName?: string;
  fieldErrors?: { first_name?: string; last_name?: string };
}

export async function updateName(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const rawFirst = formData.get("first_name");
  const rawLast = formData.get("last_name");
  const refill = {
    firstName: typeof rawFirst === "string" ? rawFirst : "",
    lastName: typeof rawLast === "string" ? rawLast : "",
  };
  const names = validateNames(rawFirst, rawLast);
  if (!names.ok) return { status: "error", message: "Check the highlighted fields.", fieldErrors: names.errors, ...refill };

  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Accounts aren't configured on this server.", ...refill };

  // Re-check auth here: a server action is a public endpoint, the proxy alone isn't enough.
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claims?.claims?.sub) return { status: "error", message: "Your session has ended. Sign in again.", ...refill };

  const { error } = await supabase.auth.updateUser({ data: names.data });
  if (error) return { status: "error", message: "Couldn't save your name. Please try again.", ...refill };

  // The header reads the name from the JWT claims, which only change when a new access
  // token is issued. Refresh the session so the header shows the new name right away.
  // If that fails the name is still saved and appears at the next token refresh.
  await supabase.auth.refreshSession().catch(() => undefined);
  refresh();
  return { status: "saved", message: "Saved.", firstName: names.data.first_name, lastName: names.data.last_name };
}

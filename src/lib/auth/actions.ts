"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateNames } from "@/lib/account/names.mjs";
import {
  LOGIN_PATH,
  MESSAGES,
  authErrorMessage,
  safeNextPath,
  validateCredentials,
} from "./logic.mjs";

export interface AuthFormState {
  error?: string;
  message?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  fieldErrors?: { first_name?: string; last_name?: string };
}

function readForm(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  return {
    email: typeof email === "string" ? email.trim() : "",
    password: typeof password === "string" ? password : "",
    next: safeNextPath(formData.get("next")),
  };
}

// Credentials are never logged or echoed back (only the email is returned to refill the field).

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password, next } = readForm(formData);
  const invalid = validateCredentials(email, password);
  if (invalid) return { error: invalid, email };

  const supabase = await createClient();
  if (!supabase) return { error: authErrorMessage("not_configured", "signin"), email };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authErrorMessage(error.code, "signin", error.status), email };

  redirect(next);
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password } = readForm(formData);
  const rawFirst = formData.get("first_name");
  const rawLast = formData.get("last_name");
  const refill = {
    email,
    firstName: typeof rawFirst === "string" ? rawFirst : "",
    lastName: typeof rawLast === "string" ? rawLast : "",
  };
  const names = validateNames(rawFirst, rawLast);
  if (!names.ok) return { error: "Check the highlighted fields.", fieldErrors: names.errors, ...refill };
  const invalid = validateCredentials(email, password);
  if (invalid) return { error: invalid, ...refill };

  const supabase = await createClient();
  if (!supabase) return { error: authErrorMessage("not_configured", "signup"), ...refill };

  // Names go into user_metadata: display only, never used for authorization.
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: names.data } });
  if (error) return { error: authErrorMessage(error.code, "signup", error.status), ...refill };

  // With email confirmation on, Supabase returns no session until the link is clicked.
  if (!data.session) return { message: MESSAGES.checkEmail };
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}

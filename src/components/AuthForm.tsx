"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import type { AuthFormState } from "@/lib/auth/actions";

interface Props {
  mode: "signin" | "signup";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}

export default function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const next = useSearchParams().get("next") ?? "";
  const isSignIn = mode === "signin";

  if (state.message) {
    return (
      <p role="status" className="notice">
        {state.message} <Link href="/login">Go to sign in</Link>
      </p>
    );
  }

  return (
    <form action={formAction} className="auth-form">
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      {isSignIn && <input type="hidden" name="next" value={next} />}
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email ?? ""}
      />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete={isSignIn ? "current-password" : "new-password"}
        required
      />
      <button type="submit" disabled={pending}>
        {pending ? "Please wait…" : isSignIn ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}

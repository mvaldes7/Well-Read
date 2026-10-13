"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type ForgotState } from "@/lib/auth/reset-actions";
import { RESET_MESSAGES } from "@/lib/auth/reset.mjs";

export default function ForgotForm() {
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(requestPasswordReset, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div role="status" className="notice">
        <p>{state.message}</p>
        <p className="muted">{RESET_MESSAGES.neutralHint}</p>
        <p>
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="auth-form">
      <p className="muted center">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      {state.status === "error" && state.message && (
        <p role="alert" className="error">
          {state.message}
        </p>
      )}
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email ?? ""} />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Please wait…" : "Send reset link"}
      </button>
    </form>
  );
}

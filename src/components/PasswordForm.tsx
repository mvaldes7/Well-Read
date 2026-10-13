"use client";

import { useActionState } from "react";
import type { PasswordFormState } from "@/lib/auth/reset-actions";
import { PASSWORD_MIN } from "@/lib/auth/reset.mjs";

interface Props {
  /** "reset": recovery link (no current password). "change": signed-in account page. */
  mode: "reset" | "change";
  action: (prev: PasswordFormState, formData: FormData) => Promise<PasswordFormState>;
}

function Field({ id, label, autoComplete, error }: { id: string; label: string; autoComplete: string; error?: string }) {
  const errId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type="password"
        autoComplete={autoComplete}
        required
        minLength={id === "current" ? undefined : PASSWORD_MIN}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
      />
      {error && (
        <p id={errId} className="error field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export default function PasswordForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState<PasswordFormState, FormData>(action, { status: "idle" });
  const fe = state.fieldErrors ?? {};
  return (
    // key: clear the password inputs after each result.
    <form action={formAction} className="auth-form" key={`${state.status}:${state.message ?? ""}`}>
      {state.status === "error" && state.message && (
        <p role="alert" className="error">
          {state.message}
        </p>
      )}
      {mode === "change" && <Field id="current" label="Current password" autoComplete="current-password" error={fe.current} />}
      <Field id="password" label="New password" autoComplete="new-password" error={fe.password} />
      <Field id="confirm" label="Confirm new password" autoComplete="new-password" error={fe.confirm} />
      <p className="muted hint">At least {PASSWORD_MIN} characters.</p>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Saving…" : mode === "reset" ? "Set new password" : "Change password"}
      </button>
      {mode === "change" && (
        <p role="status" className="save muted">
          {state.status === "saved" ? state.message : ""}
        </p>
      )}
    </form>
  );
}

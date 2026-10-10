"use client";

import { useActionState } from "react";
import NameFields from "@/components/NameFields";
import { updateName, type AccountFormState } from "@/lib/account/actions";

interface Props {
  firstName: string;
  lastName: string;
}

export default function AccountForm({ firstName, lastName }: Props) {
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(updateName, {
    status: "idle",
    firstName,
    lastName,
  });
  return (
    <form action={formAction} className="auth-form">
      {state.status === "error" && state.message && (
        <p role="alert" className="error">
          {state.message}
        </p>
      )}
      {/* key: remount the inputs with the saved values after each result. */}
      <NameFields key={`${state.status}:${state.firstName}:${state.lastName}`} firstName={state.firstName} lastName={state.lastName} errors={state.fieldErrors} />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      <p role="status" className="save muted">
        {state.status === "saved" ? state.message : ""}
      </p>
    </form>
  );
}

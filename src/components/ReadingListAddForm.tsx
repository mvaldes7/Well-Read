"use client";

import { useActionState } from "react";
import { addItem, type AddItemState } from "@/lib/reading-list/actions";
import { KINDS, TITLE_MAX, URL_MAX } from "@/lib/reading-list/logic.mjs";

export default function ReadingListAddForm() {
  const [state, formAction, pending] = useActionState<AddItemState, FormData>(addItem, { status: "idle" });
  const e = state.fieldErrors ?? {};
  const v = state.status === "error" ? state.values : undefined;
  return (
    // key: a successful add remounts the form, clearing it; a failed one keeps what was typed.
    <form key={state.nonce ?? 0} action={formAction} className="rl-form" noValidate>
      <div className="rl-fields">
        <div className="rl-field rl-title">
          <label htmlFor="rl-title">Title</label>
          <input
            id="rl-title"
            name="title"
            required
            maxLength={TITLE_MAX}
            placeholder="Add a book, article, poem…"
            defaultValue={v?.title}
            aria-invalid={e.title ? true : undefined}
            aria-describedby={e.title ? "rl-title-err" : undefined}
          />
          {e.title && <p id="rl-title-err" className="field-error error">{e.title}</p>}
        </div>
        <div className="rl-field rl-kind">
          <label htmlFor="rl-kind">Type</label>
          <select id="rl-kind" name="kind" defaultValue={v?.kind || "book"} aria-invalid={e.kind ? true : undefined} aria-describedby={e.kind ? "rl-kind-err" : undefined}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          {e.kind && <p id="rl-kind-err" className="field-error error">{e.kind}</p>}
        </div>
        <div className="rl-field rl-url">
          <label htmlFor="rl-url">Link (optional)</label>
          <input
            id="rl-url"
            name="url"
            type="url"
            inputMode="url"
            maxLength={URL_MAX}
            placeholder="https://…"
            defaultValue={v?.url}
            aria-invalid={e.url ? true : undefined}
            aria-describedby={e.url ? "rl-url-err" : undefined}
          />
          {e.url && <p id="rl-url-err" className="field-error error">{e.url}</p>}
        </div>
        <button type="submit" className="btn rl-add" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state.status === "error" && state.message && !Object.keys(e).length && (
        <p role="alert" className="error">{state.message}</p>
      )}
      <p role="status" className="rl-status muted">
        {state.status === "added" ? state.message : ""}
      </p>
    </form>
  );
}

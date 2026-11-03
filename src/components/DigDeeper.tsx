"use client";

import Link from "next/link";
import { useState } from "react";
import { DRILLDOWN_MESSAGES } from "@/lib/drilldowns/messages.mjs";

export interface DigDeeperOption {
  id: string;
  label: string;
}

type State =
  | { status: "idle" }
  | { status: "working"; choiceId: string }
  | { status: "done"; lessonId: string; reviewStatus: string }
  | { status: "error"; message: string };

/**
 * Dig deeper (P3): 3-4 stored choices after a graded quiz, pass or fail. No free text: only a stored choice id is
 * sent, and the server re-checks it. Rendered only when the WELL_READ_DRILLDOWNS flag is on (the page decides).
 */
export default function DigDeeper({ lessonId, choices }: { lessonId: string; choices: DigDeeperOption[] }) {
  const [state, setState] = useState<State>({ status: "idle" });
  if (choices.length === 0) return null;

  async function choose(choiceId: string) {
    setState({ status: "working", choiceId });
    try {
      const res = await fetch("/api/drilldowns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId, choiceId }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok && typeof body.lessonId === "string") {
        setState({ status: "done", lessonId: body.lessonId, reviewStatus: String(body.reviewStatus) });
      } else {
        setState({ status: "error", message: typeof body?.message === "string" ? body.message : DRILLDOWN_MESSAGES.unavailable });
      }
    } catch {
      setState({ status: "error", message: DRILLDOWN_MESSAGES.unavailable });
    }
  }

  return (
    <section className="dig-deeper" aria-labelledby="dig-deeper-heading">
      <h3 id="dig-deeper-heading">Dig deeper</h3>
      <p className="muted">Pick one to get a short AI-generated follow-up lesson, checked against trusted sources.</p>
      <div className="dig-choices">
        {choices.map((c) => (
          <button
            key={c.id}
            type="button"
            className="btn-ghost dig-choice"
            disabled={state.status === "working"}
            onClick={() => choose(c.id)}
          >
            {state.status === "working" && state.choiceId === c.id ? "Writing…" : c.label}
          </button>
        ))}
      </div>
      {state.status === "working" && (
        <p role="status" className="muted">
          Writing and fact-checking your lesson. This can take up to a minute.
        </p>
      )}
      {state.status === "done" && (
        <p role="status">
          Your lesson is ready: <Link href={`/dig?id=${state.lessonId}`}>open it</Link>.
          {state.reviewStatus === "flagged" && " One claim couldn't be confirmed and is marked for review."}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="error">
          {state.message}
        </p>
      )}
    </section>
  );
}

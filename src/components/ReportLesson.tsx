"use client";

import { useActionState, useState } from "react";
import { reportLesson, type ReportState } from "@/lib/drilldowns/report-actions";

/** Report button for a generated lesson. Inserts into lesson_reports (no select after the insert); RLS limits it to visible lessons. */
export default function ReportLesson({ lessonId }: { lessonId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ReportState, FormData>(reportLesson, { status: "idle" });
  if (state.status === "done") return <p role="status" className="muted report-done">{state.message}</p>;
  if (!open) {
    return (
      <button type="button" className="btn-ghost report-open" onClick={() => setOpen(true)}>
        Report a problem
      </button>
    );
  }
  return (
    <form action={action} className="report-form">
      <input type="hidden" name="lessonId" value={lessonId} />
      <label>
        What&apos;s wrong with this lesson?
        <textarea name="reason" required maxLength={500} rows={3} />
      </label>
      {state.status === "error" && (
        <p role="alert" className="error">
          {state.message}
        </p>
      )}
      <button type="submit" className="btn submit" disabled={pending}>
        {pending ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}

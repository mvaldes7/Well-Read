"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const LABELS = { publish: "Publish", reject: "Reject", unpublish: "Unpublish", clear_report: "Clear report" } as const;
const CONFIRM: Partial<Record<keyof typeof LABELS, string>> = {
  reject: "Reject this lesson? It will never be shared.",
  unpublish: "Unpublish this lesson? It will be hidden from everyone and its open reports closed.",
};
type Action = keyof typeof LABELS;

/** Owner review buttons (P4). POSTs { lessonId, action } to the same-origin review route, then refreshes the list. */
export default function ReviewActions({ lessonId, actions }: { lessonId: string; actions: Action[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  async function run(action: Action) {
    const confirmText = CONFIRM[action];
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/drilldowns/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId, action }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) setMessage(body?.code === "not_allowed" ? "That action isn't allowed for this lesson any more." : "That didn't work. Reload and try again.");
      else startTransition(() => router.refresh());
    } catch {
      setMessage("That didn't work. Reload and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="review-actions">
      {actions.map((a) => (
        <button key={a} type="button" className={a === "publish" ? "btn" : "btn-ghost"} disabled={busy} onClick={() => run(a)}>
          {LABELS[a]}
        </button>
      ))}
      {message && <p role="alert" className="error">{message}</p>}
    </div>
  );
}

"use client";
// Small diagnostics line on Account: which reminder service worker version this device runs,
// and when it last handled a reminder tap. No ids, endpoints or keys.
import { useEffect, useState } from "react";

type Status = { version: string; lastTapAt: number | null } | "none" | "loading";

function formatTap(at: number) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at) + " PT";
}

export default function ReminderWorkerStatus() {
  const [status, setStatus] = useState<Status>("loading");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/") : undefined;
        await reg?.update().catch(() => undefined);
        const worker = reg?.active;
        if (!worker) { if (!cancelled) setStatus("none"); return; }
        const channel = new MessageChannel();
        const reply = new Promise<Status>(resolve => {
          channel.port1.onmessage = e => resolve({ version: String(e.data?.version ?? "old"), lastTapAt: e.data?.lastTapAt ?? null });
          setTimeout(() => resolve({ version: "old (no version)", lastTapAt: null }), 1500);
        });
        worker.postMessage({ type: "well-read:sw-version" }, [channel.port2]);
        const result = await reply;
        if (!cancelled) setStatus(result);
      } catch { if (!cancelled) setStatus("none"); }
    })();
    return () => { cancelled = true; };
  }, []);
  if (status === "loading") return null;
  return <p className="muted" data-testid="reminder-worker-status">
    {status === "none" ? "Reminder helper: not installed on this device."
      : `Reminder helper ${status.version}${status.lastTapAt ? ` · last tap ${formatTap(status.lastTapAt)}` : ""}`}
  </p>;
}

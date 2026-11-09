"use client";

import { useSyncExternalStore, useState } from "react";
import { setLessonReminder } from "@/lib/reminders/actions";
import ReminderWorkerStatus from "@/components/ReminderWorkerStatus";

const subscribeSupport = () => () => {};
const browserSupport = () => window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const serverSupport = () => false;

export default function LessonReminder({ enabled, available, publicKey, loadFailed }: {
  enabled: boolean; available: boolean; publicKey: string | null; loadFailed: boolean;
}) {
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const supported = useSyncExternalStore(subscribeSupport, browserSupport, serverSupport);
  const [message, setMessage] = useState("");


  async function toggle(forceOff = false) {
    setBusy(true); setMessage("");
    let created: PushSubscription | null = null;
    try {
      if (on || forceOff) {
        const result = await setLessonReminder(false);
        if (result.error) { setMessage(result.error); return; }
        setOn(false); setMessage("Daily reminders are off for your account.");
        // Saving Off comes first: browser cleanup failure must not keep account reminders on.
        try {
          const reg = await navigator.serviceWorker?.getRegistration("/");
          await (await reg?.pushManager.getSubscription())?.unsubscribe();
        } catch { /* Account is already off. */ }
      } else {
        if (!publicKey || !available || !supported) return;
        // Permission is requested only in response to an explicit user gesture.
        if (await Notification.requestPermission() !== "granted") {
          setMessage("Notifications are blocked or not allowed. Check browser settings; on iPhone/iPad, add Well-Read to your Home Screen first.");
          return;
        }
        await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        const sub = existing ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        if (!existing) created = sub;
        const json = sub.toJSON();
        const result = await setLessonReminder(true, { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth });
        if (result.error) {
          await created?.unsubscribe();
          setMessage(result.error); return;
        }
        setOn(true);
      }
    } catch {
      await created?.unsubscribe().catch(() => undefined);
      setMessage("Couldn't change reminders. Try again. On iPhone/iPad, open Well-Read from your Home Screen.");
    } finally { setBusy(false); }
  }

  return <section className="account-section" aria-labelledby="reminder-heading">
    <h2 id="reminder-heading">Daily lesson reminder</h2>
    <p id="reminder-help">At most one reminder per day, only if you haven&apos;t passed a lesson quiz that day. Days use Pacific time (America/Los_Angeles). Turning on uses this device; turning off stops reminders for your whole account.</p>
    {!available && <p className="muted">New reminder opt-ins aren&apos;t available on this server yet.</p>}
    {available && !supported && <p className="muted">This browser doesn&apos;t support Web Push here. On iPhone/iPad, add Well-Read to your Home Screen and open it there.</p>}
    <label><input type="checkbox" role="switch" aria-describedby="reminder-help" checked={on}
      disabled={busy || loadFailed || (!on && (!available || !supported))} onChange={() => toggle()} /> Daily reminder {on ? "on" : "off"}</label>
    {loadFailed && <p>Couldn&apos;t load your reminder setting. Refresh to check it, or <button type="button" disabled={busy} onClick={() => toggle(true)}>Turn reminders off</button>.</p>}
    <p role="status" aria-live="polite">{message}</p>
    {supported && <ReminderWorkerStatus />}
  </section>;
}

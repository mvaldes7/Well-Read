"use client";
// Sends the app to /learn after a lesson-reminder tap (see public/sw.js), and keeps the service
// worker current. iOS Home Screen apps resume without a page load, so the browser never checks
// for a new sw.js on its own; we ask for an update whenever the app becomes visible.
import { useEffect } from "react";

const TAP_CACHE = "well-read-reminder-tap";
const TAP_KEY = "/__reminder-tap";
const FRESH_MS = 60_000;
const UPDATE_EVERY_MS = 60_000;
const MARKER_RETRY_MS = [0, 400, 1200, 2500];

function goToLearn() {
  // Full navigation on purpose: works even if React/the router isn't ready on an iOS resume.
  if (window.location.pathname !== "/learn") window.location.assign(new URL("/learn", window.location.origin).href);
}

async function tapMarkerIsFresh() {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(TAP_CACHE);
    const hit = await cache.match(TAP_KEY);
    if (!hit) return false;
    await cache.delete(TAP_KEY);
    const at = Number(await hit.text());
    return Number.isFinite(at) && Date.now() - at < FRESH_MS;
  } catch { return false; }
}

export default function ReminderTapListener() {
  useEffect(() => {
    const sw = "serviceWorker" in navigator ? navigator.serviceWorker : undefined;
    let lastUpdate = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const updateWorker = async () => {
      if (!sw || Date.now() - lastUpdate < UPDATE_EVERY_MS) return;
      lastUpdate = Date.now();
      try { await (await sw.getRegistration("/"))?.update(); } catch { /* offline or unsupported */ }
    };
    const checkMarker = () => {
      for (const ms of MARKER_RETRY_MS) timers.push(setTimeout(() => {
        void tapMarkerIsFresh().then(fresh => { if (fresh) goToLearn(); });
      }, ms));
    };
    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      checkMarker();
      void updateWorker();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin && event.origin !== window.location.origin) return;
      if (event.data?.type === "well-read:open-learn") goToLearn();
    };

    sw?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("focus", onShow);
    onShow();
    return () => {
      timers.forEach(clearTimeout);
      sw?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, []);
  return null;
}

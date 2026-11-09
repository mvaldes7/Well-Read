"use client";
// Sends the app to /learn after a lesson-reminder tap (see public/sw.js). Needed because
// iOS Home Screen apps can resume on their last page and ignore the service worker's navigate().
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const TAP_CACHE = "well-read-reminder-tap";
const TAP_KEY = "/__reminder-tap";
const FRESH_MS = 60_000;

async function tapMarkerIsFresh() {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(TAP_CACHE);
    const hit = await cache.match(TAP_KEY);
    if (!hit) return false;
    await cache.delete(TAP_KEY);
    const at = Number(await hit.text());
    return Number.isFinite(at) && Date.now() - at < FRESH_MS;
  } catch { return false; /* best effort */ }
}

export default function ReminderTapListener() {
  const router = useRouter();
  useEffect(() => {
    const goToLearn = () => { if (window.location.pathname !== "/learn") router.push("/learn"); };
    const consumeTapMarker = async () => { if (await tapMarkerIsFresh()) goToLearn(); };
    const sw = navigator.serviceWorker;
    const onMessage = (event: MessageEvent) => {
      if (event.origin && event.origin !== window.location.origin) return;
      if (event.data?.type === "well-read:open-learn") { void caches?.delete?.(TAP_CACHE); goToLearn(); }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void consumeTapMarker(); };
    sw?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    void consumeTapMarker();
    return () => {
      sw?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [router]);
  return null;
}

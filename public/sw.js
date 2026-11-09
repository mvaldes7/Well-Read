// Push only: no offline/authenticated-content cache. The one cache entry below holds a
// timestamp ("a reminder was just tapped"), never page content.
// Bump on every sw.js change. Shown on the Account page so a phone's running version can be checked.
const SW_VERSION = "2026-11-09.4";
const TAP_CACHE = "well-read-reminder-tap";
const TAP_KEY = "/__reminder-tap";
const LAST_TAP_KEY = "/__reminder-last-tap"; // diagnostics only: when this worker last handled a tap
const LEARN = "/learn";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  // Declarative Web Push (Safari 18.4+): the browser already has a proposed notification whose
  // tap opens /learn natively. Replacing it would bring back the notificationclick path that iOS
  // Home Screen apps ignore, so leave it alone; the browser shows it if we don't.
  if (event.notification) return;
  // Other browsers: fixed, privacy-preserving text and destination. Never trust a payload URL.
  event.waitUntil(self.registration.showNotification("Well-Read", {
    body: "Take a moment to learn a lesson.", icon: "/icons/well-read-192.png",
    tag: "daily-lesson-reminder", data: { url: LEARN },
  }));
});

// A tap must always end on /learn, whether the app is closed, open on another page, or a
// resumed iOS Home Screen app. iOS can bring the app back on its last page (Account) and
// WindowClient.navigate() can reject or resolve null there, so we use three paths:
// 1. focus an open window, then navigate it; 2. also tell the page to go to /learn itself;
// 3. leave a short-lived "tapped" marker the page checks when it shows. Otherwise open /learn.
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(LEARN, self.location.origin).href;
  event.waitUntil((async () => {
    try {
      const cache = await self.caches.open(TAP_CACHE);
      const now = String(Date.now());
      await cache.put(TAP_KEY, new Response(now));
      await cache.put(LAST_TAP_KEY, new Response(now));
    } catch { /* marker is best effort */ }
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = windows.find(c => new URL(c.url).origin === self.location.origin);
    if (!client) { await self.clients.openWindow(target); return; }
    try { await client.focus(); } catch { /* focus can fail without blocking navigation */ }
    client.postMessage({ type: "well-read:open-learn" });
    let navigated = null;
    try { if ("navigate" in client) navigated = await client.navigate(target); } catch { navigated = null; }
    if (!navigated && new URL(client.url).pathname !== LEARN) {
      // The page's own listener handles it; openWindow is the last resort if no page answers.
      try { await self.clients.openWindow(target); } catch { /* the page listener still runs */ }
    }
  })());
});

// Diagnostics for the Account page: version and last handled tap time. No ids, endpoints or keys.
self.addEventListener("message", event => {
  if (event.data?.type !== "well-read:sw-version" || !event.ports?.[0]) return;
  const port = event.ports[0];
  event.waitUntil((async () => {
    let lastTapAt = null;
    try {
      const hit = await (await self.caches.open(TAP_CACHE)).match(LAST_TAP_KEY);
      if (hit) lastTapAt = Number(await hit.text()) || null;
    } catch { /* best effort */ }
    port.postMessage({ version: SW_VERSION, lastTapAt });
  })());
});

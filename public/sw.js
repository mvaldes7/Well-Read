// Push only: no offline/authenticated-content cache. The one cache entry below holds a
// timestamp ("a reminder was just tapped"), never page content.
const TAP_CACHE = "well-read-reminder-tap";
const TAP_KEY = "/__reminder-tap";
const LEARN = "/learn";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  // Fixed, privacy-preserving text and destination. Never trust a payload URL.
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
      await cache.put(TAP_KEY, new Response(String(Date.now())));
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
